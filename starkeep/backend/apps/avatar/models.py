"""
apps/avatar/models.py

Avatar is the central entity of Starkeep. Every other module
references an Avatar, never a raw User.

VR NOTE (DEC-006): Avatar data is served to VR clients via /avatars/{id}.
Field names here are stable — add fields freely, rename never.
"""

from django.db import models
from django.conf import settings
from apps.common.models import TimestampedModel


# ─── Heroic Path ─────────────────────────────────────────────────────────────
# DEC-002: These slugs are canonical. Match STARKEEP_CONTEXT.md §3 exactly.
class HeroicPath(models.TextChoices):
    EARTHWATCHER = "earthwatcher", "Earthwatcher"
    PEACEBRINGER = "peacebringer", "Peacebringer"
    STORYTELLER  = "storyteller",  "Storyteller"
    INNOVATOR    = "innovator",    "Innovator"
    DREAMWALKER  = "dreamwalker",  "Dreamwalker"
    TRUTHSEEKER  = "truthseeker",  "Truthseeker"


# ─── Learning Path ────────────────────────────────────────────────────────────
# DEC-002: Match STARKEEP_CONTEXT.md §4 exactly.
class LearningPath(models.TextChoices):
    SCHOLAR    = "scholar",    "Scholar"
    WAYFINDER  = "wayfinder",  "Wayfinder"
    SPECIALIST = "specialist", "Specialist"
    DIVERGENT  = "divergent",  "Divergent"
    GENERALIST = "generalist", "Generalist"
    MYSTIC     = "mystic",     "Mystic"


# ─── Avatar ───────────────────────────────────────────────────────────────────
class Avatar(TimestampedModel):
    """
    A user's heroic persona. One per user. The core identity object.

    Image 7 left panel: alias, level, heroic_path, display_name, powers
    Image 7 center panel: level, heroic_path, learning_path, purpose
    Image 7 right panel: hours_of_impact, impact_sources, purpose
    All of these fields come from this model + ArchetypeProfile below.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="avatar",
    )

    # Identity
    alias        = models.CharField(max_length=50)           # e.g. "DREAMWALKER"
    display_name = models.CharField(max_length=100)          # e.g. "Ryan Boyd"
    level        = models.PositiveIntegerField(default=0)    # computed from LUX consumption

    # Paths (DEC-012: set after archetype quiz, not at signup)
    heroic_path   = models.CharField(max_length=20, choices=HeroicPath.choices, blank=True)
    learning_path = models.CharField(max_length=20, choices=LearningPath.choices, blank=True)

    # Purpose
    purpose = models.TextField(blank=True)                   # e.g. "Self-Actualization Architect"
    powers  = models.JSONField(default=list)                 # unlocked by achievements, displayed on avatar card

    # Impact tracking
    hours_of_impact = models.PositiveIntegerField(default=0)
    impact_sources  = models.JSONField(default=list)         # [{ "label": "...", "hours": N }]

    class Meta:
        verbose_name = "Avatar"
        verbose_name_plural = "Avatars"

    def __str__(self):
        return f"{self.alias} ({self.display_name})"


# ─── Archetype Profile ────────────────────────────────────────────────────────
class ArchetypeProfile(TimestampedModel):
    """
    Results from the external archetype quiz repo.
    Populated via POST /api/v1/avatars/{id}/archetype (DEC-007).

    Image 7 right panel: astro, jung, mbti columns come from here.
    """
    avatar = models.OneToOneField(
        Avatar,
        on_delete=models.CASCADE,
        related_name="archetype",
    )

    # Image 7 ASTRO column
    sun_sign    = models.CharField(max_length=30, blank=True)
    moon_sign   = models.CharField(max_length=30, blank=True)
    rising_sign = models.CharField(max_length=30, blank=True)

    # Image 7 JUNG column
    jung_archetype = models.CharField(max_length=50, blank=True)   # e.g. "magician"

    # Image 7 MBTI column
    mbti = models.CharField(max_length=10, blank=True)             # e.g. "INFP"

    # Trait descriptions (Image 7 right panel body text)
    visionary_trait = models.TextField(blank=True)
    divergent_trait = models.TextField(blank=True)

    # Recommendations (pre-fill for path selection per DEC-012)
    recommended_heroic_path   = models.CharField(max_length=20, choices=HeroicPath.choices, blank=True)
    recommended_learning_path = models.CharField(max_length=20, choices=LearningPath.choices, blank=True)
    purpose_seed              = models.CharField(max_length=200, blank=True)

    # Provenance
    quiz_run_id   = models.CharField(max_length=100, blank=True)
    quiz_version  = models.CharField(max_length=10, default="1.0")
    completed_at  = models.DateTimeField(null=True, blank=True)

    # JSONB: full quiz output, verbatim. Schema may evolve in external repo.
    raw_quiz_output = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Archetype Profile"

    def __str__(self):
        return f"Archetype for {self.avatar.alias}"
