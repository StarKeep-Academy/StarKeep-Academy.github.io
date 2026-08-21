"""
apps/starmap/models.py

The academic record system. Milestones → Stars → Constellations → Paths.

VR NOTE (DEC-006): Star map tree is served to VR clients via /star-maps/{avatar_id}.
The x/y placement hints are 2D today; phase 2+ may add z for 3D coordinates
without breaking existing clients (new optional fields only).

Diagram (from STARKEEP_CONTEXT.md §11):
  Milestone → (complete) → Star
  Stars cluster → (all done) → Constellation
  Constellations cluster → (lifelong) → ConstellationPath
"""

from django.db import models
from django.conf import settings
from apps.common.models import TimestampedModel
from apps.avatar.models import Avatar


# ─── Constellation Path ──────────────────────────────────────────────────────
class ConstellationPath(TimestampedModel):
    """
    A lifelong arc of learning. Contains multiple Constellations.
    e.g. "Digital Futures Arc"
    """
    avatar = models.ForeignKey(Avatar, on_delete=models.CASCADE, related_name="constellation_paths")
    name   = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.name} ({self.avatar.alias})"


# ─── Constellation ────────────────────────────────────────────────────────────
class Constellation(TimestampedModel):
    """
    A completed cluster of Stars. Becomes permanent when all Stars are lit.
    e.g. "Creative Technology" → wolf symbol in the sky
    """
    avatar = models.ForeignKey(Avatar, on_delete=models.CASCADE, related_name="constellations")
    path   = models.ForeignKey(
        ConstellationPath,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="constellations",
    )

    name   = models.CharField(max_length=200)
    symbol = models.CharField(max_length=50, blank=True)  # e.g. "wolf", "sword"
    completed_at = models.DateTimeField(null=True, blank=True)  # null = not yet complete

    # Sky position — set by AI at creation time (STARMAP_SPEC §11, Phase 4+)
    angle_deg     = models.FloatField(null=True, blank=True)  # 0–360, radial position in sky
    radius        = models.FloatField(null=True, blank=True)  # 0–1 normalized distance from North Star
    is_north_star = models.BooleanField(default=False)        # True for the singular North Star constellation

    class Meta:
        ordering = ["created_at"]

    @property
    def is_complete(self):
        return self.completed_at is not None

    def __str__(self):
        return f"{self.name} ({'complete' if self.is_complete else 'in progress'})"


# ─── Milestone ────────────────────────────────────────────────────────────────
class MilestoneStatus(models.TextChoices):
    PENDING    = "pending",    "Pending"       # created, not started
    ACTIVE     = "active",     "Active"        # in progress
    SUBMITTED  = "submitted",  "Submitted"     # awaiting admin validation
    APPROVED   = "approved",   "Approved"      # validated → Star
    REJECTED   = "rejected",   "Rejected"      # returned with feedback


class MilestoneSource(models.TextChoices):
    MANUAL   = "manual",   "Created manually"
    COURSE   = "course",   "Generated from course enrollment"
    MISSION  = "mission",  "Linked to a Guild mission"
    AI       = "ai",       "AI-suggested"
    MENTOR   = "mentor",   "Planned with a mentor"


