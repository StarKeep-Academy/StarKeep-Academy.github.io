"""
apps/starmap/views.py

Phase 3: read-only endpoints.
Phase 4 will add POST/PATCH/evidence views in this same file.

GET  /star-maps/{avatar_id}     → full nested tree (VR-ready, DEC-006)
GET  /milestones                → paginated list, filterable by ?status=
GET  /milestones/{id}           → milestone detail + evidence
GET  /constellations            → list for current user's avatar
GET  /constellations/{id}       → constellation + its stars
"""

from django.db.models import Prefetch
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from apps.avatar.models import Avatar
from apps.common.pagination import StandardPagination

from .models import Constellation, ConstellationPath, Milestone, MilestoneStatus
from .serializers import (
    ConstellationPathSerializer,
    ConstellationSerializer,
    MilestoneDetailSerializer,
    PendingMilestoneSerializer,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_avatar_or_404(avatar_id) -> Avatar:
    try:
        return Avatar.objects.get(pk=avatar_id)
    except Avatar.DoesNotExist:
        raise NotFound("Avatar not found.")


# ─── Star Map ─────────────────────────────────────────────────────────────────

class StarMapView(APIView):
    """
    GET /star-maps/{avatar_id}

    Returns the full nested hierarchy:
      ConstellationPaths → Constellations → Stars (approved Milestones)
    Plus a flat list of pending_milestones (non-approved Milestones).

    VR-stable response shape (DEC-006). Ordering: paths and constellations
    by created_at ascending so the user's journey reads chronologically.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, avatar_id):
        avatar = _get_avatar_or_404(avatar_id)

        # Stars prefetch: only approved milestones belong in constellation star lists
        approved_milestones_qs = Milestone.objects.filter(
            status=MilestoneStatus.APPROVED
        ).order_by("validated_at")

        paths = ConstellationPath.objects.filter(avatar=avatar).prefetch_related(
            Prefetch(
                "constellations",
                queryset=Constellation.objects.order_by("created_at").prefetch_related(
                    Prefetch("milestones", queryset=approved_milestones_qs)
                ),
            )
        ).order_by("created_at")

        pending_milestones = (
            Milestone.objects
            .filter(avatar=avatar)
            .exclude(status=MilestoneStatus.APPROVED)
            .order_by("-created_at")
        )

        total_stars = Milestone.objects.filter(
            avatar=avatar, status=MilestoneStatus.APPROVED
        ).count()
        total_constellations = Constellation.objects.filter(avatar=avatar).count()

        return Response({
            "data": {
                "avatar_id":            str(avatar_id),
                "total_stars":          total_stars,
                "total_constellations": total_constellations,
                "constellation_paths":  ConstellationPathSerializer(paths, many=True).data,
                "pending_milestones":   PendingMilestoneSerializer(pending_milestones, many=True).data,
            },
            "errors": None,
        })


# ─── Milestone List ───────────────────────────────────────────────────────────

class MilestoneListView(APIView):
    """
    GET /milestones

    Returns the authenticated user's milestones, paginated.
    Filterable: ?status=pending|active|submitted|approved|rejected
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            avatar = request.user.avatar
        except Avatar.DoesNotExist:
            return Response({"data": [], "meta": {"page": 1, "page_size": 20, "total": 0}, "errors": None})

        qs = (
            Milestone.objects
            .filter(avatar=avatar)
            .prefetch_related("evidence")
            .order_by("-created_at")
        )

        status_filter = request.query_params.get("status")
        if status_filter:
            valid = {s.value for s in MilestoneStatus}
            if status_filter in valid:
                qs = qs.filter(status=status_filter)

        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            MilestoneDetailSerializer(page, many=True).data
        )


# ─── Milestone Detail ─────────────────────────────────────────────────────────

class MilestoneDetailView(APIView):
    """GET /milestones/{id}"""
    permission_classes = [IsAuthenticated]

    def get(self, request, milestone_id):
        try:
            milestone = (
                Milestone.objects
                .prefetch_related("evidence")
                .get(pk=milestone_id, avatar=request.user.avatar)
            )
        except (Milestone.DoesNotExist, Avatar.DoesNotExist):
            raise NotFound("Milestone not found.")
        return Response({
            "data":   MilestoneDetailSerializer(milestone).data,
            "errors": None,
        })


# ─── Constellation List ───────────────────────────────────────────────────────

class ConstellationListView(APIView):
    """GET /constellations — all constellations for the current user's avatar."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            avatar = request.user.avatar
        except Avatar.DoesNotExist:
            return Response({"data": [], "errors": None})

        approved_qs = Milestone.objects.filter(
            status=MilestoneStatus.APPROVED
        ).order_by("validated_at")

        constellations = (
            Constellation.objects
            .filter(avatar=avatar)
            .prefetch_related(Prefetch("milestones", queryset=approved_qs))
            .order_by("created_at")
        )

        return Response({
            "data":   ConstellationSerializer(constellations, many=True).data,
            "errors": None,
        })


# ─── Constellation Detail ─────────────────────────────────────────────────────

class ConstellationDetailView(APIView):
    """GET /constellations/{id} — constellation + its stars."""
    permission_classes = [IsAuthenticated]

    def get(self, request, constellation_id):
        approved_qs = Milestone.objects.filter(
            status=MilestoneStatus.APPROVED
        ).order_by("validated_at")

        try:
            constellation = (
                Constellation.objects
                .prefetch_related(Prefetch("milestones", queryset=approved_qs))
                .get(pk=constellation_id, avatar=request.user.avatar)
            )
        except (Constellation.DoesNotExist, Avatar.DoesNotExist):
            raise NotFound("Constellation not found.")

        return Response({
            "data":   ConstellationSerializer(constellation).data,
            "errors": None,
        })
