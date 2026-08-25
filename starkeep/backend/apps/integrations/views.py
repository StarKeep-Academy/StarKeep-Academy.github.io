"""
apps/integrations/views.py

DEC-014 — Archetype quiz SSO handoff.

POST /integrations/quiz/launch    → mint a launch ticket    (user JWT)
POST /integrations/quiz/exchange  → redeem it for identity  (integration token + HMAC)

The flow, end to end:

    1. Browser  →  Starkeep   POST /integrations/quiz/launch
    2. Browser  →  Quiz       GET  {QUIZ_SSO_LAUNCH_PATH}?ticket=&return_to=
    3. Quiz srv →  Starkeep   POST /integrations/quiz/exchange     ← ticket dies here
    4. Quiz srv               upserts its own user, starts its own session
    5. ... user takes the quiz ...
    6. Quiz srv →  Starkeep   POST /avatars/{id}/archetype         (apps/avatar/views.py)
    7. Quiz     →  Browser    302 to return_to?quiz=complete

See docs/QUIZ_SSO_INTEGRATION.md for the contract handed to the quiz repo.
"""

import json
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.integration_security import verify_hmac, verify_integration_token

from .models import QuizLaunchTicket
from .serializers import QuizExchangeRequestSerializer, QuizLaunchRequestSerializer


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _error(title, http_status, detail):
    """The Starkeep error envelope, for the paths that bypass DRF's handler."""
    return Response(
        {
            "data": None,
            "errors": {
                "type": f"https://starkeep.io/errors/{http_status}",
                "title": title,
                "status": http_status,
                "detail": detail,
                "invalid_params": [],
            },
        },
        status=http_status,
    )


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _public_base() -> str:
    return settings.STARKEEP_PUBLIC_BASE_URL.rstrip("/")


# ─── Launch ──────────────────────────────────────────────────────────────────

class QuizLaunchView(APIView):
    """POST /integrations/quiz/launch — mint a single-use ticket for this user."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "quiz_launch"

    def post(self, request):
        quiz_base = getattr(settings, "QUIZ_REPO_BASE_URL", "").rstrip("/")
        if not quiz_base:
            # A misconfigured deployment should say so plainly rather than
            # handing the browser a URL that starts with "?".
            return _error(
                "Service Unavailable",
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Quiz integration is not configured (QUIZ_REPO_BASE_URL is unset).",
            )

        avatar = getattr(request.user, "avatar", None)
        if avatar is None:
            return _error(
                "Conflict",
                status.HTTP_409_CONFLICT,
                "This account has no avatar to attach quiz results to.",
            )

        serializer = QuizLaunchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return_to = serializer.validated_data["return_to"]

        # Only the newest ticket should be live. If the user bailed out of a
        # previous launch, that ticket is now a loose credential with no
        # purpose — retire it rather than leaving it redeemable.
        QuizLaunchTicket.objects.filter(
            user=request.user, consumed_at__isnull=True, expires_at__gt=timezone.now()
        ).update(expires_at=timezone.now())

        ticket = QuizLaunchTicket.objects.create(
            user=request.user,
            avatar=avatar,
            return_to=return_to,
            expires_at=timezone.now()
            + timedelta(seconds=settings.QUIZ_LAUNCH_TICKET_TTL_SECONDS),
        )

        query = urlencode({"ticket": ticket.ticket, "return_to": _public_base() + return_to})
        launch_url = f"{quiz_base}{settings.QUIZ_SSO_LAUNCH_PATH}?{query}"

        return Response(
            {
                "data": {
                    "launch_url": launch_url,
                    "expires_at": ticket.expires_at.isoformat(),
                },
                "errors": None,
            },
            status=status.HTTP_201_CREATED,
        )


# ─── Exchange ────────────────────────────────────────────────────────────────

class QuizExchangeView(APIView):
    """
    POST /integrations/quiz/exchange — redeem a ticket for the user's identity.

    Called by the quiz's *backend*, never by a browser. No user session is
    involved; the caller proves itself with the shared integration token and an
    HMAC over the request body.
    """

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        body = request.body

        if not verify_integration_token(request):
            return _error("Unauthorized", status.HTTP_401_UNAUTHORIZED, "Invalid integration token.")

        if not verify_hmac(request, body):
            return _error("Unauthorized", status.HTTP_401_UNAUTHORIZED, "HMAC signature mismatch.")

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return _error("Bad Request", status.HTTP_400_BAD_REQUEST, "Invalid JSON payload.")

        serializer = QuizExchangeRequestSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        ticket_value = serializer.validated_data["ticket"]

        # Consume in one statement. Doing this as read-then-write would let two
        # concurrent redemptions of the same ticket both pass the check.
        now = timezone.now()
        consumed = QuizLaunchTicket.objects.filter(
            ticket=ticket_value, consumed_at__isnull=True, expires_at__gt=now
        ).update(consumed_at=now, consumed_ip=_client_ip(request))

        if consumed != 1:
            # Distinguish the two failures — whoever is debugging their own
            # integration needs to know which one they hit.
            if not QuizLaunchTicket.objects.filter(ticket=ticket_value).exists():
                return _error("Not Found", status.HTTP_404_NOT_FOUND, "Unknown ticket.")
            return _error(
                "Gone",
                status.HTTP_410_GONE,
                "Ticket has already been used or has expired. Tickets are single-use "
                f"and live for {settings.QUIZ_LAUNCH_TICKET_TTL_SECONDS} seconds.",
            )

        ticket = QuizLaunchTicket.objects.select_related(
            "user", "avatar", "avatar__archetype"
        ).get(ticket=ticket_value)
        avatar = ticket.avatar

        return Response(
            {
                "data": {
                    # Link on this, never on email — email is mutable, this is not.
                    "starkeep_user_id": str(ticket.user_id),
                    "avatar_id": str(avatar.id),
                    "email": ticket.user.email,
                    "alias": avatar.alias,
                    "display_name": avatar.display_name,
                    "level": avatar.level,
                    "has_archetype": hasattr(avatar, "archetype"),
                    "issued_at": ticket.created_at.isoformat(),
                    # Handed over fully formed so the quiz never has to assemble
                    # it, and cannot post results against the wrong avatar.
                    "archetype_post_url": f"{_public_base()}/api/v1/avatars/{avatar.id}/archetype",
                    "return_to": _public_base() + ticket.return_to,
                },
                "errors": None,
            }
        )
