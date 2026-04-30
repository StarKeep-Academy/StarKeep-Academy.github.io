"""
apps/users/views.py

Auth endpoints — API_CONTRACT.md §Authentication.
All responses use the { "data": ..., "errors": null } envelope.
"""

from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.shortcuts import redirect

from .serializers import RegisterSerializer, LoginSerializer
from apps.avatar.serializers import AvatarMiniSerializer


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _build_token_response(user, http_status=status.HTTP_200_OK):
    """Standard token + user envelope returned by register and login."""
    refresh = RefreshToken.for_user(user)
    avatar  = getattr(user, "avatar", None)
    return Response(
        {
            "data": {
                "access":   str(refresh.access_token),
                "refresh":  str(refresh),
                "user_id":  str(user.id),
                "email":    user.email,
                "avatar":   AvatarMiniSerializer(avatar).data if avatar else None,
            },
            "errors": None,
        },
        status=http_status,
    )


# ─── Auth Views ───────────────────────────────────────────────────────────────

class RegisterView(APIView):
    """POST /auth/register — email signup."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return _build_token_response(user, status.HTTP_201_CREATED)


class LoginView(APIView):
    """POST /auth/login — returns JWT pair + user bundle."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        return _build_token_response(user)


class LogoutView(APIView):
    """POST /auth/logout — blacklists the refresh token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if refresh_token:
                RefreshToken(refresh_token).blacklist()
        except TokenError:
            pass  # Already invalid or expired — that's fine
        return Response({"data": None, "errors": None})


class TokenRefreshView(APIView):
    """POST /auth/token/refresh — wraps simplejwt in Starkeep envelope."""
    permission_classes = [AllowAny]

    def post(self, request):
        from rest_framework_simplejwt.serializers import TokenRefreshSerializer
        serializer = TokenRefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"data": serializer.validated_data, "errors": None})


class MeView(APIView):
    """GET /auth/me — current user + avatar bundle. Shape matches API_CONTRACT.md."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user   = request.user
        avatar = getattr(user, "avatar", None)
        return Response(
            {
                "data": {
                    "user_id": str(user.id),
                    "email":   user.email,
                    "avatar":  AvatarMiniSerializer(avatar).data if avatar else None,
                },
                "errors": None,
            }
        )


class SocialAuthRedirectView(APIView):
    """
    GET /auth/social/google  →  redirects to allauth Google OAuth
    GET /auth/social/apple   →  redirects to allauth Apple OAuth

    After OAuth completes, allauth redirects to LOGIN_REDIRECT_URL.
    Mobile native token exchange (Phase 1.1): POST /auth/social/{provider}/token
    """
    permission_classes = [AllowAny]

    def get(self, request, provider):
        allowed = {"google", "apple"}
        if provider not in allowed:
            return Response(
                {"data": None, "errors": {"title": "Not Found", "status": 404, "detail": f"Unknown provider: {provider}"}},
                status=status.HTTP_404_NOT_FOUND,
            )
        return redirect(f"/accounts/{provider}/login/")
