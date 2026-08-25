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

# ─── Archetype vocabulary ────────────────────────────────────────────────────
# The accepted value sets for the quiz's `results` block. Canonical here so the
# ingest serializer, the dev quiz stub, and docs/QUIZ_SSO_INTEGRATION.md cannot
# drift apart. Lowercase on the wire; the UI does its own casing.

ZODIAC_SIGNS: list[str] = [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
]

# The twelve Jungian archetypes — the canonical stored vocabulary.
#
# This archetype is "hermit", not the more common Jungian "sage". The heroic
# path now called Truthseeker was previously called Sage, so "sage" is a
# retired path name in this project's history; using it for an archetype too
# would make the two taxonomies ambiguous, and would do so again if the paths
# are ever renamed. Storing exactly one name for this archetype keeps future
# path renames free of that collision.
JUNG_ARCHETYPES: list[str] = [
    "innocent", "everyman", "hero", "caregiver", "explorer", "rebel",
    "lover", "creator", "jester", "hermit", "magician", "ruler",
]

# Deprecated inbound spellings, folded to canonical before validation, so an
# older caller is accepted without ever putting a second name in the database.
JUNG_ALIASES: dict[str, str] = {
    "sage": "hermit",
    "outlaw": "rebel",   # the quiz's own former display name for this one
}


def canonical_jung(slug: str) -> str:
    """Fold a deprecated archetype spelling onto its canonical slug."""
    lowered = (slug or "").strip().lower()
    return JUNG_ALIASES.get(lowered, lowered)

MBTI_TYPES: list[str] = [
    "INFP", "INFJ", "INTP", "INTJ", "ISFP", "ISFJ", "ISTP", "ISTJ",
    "ENFP", "ENFJ", "ENTP", "ENTJ", "ESFP", "ESFJ", "ESTP", "ESTJ",
]


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


# ─── Natal chart placements ──────────────────────────────────────────────────
# The twelve the quiz computes (Swiss Ephemeris): ten planetary bodies plus the
# Ascendant and Midheaven. Ordered as rendered in the Avatar page's glyph grid.
#
# The Imum Coeli and Descendant are deliberately absent. They are derivable
# (each is the exact opposite of the Midheaven / Ascendant), but nothing renders
# them, and a derived API field no client reads is just surface area. The grid
# is these twelve. The North Node has no source in the quiz's output at all.

CHART_PLACEMENTS: list[dict] = [
    {"key": "sun",       "field": "sun_sign",       "glyph": "☉",   "label": "SUN"},
    {"key": "moon",      "field": "moon_sign",      "glyph": "☽",   "label": "MOON"},
    {"key": "rising",    "field": "rising_sign",    "glyph": "ASC", "label": "ASCENDANT"},
    {"key": "mercury",   "field": "mercury_sign",   "glyph": "☿",   "label": "MERCURY"},
    {"key": "venus",     "field": "venus_sign",     "glyph": "♀",   "label": "VENUS"},
    {"key": "mars",      "field": "mars_sign",      "glyph": "♂",   "label": "MARS"},
    {"key": "jupiter",   "field": "jupiter_sign",   "glyph": "♃",   "label": "JUPITER"},
    {"key": "saturn",    "field": "saturn_sign",    "glyph": "♄",   "label": "SATURN"},
    {"key": "uranus",    "field": "uranus_sign",    "glyph": "♅",   "label": "URANUS"},
    {"key": "neptune",   "field": "neptune_sign",   "glyph": "♆",   "label": "NEPTUNE"},
    {"key": "pluto",     "field": "pluto_sign",     "glyph": "♇",   "label": "PLUTO"},
    {"key": "midheaven", "field": "midheaven_sign", "glyph": "MC",  "label": "MIDHEAVEN"},
]

CHART_SIGN_FIELDS: list[str] = [p["field"] for p in CHART_PLACEMENTS]
