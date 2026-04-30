"""Tests for the included_asset_ids filter on the bottom-up rollup.

Phase 3 widens ``compute_fund_rollup`` and ``compute_investment_rollup`` with
an optional ``included_asset_ids`` parameter. Default behavior (None) is
unchanged — these tests pin down the new selective-rollup contract:

  * Asset IDs outside the filter are not loaded into the series.
  * Investments with zero in-scope assets get null_reason='no_assets_in_selection'.
  * Asset contributions list contains only in-scope assets.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest

from app.services.bottom_up_cashflow import CFPoint, IrrResult, quarter_end_date
from app.services.bottom_up_rollup import (
    compute_fund_rollup,
    compute_investment_rollup,
)


class _FakeCursor:
    """Minimal sequential-result cursor for tests when conftest is unavailable."""

    def __init__(self):
        self._results: list[list[dict]] = []
        self._idx = 0

    def push_result(self, rows: list[dict]):
        self._results.append(rows)

    def execute(self, sql: str, params=None):
        return self

    def fetchone(self):
        if self._idx < len(self._results):
            rows = self._results[self._idx]
            self._idx += 1
            return rows[0] if rows else None
        return None

    def fetchall(self):
        if self._idx < len(self._results):
            rows = self._results[self._idx]
            self._idx += 1
            return rows
        return []


@pytest.fixture
def fake_cursor():
    cur = _FakeCursor()

    @contextmanager
    def _ctx():
        yield cur

    targets = [
        "app.services.bottom_up_rollup.get_cursor",
        "app.services.bottom_up_cashflow.get_cursor",
        "app.services.bottom_up_refresh.get_cursor",
    ]
    started = [patch(t, _ctx) for t in targets]
    for p in started:
        p.start()
    try:
        yield cur
    finally:
        for p in started:
            p.stop()


def _point(q: str, amount: Decimal, **flags) -> CFPoint:
    return CFPoint(
        quarter=q,
        quarter_end_date=quarter_end_date(q),
        amount=amount,
        component_breakdown=flags.pop("breakdown", {}),
        has_actual=flags.get("has_actual", False),
        has_projection=flags.get("has_projection", False),
        has_exit=flags.get("has_exit", False),
        has_terminal_value=flags.get("has_terminal_value", False),
        warnings=flags.get("warnings", []),
    )


def _mk_asset_series(cost: Decimal, terminal: Decimal, *, exit_q: str = "2025-Q4") -> list[CFPoint]:
    return [
        _point("2024-Q1", -cost, breakdown={"acquisition": -float(cost)}),
        _point("2024-Q2", cost * Decimal("0.01"), has_actual=True),
        _point("2024-Q3", cost * Decimal("0.01"), has_actual=True),
        _point("2024-Q4", cost * Decimal("0.01"), has_actual=True),
        _point("2025-Q1", cost * Decimal("0.01"), has_actual=True),
        _point("2025-Q2", cost * Decimal("0.01"), has_actual=True),
        _point("2025-Q3", cost * Decimal("0.01"), has_actual=True),
        _point(exit_q, terminal, has_exit=True, breakdown={"exit": {"amount": float(terminal)}}),
    ]


def _mock_asset_lookups(assets_by_id: dict[UUID, dict]):
    def fake_build(asset_id, as_of_quarter, *, env_default_cap_rate=None):
        return list(assets_by_id[UUID(str(asset_id))]["series"])

    def fake_compute(asset_id, as_of_quarter, *, env_default_cap_rate=None, series=None):
        return assets_by_id[UUID(str(asset_id))]["irr"]

    def fake_resolve(asset_id, as_of):
        entry = assets_by_id[UUID(str(asset_id))]["ownership"]
        return entry(as_of) if callable(entry) else Decimal(str(entry))

    return [
        patch("app.services.bottom_up_rollup.build_asset_cf_series", fake_build),
        patch("app.services.bottom_up_rollup.compute_asset_irr", fake_compute),
        patch("app.services.bottom_up_rollup.resolve_ownership_pct", fake_resolve),
    ]


def test_investment_rollup_with_asset_filter_drops_excluded_assets(fake_cursor):
    inv_id = uuid4()
    a_in = uuid4()
    a_out = uuid4()

    fake_cursor.push_result(
        [
            {"asset_id": str(a_in), "name": "Included", "acquisition_date": date(2024, 1, 15)},
            {"asset_id": str(a_out), "name": "Filtered Out", "acquisition_date": date(2024, 1, 15)},
        ]
    )

    assets = {
        a_in: {
            "series": _mk_asset_series(Decimal("10000000"), Decimal("12500000")),
            "irr": IrrResult(value=Decimal("0.16"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
        a_out: {
            "series": _mk_asset_series(Decimal("5000000"), Decimal("6000000")),
            "irr": IrrResult(value=Decimal("0.18"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
    }

    patches = _mock_asset_lookups(assets)
    with patches[0], patches[1], patches[2]:
        roll = compute_investment_rollup(
            inv_id, "2025-Q4", included_asset_ids={a_in}
        )

    assert roll.null_reason is None
    assert len(roll.asset_contributions) == 1
    assert roll.asset_contributions[0].asset_id == a_in
    # The Q1 outflow should be -10M (only included asset), not -15M
    points_by_q = {p.quarter: p for p in roll.series}
    assert points_by_q["2024-Q1"].amount == Decimal("-10000000")


def test_investment_rollup_with_empty_filter_returns_no_assets_in_selection(fake_cursor):
    inv_id = uuid4()
    a1 = uuid4()
    a2 = uuid4()
    not_included = uuid4()

    fake_cursor.push_result(
        [
            {"asset_id": str(a1), "name": "A1", "acquisition_date": date(2024, 1, 15)},
            {"asset_id": str(a2), "name": "A2", "acquisition_date": date(2024, 1, 15)},
        ]
    )

    roll = compute_investment_rollup(
        inv_id, "2025-Q4", included_asset_ids={not_included}
    )

    assert roll.irr is None
    assert roll.null_reason == "no_assets_in_selection"
    assert roll.asset_contributions == []


def test_fund_rollup_threads_asset_filter_into_each_investment(fake_cursor):
    fund_id = uuid4()
    inv1 = uuid4()
    inv2 = uuid4()
    a1_in = uuid4()
    a1_out = uuid4()
    a2_in = uuid4()

    # 1) _list_fund_investments → 2 investments
    fake_cursor.push_result(
        [
            {"investment_id": str(inv1), "name": "Deal 1"},
            {"investment_id": str(inv2), "name": "Deal 2"},
        ]
    )
    # 2) _list_investment_assets(inv1) → 2 assets, one filtered out
    fake_cursor.push_result(
        [
            {"asset_id": str(a1_in), "name": "Inv1-In", "acquisition_date": date(2024, 1, 15)},
            {"asset_id": str(a1_out), "name": "Inv1-Out", "acquisition_date": date(2024, 1, 15)},
        ]
    )
    # 3) _list_investment_assets(inv2) → 1 asset, in scope
    fake_cursor.push_result(
        [
            {"asset_id": str(a2_in), "name": "Inv2-In", "acquisition_date": date(2024, 1, 15)},
        ]
    )

    assets = {
        a1_in: {
            "series": _mk_asset_series(Decimal("10000000"), Decimal("13000000")),
            "irr": IrrResult(value=Decimal("0.18"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
        a1_out: {
            "series": _mk_asset_series(Decimal("100000000"), Decimal("130000000")),
            "irr": IrrResult(value=Decimal("0.18"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
        a2_in: {
            "series": _mk_asset_series(Decimal("8000000"), Decimal("10000000")),
            "irr": IrrResult(value=Decimal("0.16"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
    }

    patches = _mock_asset_lookups(assets)
    with patches[0], patches[1], patches[2]:
        roll = compute_fund_rollup(
            fund_id,
            "2025-Q4",
            included_asset_ids={a1_in, a2_in},
            compute_contributions=False,
        )

    assert roll.irr is not None
    points_by_q = {p.quarter: p for p in roll.series}
    # Q1 outflow should be -18M ((-10M + -8M)), NOT include a1_out's -100M
    assert points_by_q["2024-Q1"].amount == Decimal("-18000000")
    # Big out-of-scope asset must not pollute the fund series
    big_outflow_present = any(p.amount <= Decimal("-50000000") for p in roll.series)
    assert not big_outflow_present, "Filtered asset's $100M outflow leaked into fund series"


def test_fund_rollup_default_behavior_unchanged_when_filter_omitted(fake_cursor):
    """Regression guard: existing callers that don't pass included_asset_ids
    must see byte-identical behavior to pre-change."""
    fund_id = uuid4()
    inv1 = uuid4()
    a1 = uuid4()

    fake_cursor.push_result([{"investment_id": str(inv1), "name": "Deal"}])
    fake_cursor.push_result(
        [{"asset_id": str(a1), "name": "Asset", "acquisition_date": date(2024, 1, 15)}]
    )

    assets = {
        a1: {
            "series": _mk_asset_series(Decimal("10000000"), Decimal("13000000")),
            "irr": IrrResult(value=Decimal("0.18"), null_reason=None, cashflow_count=8,
                             has_exit=True, has_terminal_value=False),
            "ownership": Decimal("1.0"),
        },
    }
    patches = _mock_asset_lookups(assets)
    with patches[0], patches[1], patches[2]:
        # Don't pass included_asset_ids
        roll = compute_fund_rollup(fund_id, "2025-Q4", compute_contributions=False)

    # No filtering → all assets land in the rollup
    assert roll.irr is not None
    assert len(roll.asset_contributions) == 1
    assert roll.asset_contributions[0].asset_id == a1
