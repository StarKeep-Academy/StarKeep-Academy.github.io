"""
apps/starmap/urls.py

All mount under /api/v1/ (set in starkeep_project/urls.py).
Phase 3: read-only. Phase 4 adds POST/PATCH/evidence routes.
"""

from django.urls import path
from .views import (
    ConstellationDetailView,
    ConstellationListView,
    MilestoneDetailView,
    MilestoneListView,
    StarMapView,
)

urlpatterns = [
    path("star-maps/<uuid:avatar_id>",          StarMapView.as_view(),            name="star-map"),
    path("milestones",                           MilestoneListView.as_view(),      name="milestone-list"),
    path("milestones/<uuid:milestone_id>",       MilestoneDetailView.as_view(),    name="milestone-detail"),
    path("constellations",                       ConstellationListView.as_view(),  name="constellation-list"),
    path("constellations/<uuid:constellation_id>", ConstellationDetailView.as_view(), name="constellation-detail"),
]
