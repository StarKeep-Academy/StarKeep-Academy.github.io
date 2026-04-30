"""
apps/users/urls.py

Auth endpoints. All mount under /api/v1/ (set in starkeep_project/urls.py).
"""

from django.urls import path
from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    TokenRefreshView,
    MeView,
    SocialAuthRedirectView,
)

urlpatterns = [
    path("auth/register",            RegisterView.as_view(),            name="auth-register"),
    path("auth/login",               LoginView.as_view(),               name="auth-login"),
    path("auth/logout",              LogoutView.as_view(),              name="auth-logout"),
    path("auth/token/refresh",       TokenRefreshView.as_view(),        name="auth-token-refresh"),
    path("auth/me",                  MeView.as_view(),                  name="auth-me"),
    path("auth/social/<str:provider>", SocialAuthRedirectView.as_view(), name="auth-social"),
]
