"""
apps/integrations/models.py

DEC-014 — the archetype quiz SSO handoff.
"""

import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimestampedModel


def generate_ticket() -> str:
    """43 urlsafe chars from a CSPRNG — not guessable, not enumerable."""
    return secrets.token_urlsafe(32)


class QuizLaunchTicket(TimestampedModel):
    """
    A single-use, short-lived bearer of identity for the quiz handoff.

    The browser only ever carries the opaque `ticket` string. The identity
    behind it is released solely to a caller that can *also* present the shared
    integration credentials, over a back channel (see
    `apps/common/integration_security.py`). That is what keeps a leaked launch
    URL — browser history, a Referer header, a screenshot — from being worth
    anything on its own.

    Stored in the database rather than the Redis cache on purpose: it survives
    a Redis-less local run, and the consumed/unconsumed trail is exactly what
    you want when debugging an integration with a team you cannot step through
    a debugger with.
    """

    ticket = models.CharField(
        max_length=64, unique=True, default=generate_ticket, editable=False
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_launch_tickets"
    )
    avatar = models.ForeignKey(
        "avatar.Avatar", on_delete=models.CASCADE, related_name="quiz_launch_tickets"
    )
    # Always a site-relative path (validated on the way in) — never an absolute
    # URL, so this can never become an open redirect.
    return_to = models.CharField(max_length=500, default="/avatar")
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    consumed_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["expires_at"])]

    def __str__(self) -> str:
        state = "consumed" if self.consumed_at else ("expired" if self.is_expired else "live")
        return f"QuizLaunchTicket({self.user_id}, {state})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at
