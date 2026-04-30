"""
apps/lux/scoring.py

The Lux Valuation Metric (LVM) — a pure function with no side effects.
No database access. No Django imports. Just math.

Source: Starkeep Design Manifesto §5.2 + STARKEEP_CONTEXT.md §5

This function is the single source of truth for LUX issuance.
The admin form, the API, unit tests, and future client-side preview
all call this same function.

DO NOT add database calls or Django dependencies here.
DO NOT change the formula without a DECISIONS.md entry.
"""

from dataclasses import dataclass
from math import floor


# ─── Constants (from settings, but also hardcoded here as defaults) ──────────
DEFAULT_SCALE = 5
MILESTONE_CAP = 30   # Hard cap: max LUX per milestone (manifesto §5.2)


# ─── VSM Values ──────────────────────────────────────────────────────────────
class VSM:
    """Validation Strength Multiplier values. Use these constants, not magic numbers."""
    BASIC       = 1.00   # timestamped photo, video, text documentation
    PEER        = 1.10   # peer/community confirmation
    NGO         = 1.15   # verified NGO / accredited witness
    CERTIFICATE = 1.25   # third-party certification

    CHOICES = [
        (BASIC,       "Basic (photo, video, text)"),
        (PEER,        "Peer / community confirmation"),
        (NGO,         "Verified NGO / accredited witness"),
        (CERTIFICATE, "Third-party certification"),
    ]


# ─── Input / Output Types ────────────────────────────────────────────────────
@dataclass
class LVMInput:
    """
    Five scoring axes, each 0–5. VSM from VSM class.
    Corresponds to the admin form fields in apps/lux/admin.py.

    i: Impact Longevity (30%) — how long does the benefit persist?
    s: Scope of Benefit (25%) — how many people / how deep?
    u: Urgency of Need (20%) — how critical is this intervention?
    r: Rarity & Innovation (15%) — how novel is the solution?
    h: Human Effort & Skill (10%) — how much labor and expertise?
    vsm: Validation Strength Multiplier
    """
    i:   float  # 0–5 Impact Longevity
    s:   float  # 0–5 Scope of Benefit
    u:   float  # 0–5 Urgency of Need
    r:   float  # 0–5 Rarity & Innovation
    h:   float  # 0–5 Human Effort & Skill
    vsm: float  # VSM.BASIC | VSM.PEER | VSM.NGO | VSM.CERTIFICATE


@dataclass
class LVMResult:
    raw_score:  float
    base_lux:   float
    issued_lux: int    # final value, floored and capped
    capped:     bool   # True if the cap was applied


# ─── The Formula ─────────────────────────────────────────────────────────────
def compute_lux(scores: LVMInput, scale: int = DEFAULT_SCALE, cap: int = MILESTONE_CAP) -> LVMResult:
    """
    Computes IssuedLUX from LVM scores.

    Formula (manifesto §5.2):
        RawScore  = (I × 0.30) + (S × 0.25) + (U × 0.20) + (R × 0.15) + (H × 0.10)
        BaseLUX   = RawScore × SCALE
        IssuedLUX = floor(BaseLUX × VSM)
        IssuedLUX = min(IssuedLUX, cap)

    Example from manifesto:
        I=4, S=3, U=2, R=2, H=3
        RawScore = (4×0.30) + (3×0.25) + (2×0.20) + (2×0.15) + (3×0.10)
                 = 1.20 + 0.75 + 0.40 + 0.30 + 0.30 = 2.95
        BaseLUX  = 2.95 × 5 = 14.75
        IssuedLUX = floor(14.75 × 1.10) = floor(16.225) = 16 ✓
    """
    _validate_scores(scores)

    raw_score = (
        scores.i * 0.30 +
        scores.s * 0.25 +
        scores.u * 0.20 +
        scores.r * 0.15 +
        scores.h * 0.10
    )

    base_lux   = raw_score * scale
    raw_issued = floor(base_lux * scores.vsm)
    capped     = raw_issued > cap
    issued_lux = min(raw_issued, cap)

    return LVMResult(
        raw_score=round(raw_score, 4),
        base_lux=round(base_lux, 4),
        issued_lux=issued_lux,
        capped=capped,
    )


def _validate_scores(scores: LVMInput) -> None:
    """Raise ValueError for obviously invalid inputs. Called before any computation."""
    axes = {"i": scores.i, "s": scores.s, "u": scores.u, "r": scores.r, "h": scores.h}
    for name, value in axes.items():
        if not (0 <= value <= 5):
            raise ValueError(f"LVM axis '{name}' must be between 0 and 5, got {value}")

    valid_vsm = {VSM.BASIC, VSM.PEER, VSM.NGO, VSM.CERTIFICATE}
    if scores.vsm not in valid_vsm:
        raise ValueError(f"VSM must be one of {valid_vsm}, got {scores.vsm}")


# ─── Level-Up Calculation ────────────────────────────────────────────────────
def lux_after_level_up(issued_lux: int, lux_per_level: int = 5) -> tuple[int, int]:
    """
    First N LUX of each issuance is consumed for level-up.
    Returns (levels_gained, lux_remaining_for_wallet).

    Settings: LUX_LEVEL_COST = 5 (settings.py)
    """
    if issued_lux <= 0:
        return 0, 0

    levels_gained    = issued_lux // lux_per_level
    lux_for_wallet   = issued_lux % lux_per_level

    # Edge case: if issued_lux < lux_per_level, no level gained, all goes to wallet
    if issued_lux < lux_per_level:
        return 0, issued_lux

    return levels_gained, lux_for_wallet
