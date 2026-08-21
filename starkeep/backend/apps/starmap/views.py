"""
apps/starmap/views.py

GET  /star-maps/{avatar_id}     -> full nested tree (VR-ready, DEC-006)
GET  /milestones                -> paginated list, filterable by ?status=
POST /milestones                -> create
GET  /milestones/{id}           -> milestone detail + evidence
PATCH /milestones/{id}          -> update title/description/constellation/planets
DELETE /milestones/{id}         -> delete, healing the edge sequence
POST /milestones/{id}/evidence  -> attach evidence
POST /milestones/{id}/submit    -> pending/active -> submitted
POST /milestones/{id}/split     -> mitosis: atomic split into N milestones
GET  /constellations            -> list for current user's avatar
POST /constellations            -> create
GET  /constellations/{id}       -> constellation + its stars
POST /constellations/{id}/edges -> replace this constellation's edge list (DEC-013)
"""

import random
from django.db import transaction
from django.db.models import Prefetch
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework import status

from apps.avatar.models import Avatar
from apps.common.pagination import StandardPagination
from apps.common.exceptions import StarkeepError

from . import graph
from .models import Constellation, ConstellationEdge, ConstellationPath, Evidence, Milestone, MilestoneStatus
from .serializers import (
    ConstellationCreateSerializer,
    ConstellationPathSerializer,
    ConstellationSerializer,
    EdgeReplaceSerializer,
    EvidenceCreateSerializer,
    EvidenceSerializer,
    MilestoneCreateSerializer,
    MilestoneDetailSerializer,
    MilestoneSplitSerializer,
    MilestoneUpdateSerializer,
    PendingMilestoneSerializer,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_avatar_or_404(avatar_id) -> Avatar:
    try:
        return Avatar.objects.get(pk=avatar_id)
    except Avatar.DoesNotExist:
        raise NotFound("Avatar not found.")


def _get_own_avatar_or_404(request) -> Avatar:
    try:
        return request.user.avatar
    except Avatar.DoesNotExist:
        raise NotFound("Avatar not found for current user.")


def _owned_milestone_or_404(request, milestone_id) -> Milestone:
    avatar = _get_own_avatar_or_404(request)
    try:
        return Milestone.objects.prefetch_related("evidence").get(pk=milestone_id, avatar=avatar)
    except Milestone.DoesNotExist:
        raise NotFound("Milestone not found.")


def _owned_constellation_or_404(avatar, constellation_id):
    """None constellation_id is a valid input (milestone with no constellation yet)."""
    if constellation_id is None:
        return None
    try:
        return Constellation.objects.get(pk=constellation_id, avatar=avatar)
    except Constellation.DoesNotExist:
        raise NotFound("Constellation not found.")


def _owned_constellation_by_id_or_404(request, constellation_id) -> Constellation:
    avatar = _get_own_avatar_or_404(request)
    try:
        return Constellation.objects.get(pk=constellation_id, avatar=avatar)
    except Constellation.DoesNotExist:
        raise NotFound("Constellation not found.")


def _owned_path_or_404(avatar, path_id):
    if path_id is None:
        return None
    try:
        return ConstellationPath.objects.get(pk=path_id, avatar=avatar)
    except ConstellationPath.DoesNotExist:
        raise NotFound("Constellation path not found.")


def _get_or_create_default_path(avatar) -> ConstellationPath:
    """
    GET /star-maps/{avatar_id} only discovers constellations by walking
    ConstellationPath -> Constellation (VR-stable tree shape, DEC-006) — a
    constellation with no path is invisible there even though it still
    exists (found the hard way: total_constellations counted it, but
    constellation_paths was empty). Every constellation needs *some* path,
    so ad-hoc creation (no path_id given — there's no path-picker UI yet)
    falls back to one default path per avatar rather than leaving it
    orphaned.
    """
    path, _ = ConstellationPath.objects.get_or_create(
        avatar=avatar, name="My Journey", defaults={"description": ""}
    )
    return path


def _assign_sky_slot(avatar):
    """
    Server-assigned sky position for a newly created constellation, rather
    than trusting client-random values (STARMAP_SPEC §11: "set by AI at
    creation time" — this is the mock-AI stand-in for that). Picks a random
    angle and a radius that grows with how many constellations the avatar
    already has, so new ones don't all land on top of each other.
    """
    existing_count = Constellation.objects.filter(avatar=avatar).count()
    angle_deg = random.uniform(0, 360)
    radius = min(0.35 + existing_count * 0.08 + random.uniform(0, 0.05), 0.95)
    return angle_deg, radius


def _bulk_replace_edges(constellation, edge_dicts):
    """Delete every existing edge for this constellation and recreate from edge_dicts, in-place."""
    ConstellationEdge.objects.filter(constellation=constellation).delete()
    ConstellationEdge.objects.bulk_create([
        ConstellationEdge(constellation=constellation, from_milestone_id=e["from"], to_milestone_id=e["to"])
        for e in edge_dicts
    ])


def _implies_planet_completed(old_planets, new_planets):
    """True if any planet flipped done: False -> True between old and new."""
    old_by_order = {p.get("order"): p.get("done") for p in (old_planets or [])}
    for p in new_planets or []:
        was_done = old_by_order.get(p.get("order"), False)
        if p.get("done") and not was_done:
            return True
    return False


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
                    Prefetch("milestones", queryset=approved_milestones_qs),
                    Prefetch("edges", queryset=ConstellationEdge.objects.order_by("created_at")),
                ),
            )
        ).order_by("created_at")

        pending_milestones = (
            Milestone.objects
            .filter(avatar=avatar)
            .exclude(status=MilestoneStatus.APPROVED)
            .prefetch_related("evidence")
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


# ─── Milestone List / Create ───────────────────────────────────────────────────

class MilestoneListView(APIView):
    """
    GET  /milestones — the authenticated user's milestones, paginated.
                        Filterable: ?status=pending|active|submitted|approved|rejected
    POST /milestones — create a milestone. Starts status=pending (model default).
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

    def post(self, request):
        avatar = _get_own_avatar_or_404(request)
        serializer = MilestoneCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        constellation = _owned_constellation_or_404(avatar, data.get("constellation_id"))

        milestone = Milestone.objects.create(
            avatar=avatar,
            title=data["title"],
            description=data.get("description", ""),
            source=data.get("source", "manual"),
            constellation=constellation,
        )
        return Response(
            {"data": MilestoneDetailSerializer(milestone).data, "errors": None},
            status=status.HTTP_201_CREATED,
        )


# ─── Milestone Detail / Update / Delete ────────────────────────────────────────

class MilestoneDetailView(APIView):
    """
    GET    /milestones/{id} — detail.
    PATCH  /milestones/{id} — title/description/constellation/planets.
    DELETE /milestones/{id} — delete, healing the constellation's edge sequence first.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, milestone_id):
        milestone = _owned_milestone_or_404(request, milestone_id)
        return Response({
            "data":   MilestoneDetailSerializer(milestone).data,
            "errors": None,
        })

    def patch(self, request, milestone_id):
        milestone = _owned_milestone_or_404(request, milestone_id)
        serializer = MilestoneUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        if "constellation_id" in data:
            milestone.constellation = _owned_constellation_or_404(milestone.avatar, data.pop("constellation_id"))

        # Server-side pending->active auto-transition: checking a planet is
        # one of the two legitimate triggers (the other is attaching
        # evidence, in MilestoneEvidenceView). The frontend cannot set
        # status directly — FRONTEND_API_INTEGRATION.md §9 already locks
        # that down — so this side effect is the mechanism.
        if "planets" in data and milestone.status == MilestoneStatus.PENDING:
            if _implies_planet_completed(milestone.planets, data["planets"]):
                milestone.status = MilestoneStatus.ACTIVE

        for field, value in data.items():
            setattr(milestone, field, value)
        milestone.save()

        return Response({"data": MilestoneDetailSerializer(milestone).data, "errors": None})

    def delete(self, request, milestone_id):
        milestone = _owned_milestone_or_404(request, milestone_id)
        with transaction.atomic():
            if milestone.constellation_id:
                edges = list(
                    ConstellationEdge.objects
                    .filter(constellation_id=milestone.constellation_id)
                    .values_list("from_milestone_id", "to_milestone_id")
                )
                edge_dicts = [{"from": str(f), "to": str(t)} for f, t in edges]
                healed = graph.splice_out_node(edge_dicts, str(milestone.id))
                _bulk_replace_edges(milestone.constellation, healed)
            milestone.delete()  # cascades Evidence; any leftover self-referencing edges already gone
        return Response({"data": None, "errors": None}, status=status.HTTP_204_NO_CONTENT)


# ─── Evidence ─────────────────────────────────────────────────────────────────

class MilestoneEvidenceView(APIView):
    """POST /milestones/{id}/evidence"""
    permission_classes = [IsAuthenticated]

    def post(self, request, milestone_id):
        milestone = _owned_milestone_or_404(request, milestone_id)
        serializer = EvidenceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        evidence = Evidence.objects.create(milestone=milestone, **serializer.validated_data)

        if milestone.status == MilestoneStatus.PENDING:
            milestone.status = MilestoneStatus.ACTIVE
            milestone.save(update_fields=["status", "updated_at"])

        return Response(
            {"data": EvidenceSerializer(evidence).data, "errors": None},
            status=status.HTTP_201_CREATED,
        )


# ─── Submit for validation ─────────────────────────────────────────────────────

class MilestoneSubmitView(APIView):
    """POST /milestones/{id}/submit"""
    permission_classes = [IsAuthenticated]

    def post(self, request, milestone_id):
        milestone = _owned_milestone_or_404(request, milestone_id)
        if milestone.status not in (MilestoneStatus.PENDING, MilestoneStatus.ACTIVE):
            raise StarkeepError(f"Cannot submit a milestone with status '{milestone.status}'.")
        if not milestone.evidence.exists():
            raise StarkeepError("At least one evidence item is required before submitting.")

        milestone.status = MilestoneStatus.SUBMITTED
        milestone.save(update_fields=["status", "updated_at"])
        return Response({
            "data": {"id": str(milestone.id), "status": milestone.status},
            "errors": None,
        })


# ─── Mitosis / Split ────────────────────────────────────────────────────────────

class MilestoneSplitView(APIView):
    """
    POST /milestones/{id}/split — atomic mitosis. Creates N offshoot
    milestones and either consumes the parent (if it has no planets/evidence
    left) or leaves it in place with the offshoots spliced in ahead of it as
    prerequisites (DEC-013). See apps/starmap/graph.py for the edge-rewiring
    functions, ported from frontend-web/js/starGraph.js so client and server
    can never disagree about the rewiring rules.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, milestone_id):
        parent = _owned_milestone_or_404(request, milestone_id)
        serializer = MilestoneSplitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        offshoots_in = serializer.validated_data["offshoots"]

        with transaction.atomic():
            offshoots = [
                Milestone.objects.create(
                    avatar=parent.avatar,
                    constellation=parent.constellation,
                    title=o["title"],
                    description=o.get("description", ""),
                    planets=o.get("planets", []),
                    source="manual",
                )
                for o in offshoots_in
            ]
            chain_ids = [str(m.id) for m in offshoots]

            promoted_orders = {
                o.get("source_planet_order") for o in offshoots_in if o.get("source_planet_order") is not None
            }
            parent.planets = [p for p in parent.planets if p.get("order") not in promoted_orders]
            consumes_parent = not parent.planets and not parent.evidence.exists()

            constellation = parent.constellation
            if constellation is not None:
                existing_edges = list(
                    ConstellationEdge.objects.filter(constellation=constellation)
                    .values_list("from_milestone_id", "to_milestone_id")
                )
                edge_dicts = [{"from": str(f), "to": str(t)} for f, t in existing_edges]

                if consumes_parent:
                    next_edges = graph.replace_node_with_chain(edge_dicts, str(parent.id), chain_ids)
                else:
                    next_edges = graph.insert_chain_before(edge_dicts, str(parent.id), chain_ids)
                _bulk_replace_edges(constellation, next_edges)

            if consumes_parent:
                parent.delete()
                parent_result = None
            else:
                parent.save(update_fields=["planets", "updated_at"])
                parent_result = MilestoneDetailSerializer(parent).data

        constellation_result = ConstellationSerializer(constellation).data if constellation else None
        return Response({
            "data": {
                "consumed_parent": consumes_parent,
                "parent": parent_result,
                "offshoots": MilestoneDetailSerializer(offshoots, many=True).data,
                "constellation": constellation_result,
            },
            "errors": None,
        }, status=status.HTTP_201_CREATED)


# ─── Constellation List / Create ───────────────────────────────────────────────

class ConstellationListView(APIView):
    """
    GET  /constellations — all constellations for the current user's avatar.
    POST /constellations — create; server assigns angle_deg/radius.
    """
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
            .prefetch_related(
                Prefetch("milestones", queryset=approved_qs),
                Prefetch("edges", queryset=ConstellationEdge.objects.order_by("created_at")),
            )
            .order_by("created_at")
        )

        return Response({
            "data":   ConstellationSerializer(constellations, many=True).data,
            "errors": None,
        })

    def post(self, request):
        avatar = _get_own_avatar_or_404(request)
        serializer = ConstellationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        path_id = data.pop("path_id", None)
        path = _owned_path_or_404(avatar, path_id) if path_id else _get_or_create_default_path(avatar)

        angle_deg, radius = _assign_sky_slot(avatar)
        constellation = Constellation.objects.create(
            avatar=avatar, path=path, angle_deg=angle_deg, radius=radius, **data
        )
        return Response(
            {"data": ConstellationSerializer(constellation).data, "errors": None},
            status=status.HTTP_201_CREATED,
        )


# ─── Constellation Detail ─────────────────────────────────────────────────────

class ConstellationDetailView(APIView):
    """
    GET    /constellations/{id} — constellation + its stars.
    DELETE /constellations/{id} — deletes the constellation AND its milestones.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, constellation_id):
        approved_qs = Milestone.objects.filter(
            status=MilestoneStatus.APPROVED
        ).order_by("validated_at")

        try:
            constellation = (
                Constellation.objects
                .prefetch_related(
                    Prefetch("milestones", queryset=approved_qs),
                    Prefetch("edges", queryset=ConstellationEdge.objects.order_by("created_at")),
                )
                .get(pk=constellation_id, avatar=request.user.avatar)
            )
        except (Constellation.DoesNotExist, Avatar.DoesNotExist):
            raise NotFound("Constellation not found.")

        return Response({
            "data":   ConstellationSerializer(constellation).data,
            "errors": None,
        })

    def delete(self, request, constellation_id):
        constellation = _owned_constellation_by_id_or_404(request, constellation_id)
        with transaction.atomic():
            # Milestone.constellation is on_delete=SET_NULL, not CASCADE —
            # deleting a constellation is meant to remove its stars too, not
            # orphan them with constellation=None. ConstellationEdge rows
            # cascade automatically (their own FK is CASCADE).
            Milestone.objects.filter(constellation=constellation).delete()
            constellation.delete()
        return Response({"data": None, "errors": None}, status=status.HTTP_204_NO_CONTENT)


# ─── Constellation Edges ────────────────────────────────────────────────────────

class ConstellationEdgesView(APIView):
    """
    POST /constellations/{id}/edges — full replace of this constellation's
    edge list (DEC-013). The client already validates acyclicity during its
    interactive drag/mitosis preview, but this re-validates independently —
    defense in depth, never trust the client for something this structural.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, constellation_id):
        constellation = _owned_constellation_by_id_or_404(request, constellation_id)
        serializer = EdgeReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        edges = serializer.validated_data["edges"]

        member_ids = set(
            str(pk) for pk in
            Milestone.objects.filter(constellation=constellation).values_list("id", flat=True)
        )
        unknown = {e["from"] for e in edges} | {e["to"] for e in edges}
        unknown -= member_ids
        if unknown:
            raise StarkeepError(f"Edge references milestone(s) not in this constellation: {sorted(unknown)}")

        cycle_node = graph.find_cycle(edges)
        if cycle_node is not None:
            raise StarkeepError(f"Edge list contains a cycle involving milestone {cycle_node}.")

        with transaction.atomic():
            _bulk_replace_edges(constellation, edges)

        constellation.refresh_from_db()
        return Response({"data": ConstellationSerializer(constellation).data, "errors": None})
