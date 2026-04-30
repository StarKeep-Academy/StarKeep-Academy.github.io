"""
apps/starmap/serializers.py

VR NOTE (DEC-006): Star, Constellation, and StarMap field names are stable.
Add fields freely; never rename. x/y placement hints will gain z when VR needs it.

Vocabulary (STARKEEP_CONTEXT.md §2):
  Milestone = pending task
  Star      = approved Milestone (the achievement badge)
  Constellation = cluster of approved Stars
"""

from rest_framework import serializers
from .models import Constellation, ConstellationPath, Evidence, Milestone, MilestoneStatus


# ─── Evidence ─────────────────────────────────────────────────────────────────

class EvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Evidence
        fields = ["id", "type", "payload", "label", "created_at"]


# ─── Star (approved Milestone shown in the sky) ───────────────────────────────

class StarSerializer(serializers.ModelSerializer):
    """
    A Milestone with status=APPROVED rendered as a Star.
    completed_at maps to validated_at — the moment the milestone was approved.
    """
    completed_at = serializers.DateTimeField(source="validated_at")

    class Meta:
        model  = Milestone
        fields = ["id", "title", "completed_at", "lux_issued", "x", "y"]


# ─── Constellation ────────────────────────────────────────────────────────────

class ConstellationSerializer(serializers.ModelSerializer):
    """
    Used inside ConstellationPathSerializer.
    `stars` is populated via a Prefetch of approved milestones only —
    the queryset filtering happens in the view, not here.
    """
    stars = StarSerializer(source="milestones", many=True)

    class Meta:
        model  = Constellation
        fields = ["id", "name", "symbol", "completed_at", "stars"]


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
    validation_status = serializers.SerializerMethodField()
    constellation_id  = serializers.UUIDField(source="constellation_id", allow_null=True)

    def get_validation_status(self, obj):
        return _VALIDATION_STATUS.get(obj.status, "not_submitted")

    class Meta:
        model  = Milestone
        fields = [
            "id",
            "title",
            "status",
            "validation_status",
            "constellation_id",
            "rejection_feedback",
        ]


# ─── Milestone Detail (GET /milestones/{id} and list) ─────────────────────────

class MilestoneDetailSerializer(serializers.ModelSerializer):
    validation_status = serializers.SerializerMethodField()
    constellation_id  = serializers.UUIDField(source="constellation_id", allow_null=True)
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
            "lvm_scores",
            "lux_issued",
            "x",
            "y",
            "rejection_feedback",
            "validated_at",
            "evidence",
            "created_at",
            "updated_at",
        ]
