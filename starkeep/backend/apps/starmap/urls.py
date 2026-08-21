"""
apps/starmap/urls.py

All mount under /api/v1/ (set in starkeep_project/urls.py).
"""

from django.urls import path
from .views import (
    ConstellationDetailView,
    ConstellationEdgesView,
    ConstellationListView,
    MilestoneDetailView,
    MilestoneEvidenceView,
    MilestoneListView,
    MilestoneSplitView,
    MilestoneSubmitView,
    StarMapView,
)

urlpatterns = [
    path("star-maps/<uuid:avatar_id>",              StarMapView.as_view(),            name="star-map"),

    path("milestones",                               MilestoneListView.as_view(),      name="milestone-list"),
    path("milestones/<uuid:milestone_id>",           MilestoneDetailView.as_view(),    name="milestone-detail"),
    path("milestones/<uuid:milestone_id>/evidence",  MilestoneEvidenceView.as_view(),  name="milestone-evidence"),
    path("milestones/<uuid:milestone_id>/submit",    MilestoneSubmitView.as_view(),    name="milestone-submit"),
    path("milestones/<uuid:milestone_id>/split",     MilestoneSplitView.as_view(),     name="milestone-split"),

    path("constellations",                           ConstellationListView.as_view(),  name="constellation-list"),
    path("constellations/<uuid:constellation_id>",   ConstellationDetailView.as_view(), name="constellation-detail"),
    path("constellations/<uuid:constellation_id>/edges", ConstellationEdgesView.as_view(), name="constellation-edges"),
]
