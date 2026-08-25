"""
apps/avatar/serializers.py

AvatarMiniSerializer  — /auth/me and login responses (slug strings, not objects)
AvatarFullSerializer  — GET /avatars/{id} (Image 7 wireframe, VR-stable — DEC-006)
AvatarUpdateSerializer — PATCH /avatars/{id}
ArchetypeProfileSerializer — archetype endpoints
"""

from rest_framework import serializers
from .models import Avatar, ArchetypeProfile, HeroicPath, LearningPath
from .metadata import (
    CHART_PLACEMENTS,
    JUNG_ARCHETYPES,
    MBTI_TYPES,
    canonical_jung,
    ZODIAC_SIGNS,
    heroic_path_object,
    learning_path_object,
)


class AvatarMiniSerializer(serializers.ModelSerializer):
    """Minimal avatar bundle for auth responses. heroic/learning_path stay as slugs here."""
    has_archetype = serializers.SerializerMethodField()

    def get_has_archetype(self, obj):
        return hasattr(obj, "archetype")

    class Meta:
        model  = Avatar
        fields = [
            "id",
            "alias",
            "display_name",
            "level",
            "heroic_path",
            "learning_path",
            "has_archetype",
        ]


class ArchetypeProfileSerializer(serializers.ModelSerializer):
    """
    Full archetype data. Used by GET /avatars/{id}/archetype and embedded in
    AvatarFull. VR-stable (DEC-006) - add fields, never rename them.
    """

    # Ordered, glyph-annotated view of the chart, so the client needn't hardcode
    # placement order or which field pairs with which glyph. Twelve entries.
    chart = serializers.SerializerMethodField()

    def get_chart(self, obj):
        return [
            {
                "key": placement["key"],
                "field": placement["field"],
                "glyph": placement["glyph"],
                "label": placement["label"],
                "sign": getattr(obj, placement["field"], ""),
            }
            for placement in CHART_PLACEMENTS
        ]

    class Meta:
        model  = ArchetypeProfile
        fields = [
            "sun_sign",
            "moon_sign",
            "rising_sign",
            "mercury_sign",
            "venus_sign",
            "mars_sign",
            "jupiter_sign",
            "saturn_sign",
            "uranus_sign",
            "neptune_sign",
            "pluto_sign",
            "midheaven_sign",
            "chart",
            "jung_archetype",
            "mbti",
            "recommended_heroic_path",
            "recommended_learning_path",
            "purpose_seed",
            "breakdowns",
            "visionary_trait",
            "divergent_trait",
        ]


class _NormalizedChoiceField(serializers.ChoiceField):
    """
    A case-insensitive ChoiceField.

    ChoiceField runs its membership check inside to_internal_value, before any
    `validate_<field>` hook, so folding case in a hook is too late — "intj"
    would 400 before we ever saw it. Casing is exactly the sort of cosmetic
    mismatch two teams discover at integration time, and it should not be a
    failure. Fold on the way in instead.
    """

    def __init__(self, choices, transform=None, **kwargs):
        self.transform = transform or (lambda s: s.lower())
        super().__init__(choices, **kwargs)

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = self.transform(data.strip())
        return super().to_internal_value(data)


class ArchetypeResultsSerializer(serializers.Serializer):
    """
    Validates the `results` block of an inbound quiz payload
    (POST /avatars/{id}/archetype).

    STARKEEP_CONTEXT.md §7 has always promised this validation; until now the
    view copied fields straight through. That mattered because
    `recommended_heroic_path` is written onto `avatar.heroic_path` (DEC-012), so
    a stale or typo'd slug from the quiz silently corrupted the profile into a
    value no glyph or campus lookup could resolve. Constrained choices turn that
    into a 400 the quiz repo can actually see and fix.

    Every field is optional — a quiz that only produces some of these is valid,
    and absent fields simply don't overwrite what's stored.
    """

    _optional = {"required": False, "allow_blank": True, "default": ""}

    # Full natal chart - ten bodies plus the Midheaven. All share one value
    # set, so there is no per-field normalization to get wrong.
    sun_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    moon_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    rising_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    mercury_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    venus_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    mars_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    jupiter_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    saturn_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    uranus_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    neptune_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    pluto_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    midheaven_sign = _NormalizedChoiceField(choices=ZODIAC_SIGNS, **_optional)
    # canonical_jung folds deprecated spellings (sage -> hermit, outlaw ->
    # rebel) before the choice check, so a legacy caller is accepted without
    # ever storing a second name for the same archetype.
    jung_archetype = _NormalizedChoiceField(
        choices=JUNG_ARCHETYPES, transform=canonical_jung, **_optional
    )
    mbti = _NormalizedChoiceField(choices=MBTI_TYPES, transform=lambda s: s.upper(), **_optional)
    recommended_heroic_path = _NormalizedChoiceField(choices=HeroicPath.choices, **_optional)
    recommended_learning_path = _NormalizedChoiceField(choices=LearningPath.choices, **_optional)
    purpose_seed = serializers.CharField(required=False, allow_blank=True, default="", max_length=500)
    # Dropped from the documented contract in v1.1 (they duplicated the two
    # recommended_* fields — see ArchetypeProfile). Still accepted so an older
    # caller does not break; nothing requires them.
    visionary_trait = serializers.CharField(required=False, allow_blank=True, default="")
    divergent_trait = serializers.CharField(required=False, allow_blank=True, default="")


