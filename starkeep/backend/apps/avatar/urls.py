"""
apps/avatar/urls.py

Avatar endpoints. All mount under /api/v1/ (set in starkeep_project/urls.py).
"""

from django.urls import path
from .views import AvatarDetailView, ArchetypeView

urlpatterns = [
    path("avatars/<uuid:avatar_id>",           AvatarDetailView.as_view(), name="avatar-detail"),
    path("avatars/<uuid:avatar_id>/archetype", ArchetypeView.as_view(),    name="avatar-archetype"),
]
