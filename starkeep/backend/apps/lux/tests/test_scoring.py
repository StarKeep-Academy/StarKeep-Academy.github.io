"""
apps/lux/tests/test_scoring.py

Unit tests for the LVM formula. These are the most important tests
in the codebase — if these fail, LUX issuance is wrong.

Run with: python manage.py test apps.lux.tests.test_scoring

All examples sourced from Starkeep Design Manifesto §5.2.
"""

from django.test import SimpleTestCase
from apps.lux.scoring import compute_lux, lux_after_level_up, LVMInput, LVMResult, VSM, MILESTONE_CAP


class TestLVMFormula(SimpleTestCase):
    """Core formula tests. Manifesto example is the canonical reference."""

    def test_manifesto_example(self):
        """
        Manifesto §5.2 example:
          I=4, S=3, U=2, R=2, H=3, VSM=1.10 → IssuedLUX = 16
        """
        scores = LVMInput(i=4, s=3, u=2, r=2, h=3, vsm=VSM.PEER)
        result = compute_lux(scores)

        # Verify intermediate values
        # RawScore = (4×0.30)+(3×0.25)+(2×0.20)+(2×0.15)+(3×0.10)
        #          = 1.20 + 0.75 + 0.40 + 0.30 + 0.30 = 2.95
        self.assertAlmostEqual(result.raw_score, 2.95, places=4)
        # BaseLUX = 2.95 × 5 = 14.75
        self.assertAlmostEqual(result.base_lux, 14.75, places=4)
        # IssuedLUX = floor(14.75 × 1.10) = floor(16.225) = 16
        self.assertEqual(result.issued_lux, 16)
        self.assertFalse(result.capped)

    def test_zero_scores(self):
        """Zero scores → zero LUX."""
        result = compute_lux(LVMInput(i=0, s=0, u=0, r=0, h=0, vsm=VSM.BASIC))
        self.assertEqual(result.issued_lux, 0)

    def test_max_scores_basic_vsm(self):
        """Max scores (5,5,5,5,5) + basic VSM → BaseLUX = 25, IssuedLUX = 25."""
        result = compute_lux(LVMInput(i=5, s=5, u=5, r=5, h=5, vsm=VSM.BASIC))
        self.assertAlmostEqual(result.raw_score, 5.0, places=4)
        self.assertAlmostEqual(result.base_lux, 25.0, places=4)
        self.assertEqual(result.issued_lux, 25)
        self.assertFalse(result.capped)

    def test_max_scores_certificate_vsm_hits_cap(self):
        """Max scores + certificate VSM → would be 31, capped at 30."""
        result = compute_lux(LVMInput(i=5, s=5, u=5, r=5, h=5, vsm=VSM.CERTIFICATE))
        # floor(25 × 1.25) = floor(31.25) = 31 → capped at 30
        self.assertEqual(result.issued_lux, MILESTONE_CAP)
        self.assertTrue(result.capped)

    def test_vsm_basic(self):
        """VSM=1.00 (basic evidence) — no multiplier effect."""
        result = compute_lux(LVMInput(i=2, s=2, u=2, r=2, h=2, vsm=VSM.BASIC))
        # RawScore = 2.0, BaseLUX = 10.0, IssuedLUX = floor(10.0 × 1.00) = 10
        self.assertEqual(result.issued_lux, 10)

    def test_vsm_ngo(self):
        """VSM=1.15 (NGO witness)."""
        result = compute_lux(LVMInput(i=2, s=2, u=2, r=2, h=2, vsm=VSM.NGO))
        # floor(10.0 × 1.15) = floor(11.5) = 11
        self.assertEqual(result.issued_lux, 11)

    def test_milestone_cap_applied(self):
        """IssuedLUX is capped at MILESTONE_CAP regardless of scores."""
        # Force a value over cap
        result = compute_lux(
            LVMInput(i=5, s=5, u=5, r=5, h=5, vsm=VSM.CERTIFICATE),
            cap=30
        )
        self.assertLessEqual(result.issued_lux, 30)
        self.assertTrue(result.capped)

    def test_custom_scale(self):
        """Scale parameter changes BaseLUX proportionally."""
        scores = LVMInput(i=2, s=2, u=2, r=2, h=2, vsm=VSM.BASIC)
        result_default = compute_lux(scores, scale=5)
        result_double  = compute_lux(scores, scale=10)
        self.assertEqual(result_double.issued_lux, result_default.issued_lux * 2)


class TestLVMInputValidation(SimpleTestCase):
    """Invalid inputs should raise ValueError before any computation."""

    def test_axis_above_5_raises(self):
        with self.assertRaises(ValueError):
            compute_lux(LVMInput(i=6, s=3, u=2, r=2, h=3, vsm=VSM.BASIC))

    def test_axis_below_0_raises(self):
        with self.assertRaises(ValueError):
            compute_lux(LVMInput(i=-1, s=3, u=2, r=2, h=3, vsm=VSM.BASIC))

    def test_invalid_vsm_raises(self):
        with self.assertRaises(ValueError):
            compute_lux(LVMInput(i=3, s=3, u=3, r=3, h=3, vsm=1.50))  # 1.50 not in VSM


class TestLevelUpCalculation(SimpleTestCase):
    """Level-up consumption splits issued LUX into level gain + wallet credit."""

    def test_exact_multiple(self):
        """10 LUX / 5 per level = 2 levels, 0 remaining."""
        levels, wallet_lux = lux_after_level_up(10, lux_per_level=5)
        self.assertEqual(levels, 2)
        self.assertEqual(wallet_lux, 0)

    def test_with_remainder(self):
        """16 LUX / 5 per level = 3 levels (15 LUX), 1 remaining."""
        levels, wallet_lux = lux_after_level_up(16, lux_per_level=5)
        self.assertEqual(levels, 3)
        self.assertEqual(wallet_lux, 1)

    def test_below_level_cost(self):
        """3 LUX < 5 per level → 0 levels, all 3 go to wallet."""
        levels, wallet_lux = lux_after_level_up(3, lux_per_level=5)
        self.assertEqual(levels, 0)
        self.assertEqual(wallet_lux, 3)

    def test_zero_lux(self):
        levels, wallet_lux = lux_after_level_up(0)
        self.assertEqual(levels, 0)
        self.assertEqual(wallet_lux, 0)

    def test_manifesto_example_pipeline(self):
        """
        Full pipeline: manifesto example → 16 LUX → level-up split.
        16 / 5 = 3 levels (15 LUX consumed), 1 LUX to wallet.
        """
        scores = LVMInput(i=4, s=3, u=2, r=2, h=3, vsm=VSM.PEER)
        result = compute_lux(scores)
        self.assertEqual(result.issued_lux, 16)

        levels, wallet_lux = lux_after_level_up(result.issued_lux)
        self.assertEqual(levels, 3)
        self.assertEqual(wallet_lux, 1)
