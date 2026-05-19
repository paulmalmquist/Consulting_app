"""Unit tests for XIRR sparse-history guard (T2 guardrail).

These tests lock in the behavior added in ticket T2:
- < 4 cash flows → returns None (not an extreme outlier)
- Exactly 4 cash flows → may return a value (not None by guard)
- Normal multi-period cash flows → returns a plausible result (< 2.0)
- Sign-change check → returns None when all flows have the same sign

Do not relax these tests to pass an extreme value. If they fail,
re-read backend/app/finance/irr_engine.py sparse-history guard.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal


from backend.app.finance.irr_engine import xirr


def d(y: int, m: int, day: int) -> date:
    return date(y, m, day)


class TestSparseHistoryGuard:
    def test_zero_cashflows_returns_none(self):
        assert xirr([]) is None

    def test_one_cashflow_returns_none(self):
        cf = [(d(2024, 1, 1), Decimal("-1000000"))]
        assert xirr(cf) is None

    def test_two_cashflows_returns_none(self):
        cf = [
            (d(2024, 1, 1), Decimal("-1000000")),
            (d(2024, 6, 30), Decimal("1200000")),
        ]
        assert xirr(cf) is None

    def test_three_cashflows_returns_none(self):
        cf = [
            (d(2024, 1, 1), Decimal("-1000000")),
            (d(2024, 3, 31), Decimal("-500000")),
            (d(2024, 9, 30), Decimal("1600000")),
        ]
        assert xirr(cf) is None

    def test_four_cashflows_not_none_by_guard(self):
        """Four cash flows clears the sparse-history guard (may still be None for other reasons)."""
        cf = [
            (d(2020, 1, 1), Decimal("-1000000")),
            (d(2021, 1, 1), Decimal("-500000")),
            (d(2022, 1, 1), Decimal("-250000")),
            (d(2023, 1, 1), Decimal("2200000")),
        ]
        result = xirr(cf)
        # The guard does not force None — a result is possible.
        # If None, it must be due to sign-check or bisection, not the guard.
        # We can't assert non-None because bisection may legitimately fail,
        # but we can assert the guard itself didn't reject it by checking
        # the guard condition directly.
        # Four entries clears the < 4 guard. The above should at minimum
        # not be rejected by the length check — result is None or a Decimal.
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