class ArchetypeBreakdownsField(serializers.Field):
    """
    Interpretive copy from the quiz: {results_key: {title, body}}.

    Plain text only. This is third-party content that ends up rendered on a
    Starkeep page, so it is size-capped on the way in and the client renders it
    through textContent, never innerHTML. The caps exist so a runaway or hostile
    payload cannot park megabytes in a JSONB column - the quiz's own estimate is
    ~150-500 words per body, and MAX_BODY is roughly four times that ceiling.
    """

    MAX_ENTRIES = 32
    MAX_TITLE = 200
    MAX_BODY = 12_000

    def to_representation(self, value):
        return value or {}

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("breakdowns must be an object.")
        if len(data) > self.MAX_ENTRIES:
            raise serializers.ValidationError(
                f"breakdowns may hold at most {self.MAX_ENTRIES} entries, got {len(data)}."
            )

        allowed = set(ArchetypeResultsSerializer().fields)
        cleaned = {}
        for key, entry in data.items():
            if key not in allowed:
                # Named rather than dropped silently - a typo'd key would
                # otherwise vanish and look like our bug instead of theirs.
                raise serializers.ValidationError(
                    f"breakdowns key '{key}' is not a known results field."
                )
            if not isinstance(entry, dict):
                raise serializers.ValidationError(f"breakdowns['{key}'] must be an object.")

            title = str(entry.get("title", "")).strip()
            body = str(entry.get("body", "")).strip()
            if len(title) > self.MAX_TITLE:
                raise serializers.ValidationError(
                    f"breakdowns['{key}'].title exceeds {self.MAX_TITLE} characters."
                )
            if len(body) > self.MAX_BODY:
                raise serializers.ValidationError(
                    f"breakdowns['{key}'].body exceeds {self.MAX_BODY} characters."
                )
            if not body:
                continue  # an entry with no text is not worth storing
            cleaned[key] = {"title": title, "body": body}

        return cleaned


class ArchetypePayloadSerializer(serializers.Serializer):
    """The full envelope the quiz repo POSTs. See STARKEEP_CONTEXT.md §7."""

    version = serializers.CharField(required=False, default="1.0", max_length=20)
    quiz_run_id = serializers.CharField(required=False, allow_blank=True, default="", max_length=100)
    completed_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    results = ArchetypeResultsSerializer()
    breakdowns = ArchetypeBreakdownsField(required=False, default=dict)
    raw = serializers.JSONField(required=False, default=dict)


class AvatarFullSerializer(serializers.ModelSerializer):
    """
    Full Image 7 avatar profile for GET /avatars/{id}.
    VR-stable (DEC-006): field names here never change — add only, never rename.
    heroic_path and learning_path are expanded from slugs to full objects.
    """
    heroic_path   = serializers.SerializerMethodField()
    learning_path = serializers.SerializerMethodField()
    archetype     = serializers.SerializerMethodField()

    def get_heroic_path(self, obj):
        return heroic_path_object(obj.heroic_path)

    def get_learning_path(self, obj):
        return learning_path_object(obj.learning_path)

    def get_archetype(self, obj):
        profile = getattr(obj, "archetype", None)
        if profile is None:
            return None
        return ArchetypeProfileSerializer(profile).data

    class Meta:
        model  = Avatar
        fields = [
            "id",
            "alias",
            "display_name",
            "level",
            "heroic_path",
            "learning_path",
            "purpose",
            "north_star_goal",
            "powers",
            "archetype",
            "hours_of_impact",
            "impact_sources",
            "created_at",
            "updated_at",
        ]


class AvatarUpdateSerializer(serializers.ModelSerializer):
    """PATCH /avatars/{id} — all fields optional."""
    _optional = ["alias", "display_name", "purpose", "north_star_goal", "heroic_path", "learning_path"]

    class Meta:
        model  = Avatar
        fields = ["alias", "display_name", "purpose", "north_star_goal", "heroic_path", "learning_path"]
        extra_kwargs = {f: {"required": False} for f in ["alias", "display_name", "purpose", "north_star_goal", "heroic_path", "learning_path"]}
