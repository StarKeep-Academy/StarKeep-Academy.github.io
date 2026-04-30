"""
apps/avatar/serializers.py

AvatarMiniSerializer  — /auth/me and login responses (slug strings, not objects)
AvatarFullSerializer  — GET /avatars/{id} (Image 7 wireframe, VR-stable — DEC-006)
AvatarUpdateSerializer — PATCH /avatars/{id}
ArchetypeProfileSerializer — archetype endpoints
"""

from rest_framework import serializers
from .models import Avatar, ArchetypeProfile
from .metadata import heroic_path_object, learning_path_object


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
    """Full archetype data. Used by GET /avatars/{id}/archetype and embedded in AvatarFull."""
    class Meta:
        model  = ArchetypeProfile
        fields = [
            "sun_sign",
            "moon_sign",
            "rising_sign",
            "jung_archetype",
            "mbti",
            "recommended_heroic_path",
            "recommended_learning_path",
            "purpose_seed",
            "visionary_trait",
            "divergent_trait",
        ]


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
            "powers",
            "archetype",
            "hours_of_impact",
            "impact_sources",
            "created_at",
            "updated_at",
        ]


class AvatarUpdateSerializer(serializers.ModelSerializer):
    """PATCH /avatars/{id} — all fields optional."""
    _optional = ["alias", "display_name", "purpose", "heroic_path", "learning_path"]

    class Meta:
        model  = Avatar
        fields = ["alias", "display_name", "purpose", "heroic_path", "learning_path"]
        extra_kwargs = {f: {"required": False} for f in ["alias", "display_name", "purpose", "heroic_path", "learning_path"]}
