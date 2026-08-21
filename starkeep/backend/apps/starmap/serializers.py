"""
apps/starmap/serializers.py

VR NOTE (DEC-006): Star, Constellation, and StarMap field names are stable.
Add fields freely; never rename.

Vocabulary (STARKEEP_CONTEXT.md §2):
  Milestone = pending task
  Star      = approved Milestone (the achievement badge)
  Constellation = cluster of approved Stars

Fields that are, and must remain, read-only from the client's point of view
(never add these to a write serializer's `fields`): `status` (except via the
one explicit `submit` transition and the server-side pending->active
auto-transition — see views.py), `lux_issued`, `validated_at`, `validated_by`,
`lvm_scores`, `rejection_feedback` (all Phase 6 / admin-only).

`x`/`y`/`z` are WRITABLE (DEC-013 amended 2026-08-13) — wherever the client
places a star is saved verbatim and read back on the next load. Originally
derive-only (recomputed from `edges` via procedural layout every time,
ignoring manual placement), which meant a drag that didn't also change the
edge graph had nothing to persist to.
"""

from rest_framework import serializers
from .models import Constellation, ConstellationEdge, ConstellationPath, Evidence, Milestone, MilestoneStatus


# ─── Evidence ─────────────────────────────────────────────────────────────────

class EvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Evidence
        fields = ["id", "type", "payload", "label", "created_at"]


class EvidenceCreateSerializer(serializers.ModelSerializer):
    """POST /milestones/{id}/evidence request body."""
    class Meta:
        model  = Evidence
        fields = ["type", "payload", "label"]


# ─── Star (approved Milestone shown in the sky) ───────────────────────────────

class StarSerializer(serializers.ModelSerializer):
    """
    A Milestone with status=APPROVED rendered as a Star.
    completed_at maps to validated_at — the moment the milestone was approved.
    `planets` stays visible (read-only, archived) per STARMAP_SPEC §5 — a
    star's checklist is shown locked in the completed panel, not hidden.
    """
    completed_at = serializers.DateTimeField(source="validated_at")

    class Meta:
        model  = Milestone
        fields = ["id", "title", "description", "completed_at", "lux_issued", "x", "y", "z", "orbit_order", "planets"]


# ─── Constellation Edge (DEC-013) ──────────────────────────────────────────────

class ConstellationEdgeSerializer(serializers.Serializer):
    """Read-only wire shape matching frontend-web's starGraph.js exactly: {from, to}."""
    def to_representation(self, instance):
        return {"from": str(instance.from_milestone_id), "to": str(instance.to_milestone_id)}


class EdgeReplaceSerializer(serializers.Serializer):
    """POST /constellations/{id}/edges request body: the full replacement edge list."""
    edges = serializers.ListField(child=serializers.DictField(), allow_empty=True)

    def validate_edges(self, value):
        cleaned = []
        for e in value:
            if "from" not in e or "to" not in e:
                raise serializers.ValidationError('Each edge needs "from" and "to".')
            cleaned.append({"from": str(e["from"]), "to": str(e["to"])})
        return cleaned


# ─── Constellation ────────────────────────────────────────────────────────────

class ConstellationSerializer(serializers.ModelSerializer):
    """
    Used inside ConstellationPathSerializer and standalone (constellation
    list/detail). `stars` is populated via a Prefetch of approved milestones
    only — the queryset filtering happens in the view, not here. `edges`
    covers ALL milestones in the constellation regardless of status (a
    still-in-progress constellation needs its sequence too), so it is not
    filtered the same way.
    """
    stars = StarSerializer(source="milestones", many=True)
    edges = ConstellationEdgeSerializer(many=True, read_only=True)

    class Meta:
        model  = Constellation
        fields = ["id", "name", "symbol", "completed_at", "angle_deg", "radius", "is_north_star", "stars", "edges"]


class ConstellationCreateSerializer(serializers.ModelSerializer):
    """
    POST /constellations request body. angle_deg/radius are deliberately NOT
    accepted here — the server assigns a free sky slot (see views.py), rather
    than trusting client-random values.
    """
    path_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model  = Constellation
        fields = ["name", "symbol", "path_id"]


