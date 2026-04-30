"""
apps/avatar/metadata.py

Static product data for Heroic and Learning Paths.
Supplements TextChoices slugs with campus, insignia, and display info.
Not stored in DB. Source: STARKEEP_CONTEXT.md §3–4.
"""

HEROIC_PATH_META: dict[str, dict] = {
    "earthwatcher": {
        "display_name":    "Earthwatcher",
        "campus":          "Mountain Campus",
        "campus_insignia": "cube",
    },
    "peacebringer": {
        "display_name":    "Peacebringer",
        "campus":          "Ocean Campus",
        "campus_insignia": "icosahedron",
    },
    "storyteller": {
        "display_name":    "Storyteller",
        "campus":          "Cloud Campus",
        "campus_insignia": "octahedron",
    },
    "innovator": {
        "display_name":    "Innovator",
        "campus":          "Sun Campus",
        "campus_insignia": "tetrahedron",
    },
    "dreamwalker": {
        "display_name":    "Dreamwalker",
        "campus":          "Soul Campus",
        "campus_insignia": "star_tetrahedron",
    },
    "truthseeker": {
        "display_name":    "Truthseeker",
        "campus":          "World Campus",
        "campus_insignia": "dodecahedron",
    },
}

LEARNING_PATH_META: dict[str, dict] = {
    "scholar":    {"display_name": "Scholar"},
    "wayfinder":  {"display_name": "Wayfinder"},
    "specialist": {"display_name": "Specialist"},
    "divergent":  {"display_name": "Divergent"},
    "generalist": {"display_name": "Generalist"},
    "mystic":     {"display_name": "Mystic"},
}


def heroic_path_object(slug: str) -> dict | None:
    """Expand a HeroicPath slug into the full VR-stable object (API_CONTRACT.md)."""
    if not slug:
        return None
    meta = HEROIC_PATH_META.get(slug, {})
    return {
        "slug":            slug,
        "display_name":    meta.get("display_name", slug.capitalize()),
        "campus":          meta.get("campus", ""),
        "campus_insignia": meta.get("campus_insignia", ""),
        "glyph_url":       f"/static/glyphs/heroic/{slug}.svg",
    }


def learning_path_object(slug: str) -> dict | None:
    """Expand a LearningPath slug into the full VR-stable object."""
    if not slug:
        return None
    meta = LEARNING_PATH_META.get(slug, {})
    return {
        "slug":         slug,
        "display_name": meta.get("display_name", slug.capitalize()),
        "glyph_url":    f"/static/glyphs/learning/{slug}.svg",
    }
