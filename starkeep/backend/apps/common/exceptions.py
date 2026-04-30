"""
apps/common/exceptions.py

Starkeep standard error envelope (RFC 7807).
All API errors return { "data": null, "errors": { ... } }
"""

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def starkeep_exception_handler(exc, context):
    """
    Wraps DRF's default exception handler to produce the Starkeep envelope.
    See API_CONTRACT.md for the full error shape.
    """
    response = exception_handler(exc, context)

    if response is not None:
        errors = {
            "type": f"https://starkeep.io/errors/{response.status_code}",
            "title": _status_title(response.status_code),
            "status": response.status_code,
            "detail": _flatten_detail(response.data),
            "invalid_params": _extract_invalid_params(response.data),
        }
        response.data = {"data": None, "errors": errors}

    return response


def _status_title(code: int) -> str:
    titles = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        422: "Validation Error",
        429: "Too Many Requests",
        500: "Internal Server Error",
        501: "Not Implemented",
    }
    return titles.get(code, "Error")


def _flatten_detail(data) -> str:
    if isinstance(data, dict):
        parts = []
        for field, messages in data.items():
            if isinstance(messages, list):
                parts.append(f"{field}: {messages[0]}")
            else:
                parts.append(str(messages))
        return "; ".join(parts)
    if isinstance(data, list):
        return str(data[0]) if data else "Unknown error"
    return str(data)


def _extract_invalid_params(data) -> list:
    if not isinstance(data, dict):
        return []
    params = []
    for field, messages in data.items():
        if field in ("detail", "non_field_errors"):
            continue
        if isinstance(messages, list):
            params.append({"field": field, "message": messages[0]})
        else:
            params.append({"field": field, "message": str(messages)})
    return params


# ─── Custom Exception Classes ────────────────────────────────────────────────

class StarkeepError(Exception):
    """Base for all Starkeep domain errors."""
    status_code = 400
    default_detail = "An error occurred."

    def __init__(self, detail=None):
        self.detail = detail or self.default_detail


class NotImplementedYet(StarkeepError):
    """Raise for v1-stubbed endpoints. Returns 501."""
    status_code = 501
    default_detail = "This feature is coming in a future release."


class LuxCapExceeded(StarkeepError):
    """Raised when LVM computation would exceed the 30 LUX milestone cap."""
    default_detail = "LUX issuance would exceed the per-milestone cap of 30."


class InvalidArchetypePayload(StarkeepError):
    """Raised when the external quiz repo POST fails JSON schema validation."""
    default_detail = "Archetype quiz payload is invalid or has an unsupported version."
