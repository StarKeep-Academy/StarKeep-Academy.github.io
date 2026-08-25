"""
apps/avatar/views.py

GET   /avatars/{id}            → full Image 7 profile
PATCH /avatars/{id}            → update alias, display_name, purpose, paths (owner only)
GET   /avatars/{id}/archetype  → get archetype profile (user auth)
POST  /avatars/{id}/archetype  → sync quiz results (HMAC + integration token — no user auth)
"""

import json

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework import status

from apps.common.integration_security import verify_hmac, verify_integration_token

from .metadata import CHART_SIGN_FIELDS
from .models import Avatar, ArchetypeProfile
from .serializers import (
    AvatarFullSerializer,
    AvatarUpdateSerializer,
    ArchetypePayloadSerializer,
    ArchetypeProfileSerializer,
)
from .signals import archetype_updated


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_avatar_or_404(avatar_id: str) -> Avatar:
    try:
        return Avatar.objects.select_related("archetype").get(pk=avatar_id)
    except Avatar.DoesNotExist:
        raise NotFound("Avatar not found.")


# ─── Avatar Detail ────────────────────────────────────────────────────────────

class AvatarDetailView(APIView):
    """GET + PATCH /avatars/{id}"""
    permission_classes = [IsAuthenticated]

    def get(self, request, avatar_id):
        avatar = _get_avatar_or_404(avatar_id)
        return Response({"data": AvatarFullSerializer(avatar).data, "errors": None})

    def patch(self, request, avatar_id):
        avatar = _get_avatar_or_404(avatar_id)
        if str(avatar.user_id) != str(request.user.id):
            return Response(
                {"data": None, "errors": {"title": "Forbidden", "status": 403, "detail": "You may only edit your own avatar."}},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = AvatarUpdateSerializer(avatar, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        avatar.refresh_from_db()
        return Response({"data": AvatarFullSerializer(avatar).data, "errors": None})


# ─── Archetype Endpoint ───────────────────────────────────────────────────────

class ArchetypeView(APIView):
    """
    GET  /avatars/{id}/archetype — returns archetype profile (user JWT)
    POST /avatars/{id}/archetype — receives quiz results (integration token + HMAC)
    """

    def get_permissions(self):
        if self.request.method == "POST":
            return []  # POST auth handled manually below
        return [IsAuthenticated()]

    def get_authenticators(self):
        if self.request.method == "POST":
            return []  # Skip DRF auth for webhook — token checked manually
        return super().get_authenticators()

    # ── GET ──────────────────────────────────────────────────────────────────

    def get(self, request, avatar_id):
        avatar  = _get_avatar_or_404(avatar_id)
        profile = getattr(avatar, "archetype", None)
        if profile is None:
            return Response(
                {"data": None, "errors": {"title": "Not Found", "status": 404, "detail": "Archetype quiz has not been completed."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"data": ArchetypeProfileSerializer(profile).data, "errors": None})

    # ── POST ─────────────────────────────────────────────────────────────────

    def post(self, request, avatar_id):
        if not verify_integration_token(request):
            return Response(
                {"data": None, "errors": {"title": "Unauthorized", "status": 401, "detail": "Invalid integration token."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        body = request.body
        if not verify_hmac(request, body):
            return Response(
                {"data": None, "errors": {"title": "Unauthorized", "status": 401, "detail": "HMAC signature mismatch."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return Response(
                {"data": None, "errors": {"title": "Bad Request", "status": 400, "detail": "Invalid JSON payload."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # STARKEEP_CONTEXT.md §7 — validate before write. Constrained choices
        # here are what stop a bad path slug from reaching avatar.heroic_path.
        serializer = ArchetypePayloadSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        results = validated["results"]

        avatar = _get_avatar_or_404(avatar_id)
        profile, created = ArchetypeProfile.objects.get_or_create(avatar=avatar)

        # Idempotency: the quiz may retry a delivery it never saw succeed.
        # Replaying the same run must not rewrite the profile or re-emit the
        # signal — return what we already stored.
        run_id = validated["quiz_run_id"]
        if not created and run_id and profile.quiz_run_id == run_id:
            return Response(
                {"data": ArchetypeProfileSerializer(profile).data, "errors": None},
                status=status.HTTP_200_OK,
            )

        # Every chart placement the quiz sends. Looped rather than written out
        # field by field so adding a body to CHART_SIGN_FIELDS needs no change
        # here — and so no placement can be quietly forgotten.
        for field in CHART_SIGN_FIELDS:
            setattr(profile, field, results[field])

        profile.jung_archetype            = results["jung_archetype"]
        profile.mbti                      = results["mbti"]
        profile.recommended_heroic_path   = results["recommended_heroic_path"]
        profile.recommended_learning_path = results["recommended_learning_path"]
        profile.purpose_seed              = results["purpose_seed"]
        profile.visionary_trait           = results["visionary_trait"]
        profile.divergent_trait           = results["divergent_trait"]
        profile.quiz_run_id               = run_id
        profile.quiz_version              = validated["version"]
        profile.completed_at              = validated["completed_at"]
        # Interpretive copy, size-capped on the way in (ArchetypeBreakdownsField).
        profile.breakdowns                = validated["breakdowns"]
        # §7: the quiz's own unabridged output, not our envelope around it.
        profile.raw_quiz_output           = validated["raw"]
        profile.save()

        # Pre-fill avatar paths from quiz recommendation if not already set (DEC-012)
        changed = False
        if not avatar.heroic_path and results["recommended_heroic_path"]:
            avatar.heroic_path = results["recommended_heroic_path"]
            changed = True
        if not avatar.learning_path and results["recommended_learning_path"]:
            avatar.learning_path = results["recommended_learning_path"]
            changed = True
        if not avatar.purpose and results["purpose_seed"]:
            avatar.purpose = results["purpose_seed"]
            changed = True
        if changed:
            avatar.save()

        archetype_updated.send(sender=ArchetypeProfile, instance=profile, avatar=avatar)

        return Response(
            {"data": ArchetypeProfileSerializer(profile).data, "errors": None},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
