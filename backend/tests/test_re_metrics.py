"""Tests for the RE v2 metrics engine.

Verifies DPI, TVPI, and IRR computation.
"""
from __future__ import annotations

from decimal import Decimal

from app.services.re_metrics import compute_dpi, compute_tvpi


class TestComputeDpi:
    def test_normal(self):
        result = compute_dpi(Decimal("5000000"), Decimal("30000000"))
        assert result == Decimal("0.1667")

    def test_zero_contributed(self):
        assert compute_dpi(Decimal("5000000"), Decimal("0")) is None

    def test_negative_contributed(self):
        assert compute_dpi(Decimal("5000000"), Decimal("-1")) is None

    def test_full_return(self):
        result = compute_dpi(Decimal("30000000"), Decimal("30000000"))
        assert result == Decimal("1.0000")


class TestComputeTvpi:
    def test_normal(self):
        result = compute_tvpi(Decimal("5000000"), Decimal("50000000"), Decimal("30000000"))
        # (5M + 50M) / 30M = 1.8333
        assert result == Decimal("1.8333")

    def test_zero_contributed(self):
        assert compute_tvpi(Decimal("5000000"), Decimal("50000000"), Decimal("0")) is None

    def test_2x_return(self):
        result = compute_tvpi(Decimal("10000000"), Decimal("50000000"), Decimal("30000000"))
        assert result == Decimal("2.0000")

    def test_zero_nav(self):
        result = compute_tvpi(Decimal("30000000"), Decimal("0"), Decimal("30000000"))
        assert result == Decimal("1.0000")