class Milestone(TimestampedModel):
    """
    The atomic unit of academic progress.

    When status == APPROVED, this Milestone is a "Star" in the UI.
    The Star Map view queries: Milestone.objects.filter(avatar=..., status=APPROVED)

    VR NOTE: x, y are placement hints for the 2D star field (0.0–1.0 normalized).
    """
    avatar        = models.ForeignKey(Avatar, on_delete=models.CASCADE, related_name="milestones")
    constellation = models.ForeignKey(
        Constellation,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="milestones",
    )

    title       = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    source      = models.CharField(max_length=20, choices=MilestoneSource.choices, default=MilestoneSource.MANUAL)

    # Status
    status            = models.CharField(max_length=20, choices=MilestoneStatus.choices, default=MilestoneStatus.PENDING)
    rejection_feedback = models.TextField(blank=True)  # populated when status = REJECTED

    # Validation (admin workflow, DEC-003)
    validated_at  = models.DateTimeField(null=True, blank=True)
    validated_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="validated_milestones",
    )

    # LVM scores (set by admin on validation, DEC-003 + STARKEEP_CONTEXT.md §5)
    # Stored as JSONB for inspection in admin and future analytics
    lvm_scores = models.JSONField(
        default=dict,
        help_text='{ "i": 0-5, "s": 0-5, "u": 0-5, "r": 0-5, "h": 0-5, "vsm": 1.00|1.10|1.15|1.25 }'
    )

    # Denormalized LUX amount issued for this milestone. Set by apps.lux signal
    # handler (milestone_validated signal) when the LVM formula runs in Phase 6.
    # Defaults to 0 until then. Never compute here — formula lives in lux/scoring.py.
    lux_issued = models.PositiveIntegerField(default=0)

    # Star placement, WRITABLE (DEC-013 amended 2026-08-13): the client saves
    # wherever the user drags a star to, and reads it back verbatim on the
    # next load. Originally derive-only/read-only (procedural graph layout
    # recomputed position every load, ignoring manual placement) — that
    # meant a drag that didn't also change the edge graph had nothing to
    # persist to, so manual repositioning silently didn't survive a reload.
    # null = never explicitly placed; the client falls back to its own
    # procedural layout for those.
    #
    # NOTE units: originally documented as 0.0-1.0 normalized (matching the
    # mobile app's 2D SVG canvas convention). frontend-web is a real 3D
    # scene and writes raw local-space world units instead (tens of units,
    # not 0-1) — there is no 3D mobile consumer yet to conflict with this,
    # but a future unified VR client will need to reconcile the two
    # conventions. Flagged here rather than solved now.
    x = models.FloatField(null=True, blank=True)
    y = models.FloatField(null=True, blank=True)
    z = models.FloatField(null=True, blank=True)

    # Planet ordering (STARMAP_SPEC §11): 1 = innermost orbit, null = not a planet
    # NOTE: this is for a Milestone that is ITSELF nested as a planet of
    # another Milestone (not yet built) — a different concept from `planets`
    # below, which is a milestone's own inline checklist. Don't conflate.
    orbit_order = models.PositiveIntegerField(null=True, blank=True)

    # Checklist steps (STARMAP_SPEC §5: "a glorified checklist, not a gating
    # mechanism"). Shape: [{"label": str, "done": bool, "order": int}].
    # Field names match frontend-web's planet object shape exactly, so the
    # serializer needs no translation.
    planets = models.JSONField(default=list)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_star(self):
        """A Milestone becomes a Star when approved."""
        return self.status == MilestoneStatus.APPROVED

    def __str__(self):
        return f"{self.title} [{self.status}]"


# ─── Constellation Edge (DEC-013) ──────────────────────────────────────────────
class ConstellationEdge(TimestampedModel):
    """
    One directed edge in a constellation's DAG: from_milestone must precede
    to_milestone in sequence. Mirrors frontend-web's js/starGraph.js edge
    shape {from, to} exactly — no translation layer needed beyond field
    naming in the serializer.

    `constellation` is denormalized (derivable from either milestone's own
    .constellation) so the edge-replace/split/delete endpoints can bulk
    filter/delete by one FK instead of joining through both milestones, and
    so an edge can never silently span two different constellations.
    """
    constellation = models.ForeignKey(
        Constellation, on_delete=models.CASCADE, related_name="edges"
    )
    from_milestone = models.ForeignKey(
        Milestone, on_delete=models.CASCADE, related_name="outgoing_edges"
    )
    to_milestone = models.ForeignKey(
        Milestone, on_delete=models.CASCADE, related_name="incoming_edges"
    )

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["constellation", "from_milestone", "to_milestone"],
                name="unique_edge_per_constellation",
            ),
            models.CheckConstraint(
                check=~models.Q(from_milestone=models.F("to_milestone")),
                name="no_self_edge",
            ),
        ]

    def __str__(self):
        return f"{self.from_milestone_id} → {self.to_milestone_id}"


# ─── Evidence ─────────────────────────────────────────────────────────────────
class EvidenceType(models.TextChoices):
    PHOTO       = "photo",       "Photo"
    VIDEO       = "video",       "Video"
    TEXT        = "text",        "Text description"
    LINK        = "link",        "External link"
    CERTIFICATE = "certificate", "Certificate / file"


class Evidence(TimestampedModel):
    """
    Proof attached to a Milestone submission.
    In v1: text and links stored inline. Photos/videos as base64 in dev,
    GCS URLs in phase 4+ (just change payload to a GCS URL — no schema change).
    """
    milestone = models.ForeignKey(Milestone, on_delete=models.CASCADE, related_name="evidence")
    type      = models.CharField(max_length=20, choices=EvidenceType.choices)
    payload   = models.TextField()  # text content OR URL (GCS or external)
    label     = models.CharField(max_length=200, blank=True)  # optional filename/description

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.type}: {self.label or self.payload[:50]}"
