"""
apps/integrations/serializers.py
"""

from urllib.parse import urlparse

from rest_framework import serializers


class QuizLaunchRequestSerializer(serializers.Serializer):
    """
    Body of POST /integrations/quiz/launch.

    `return_to` is where the quiz sends the browser when it finishes. We accept
    a *site-relative path only* and build the absolute URL ourselves from
    STARKEEP_PUBLIC_BASE_URL. Accepting a caller-supplied absolute URL here
    would make this endpoint an open redirect that happens to be signed by us.
    """

    return_to = serializers.CharField(required=False, default="/avatar", max_length=500)

    def validate_return_to(self, value: str) -> str:
        value = value.strip()

        if not value.startswith("/"):
            raise serializers.ValidationError(
                "return_to must be a site-relative path beginning with '/'."
            )

        # "//evil.com" and "/\evil.com" are protocol-relative: browsers read
        # both as absolute URLs to another origin. They pass a naive
        # startswith("/") check, which is exactly why they get their own case.
        if value.startswith("//") or value.startswith("/\\"):
            raise serializers.ValidationError("return_to must not be protocol-relative.")

        if "\\" in value:
            raise serializers.ValidationError("return_to must not contain backslashes.")

        # Newlines would let a crafted value split the eventual Location header.
        if any(c in value for c in "\r\n\t") or any(ord(c) < 0x20 for c in value):
            raise serializers.ValidationError("return_to must not contain control characters.")

        parsed = urlparse(value)
        if parsed.scheme or parsed.netloc:
            raise serializers.ValidationError("return_to must not include a scheme or host.")

        return value


class QuizExchangeRequestSerializer(serializers.Serializer):
    """Body of POST /integrations/quiz/exchange — sent by the quiz's backend."""

    ticket = serializers.CharField(max_length=64)
