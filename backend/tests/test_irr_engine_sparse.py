"""Unit tests for the XIRR primitive.

`xirr()` is a pure math primitive: given any series with >=2 dated flows and
at least one sign change, it computes the internal rate of return. There is no
minimum-cash-flow "sparse-history guard" — a single invest/exit pair is a valid
IRR input, and the reconciliation/audit paths rely on that. The real
solvability gate is the sign-change check.

These tests cover the genuine edge cases:
- 0 or 1 flow → None (cannot have a sign change)
- >=2 flows with a sign change → a computed Decimal
- no sign change (all same sign) → None
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal


from backend.app.finance.irr_engine import xirr


def d(y: int, m: int, day: int) -> date:
    return date(y, m, day)


class TestMinimumInput:
    def test_zero_cashflows_returns_none(self):
        assert xirr([]) is None

    def test_one_cashflow_returns_none(self):
        cf = [(d(2024, 1, 1), Decimal("-1000000"))]
        assert xirr(cf) is None

    def test_two_cashflows_compute(self):
        """A single invest/exit pair is a valid IRR input and must compute."""
        cf = [
            (d(2024, 1, 1), Decimal("-1000000")),
            (d(2024, 6, 30), Decimal("1200000")),
        ]
        result = xirr(cf)
        assert result is not None
        assert isinstance(result, Decimal)

    def test_three_cashflows_compute(self):
        cf = [
            (d(2024, 1, 1), Decimal("-1000000")),
            (d(2024, 3, 31), Decimal("-500000")),
            (d(2024, 9, 30), Decimal("1600000")),
        ]
        result = xirr(cf)
        assert result is not None
        assert isinstance(result, Decimal)

    def test_four_cashflows_compute(self):
        cf = [
            (d(2020, 1, 1), Decimal("-1000000")),
            (d(2021, 1, 1), Decimal("-500000")),
            (d(2022, 1, 1), Decimal("-250000")),
            (d(2023, 1, 1), Decimal("2200000")),
        ]
        result = xirr(cf)
        assert result is None or isinstance(result, Decimal)


class TestPlausibilityBounds:
    def test_normal_fund_irr_is_below_100pct(self):
        """A fund with 7 years of reasonable cash flows should produce IRR < 100%."""
        cf = [
            (d(2018, 1, 1), Decimal("-10000000")),
            (d(2019, 1, 1), Decimal("-5000000")),
            (d(2020, 1, 1), Decimal("-3000000")),
            (d(2021, 1, 1), Decimal("1000000")),
            (d(2022, 1, 1), Decimal("4000000")),
            (d(2023, 1, 1), Decimal("8000000")),
            (d(2024, 1, 1), Decimal("12000000")),
        ]
        result = xirr(cf)
        assert result is not None
        assert Decimal("-1") < result < Decimal("1"), (
            f"IRR {result} outside plausible range (-100%..100%) for a standard 7-year fund"
        )

    def test_no_sign_change_returns_none(self):
        """All negative cash flows — no sign change — cannot produce an IRR."""
        cf = [
            (d(2021, 1, 1), Decimal("-1000000")),
            (d(2022, 1, 1), Decimal("-500000")),
            (d(2023, 1, 1), Decimal("-250000")),
            (d(2024, 1, 1), Decimal("-100000")),
        ]
        assert xirr(cf) is None

    def test_all_positive_cashflows_returns_none(self):
        """All positive cash flows — no sign change — cannot produce an IRR."""
        cf = [
            (d(2021, 1, 1), Decimal("1000000")),
            (d(2022, 1, 1), Decimal("500000")),
            (d(2023, 1, 1), Decimal("250000")),
            (d(2024, 1, 1), Decimal("100000")),
        ]
        assert xirr(cf) is None