# ─── Constellation Path ───────────────────────────────────────────────────────

class ConstellationPathSerializer(serializers.ModelSerializer):
    constellations = ConstellationSerializer(many=True)

    class Meta:
        model  = ConstellationPath
        fields = ["id", "name", "constellations"]


# ─── Pending Milestone ────────────────────────────────────────────────────────

_VALIDATION_STATUS = {
    MilestoneStatus.PENDING:   "not_submitted",
    MilestoneStatus.ACTIVE:    "not_submitted",
    MilestoneStatus.SUBMITTED: "pending_review",
    MilestoneStatus.APPROVED:  "approved",
    MilestoneStatus.REJECTED:  "rejected",
}


class PendingMilestoneSerializer(serializers.ModelSerializer):
    """
    Used for the tree response's flat `pending_milestones` array (every
    non-approved milestone). Carries description/planets/evidence inline —
    not just a thin summary — because the frontend's star detail panel
    reads them synchronously the moment a star is opened, with no lazy-fetch
    pattern; matches FRONTEND_API_INTEGRATION.md's "fetch once on mount"
    design principle better than N follow-up per-star GET calls.
    """
    validation_status = serializers.SerializerMethodField()
    constellation_id  = serializers.UUIDField(allow_null=True)
    evidence          = EvidenceSerializer(many=True, read_only=True)

    def get_validation_status(self, obj):
        return _VALIDATION_STATUS.get(obj.status, "not_submitted")

    class Meta:
        model  = Milestone
        fields = [
            "id",
            "title",
            "description",
            "status",
            "validation_status",
            "constellation_id",
            "planets",
            "evidence",
            "rejection_feedback",
            "x",
            "y",
            "z",
        ]


# ─── Milestone Detail (GET /milestones/{id} and list) ─────────────────────────

class MilestoneDetailSerializer(serializers.ModelSerializer):
    validation_status = serializers.SerializerMethodField()
    constellation_id  = serializers.UUIDField(allow_null=True)
    evidence          = EvidenceSerializer(many=True, read_only=True)

    def get_validation_status(self, obj):
        return _VALIDATION_STATUS.get(obj.status, "not_submitted")

    class Meta:
        model  = Milestone
        fields = [
            "id",
            "title",
            "description",
            "source",
            "status",
            "validation_status",
            "constellation_id",
            "planets",
            "lvm_scores",
            "lux_issued",
            "x",
            "y",
            "z",
            "rejection_feedback",
            "validated_at",
            "evidence",
            "created_at",
            "updated_at",
        ]


# ─── Milestone writes ──────────────────────────────────────────────────────────

class MilestoneCreateSerializer(serializers.ModelSerializer):
    """POST /milestones request body."""
    constellation_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model  = Milestone
        fields = ["title", "description", "constellation_id", "source"]


class MilestoneUpdateSerializer(serializers.ModelSerializer):
    """
    PATCH /milestones/{id} request body. All fields optional (partial=True
    at the view). Deliberately excludes status/lux_issued/validated_at/
    validated_by/lvm_scores/rejection_feedback — those stay server-only.
    x/y/z ARE writable (DEC-013 amended 2026-08-13, see module docstring).
    """
    constellation_id = serializers.UUIDField(required=False, allow_null=True)
    planets = serializers.JSONField(required=False)

    class Meta:
        model  = Milestone
        fields = ["title", "description", "constellation_id", "planets", "x", "y", "z"]

    def validate_planets(self, value):
        if not isinstance(value, list) or not all(
            isinstance(p, dict) and {"label", "done", "order"} <= p.keys() for p in value
        ):
            raise serializers.ValidationError('planets must be a list of {"label", "done", "order"} objects.')
        return value


class MilestoneSplitSerializer(serializers.Serializer):
    """
    POST /milestones/{id}/split request body — the mitosis endpoint.
    `source_planet_order` (not label) identifies which parent planet each
    offshoot promotes, since labels aren't guaranteed unique but order is.
    """
    offshoots = serializers.ListField(child=serializers.DictField(), min_length=1)

    def validate_offshoots(self, value):
        for o in value:
            if not o.get("title"):
                raise serializers.ValidationError("Each offshoot needs a title.")
        return value
