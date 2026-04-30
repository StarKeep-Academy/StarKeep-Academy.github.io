"""
apps/avatar/views.py

GET   /avatars/{id}            → full Image 7 profile
PATCH /avatars/{id}            → update alias, display_name, purpose, paths (owner only)
GET   /avatars/{id}/archetype  → get archetype profile (user auth)
POST  /avatars/{id}/archetype  → sync quiz results (HMAC + integration token — no user auth)
"""

import hashlib
import hmac
import json

from django.conf import settings
from django.utils.dateparse import parse_datetime
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework import status

from .models import Avatar, ArchetypeProfile
from .serializers import AvatarFullSerializer, AvatarUpdateSerializer, ArchetypeProfileSerializer
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
        if not self._verify_integration_token(request):
            return Response(
                {"data": None, "errors": {"title": "Unauthorized", "status": 401, "detail": "Invalid integration token."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        body = request.body
        if not self._verify_hmac(request, body):
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

        avatar  = _get_avatar_or_404(avatar_id)
        results = payload.get("results", {})

        completed_at = None
        if payload.get("completed_at"):
            completed_at = parse_datetime(payload["completed_at"])

        profile, created = ArchetypeProfile.objects.get_or_create(avatar=avatar)
        profile.sun_sign                  = results.get("sun_sign",    "")
        profile.moon_sign                 = results.get("moon_sign",   "")
        profile.rising_sign               = results.get("rising_sign", "")
        profile.jung_archetype            = results.get("jung_archetype", "")
        profile.mbti                      = results.get("mbti",           "")
        profile.recommended_heroic_path   = results.get("recommended_heroic_path",   "")
        profile.recommended_learning_path = results.get("recommended_learning_path", "")
        profile.purpose_seed              = results.get("purpose_seed", "")
        profile.quiz_run_id               = payload.get("quiz_run_id", "")
        profile.quiz_version              = payload.get("version",     "1.0")
        profile.completed_at              = completed_at
        profile.raw_quiz_output           = payload
        profile.save()

        # Pre-fill avatar paths from quiz recommendation if not already set (DEC-012)
        changed = False
        if not avatar.heroic_path and results.get("recommended_heroic_path"):
            avatar.heroic_path = results["recommended_heroic_path"]
            changed = True
        if not avatar.learning_path and results.get("recommended_learning_path"):
            avatar.learning_path = results["recommended_learning_path"]
            changed = True
        if not avatar.purpose and results.get("purpose_seed"):
            avatar.purpose = results["purpose_seed"]
            changed = True
        if changed:
            avatar.save()

        archetype_updated.send(sender=ArchetypeProfile, instance=profile, avatar=avatar)

        return Response(
            {"data": ArchetypeProfileSerializer(profile).data, "errors": None},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    # ── Auth helpers ─────────────────────────────────────────────────────────

    def _verify_integration_token(self, request) -> bool:
        token = getattr(settings, "QUIZ_INTEGRATION_TOKEN", "")
        if not token:
            return False
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        return auth_header == f"Bearer {token}"

    def _verify_hmac(self, request, body: bytes) -> bool:
        secret = getattr(settings, "QUIZ_REPO_WEBHOOK_SECRET", "")
        if not secret:
            return False
        sig_header = request.META.get("HTTP_X_QUIZ_SIGNATURE", "")
        if not sig_header.startswith("sha256="):
            return False
        computed = "sha256=" + hmac.new(
            secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(sig_header, computed)
