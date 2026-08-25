"""
apps/common/integration_security.py

Shared credential checks for every machine-to-machine call from the archetype
quiz repo (DEC-007, DEC-014).

Two endpoints authenticate this way — the SSO ticket exchange
(`apps/integrations/views.py`) and the archetype results webhook
(`apps/avatar/views.py`) — and they sit in different layers, so the helpers
live down here in `common` where both may import them. See DEC-009 for the
dependency direction these rules protect.

Both checks fail closed when their secret is unset, so a half-configured
deployment rejects everything rather than accepting anything.
"""

import hashlib
import hmac

from django.conf import settings

SIGNATURE_HEADER = "HTTP_X_QUIZ_SIGNATURE"  # X-Quiz-Signature on the wire
SIGNATURE_PREFIX = "sha256="


def verify_integration_token(request) -> bool:
    """
    Constant-time check of the shared bearer token.

    compare_digest rather than `==` because a plain string comparison returns
    early on the first differing byte, which leaks the token's prefix to an
    attacker who can time the response.
    """
    token = getattr(settings, "QUIZ_INTEGRATION_TOKEN", "")
    if not token:
        return False
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    return hmac.compare_digest(auth_header, f"Bearer {token}")


def sign_body(body: bytes) -> str:
    """
    Produce the `X-Quiz-Signature` value for `body`.

    Signing covers the raw request body bytes exactly as transmitted — not a
    re-serialized parse of them. The quiz repo must sign the same bytes it puts
    on the wire, or the signature will not reproduce here. This is the single
    most common way an HMAC integration goes wrong.
    """
    secret = getattr(settings, "QUIZ_REPO_WEBHOOK_SECRET", "")
    if not secret:
        return ""
    return SIGNATURE_PREFIX + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def verify_hmac(request, body: bytes) -> bool:
    """Check the request's X-Quiz-Signature against a signature we compute."""
    secret = getattr(settings, "QUIZ_REPO_WEBHOOK_SECRET", "")
    if not secret:
        return False
    sig_header = request.META.get(SIGNATURE_HEADER, "")
    if not sig_header.startswith(SIGNATURE_PREFIX):
        return False
    return hmac.compare_digest(sig_header, sign_body(body))
