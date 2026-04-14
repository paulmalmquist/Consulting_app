"""Tests for the bottom-up REPE cash flow engine.

Two layers:
  - Pure math / helpers (no DB): date convention, IRR from hand-constructed series,
    null-propagation rules, terminal-dominance flag.
  - DB-backed flow using the fake_cursor fixture to simulate canned query results
    from build_asset_cf_series + compute_asset_irr.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.bottom_up_cashflow import (
    CFPoint,
    IrrResult,
    build_asset_cf_series,
    compute_asset_irr,
    date_to_quarter,
    quarter_end_date,
)


# ---------------------------------------------------------------------------
# Date convention
# ---------------------------------------------------------------------------


def test_quarter_end_date_produces_canonical_quarter_ends():
    assert quarter_end_date("2024-Q1") == date(2024, 3, 31)
    assert quarter_end_date("2024-Q2") == date(2024, 6, 30)
    assert quarter_end_date("2024-Q3") == date(2024, 9, 30)
    assert quarter_end_date("2024-Q4") == date(2024, 12, 31)


def test_date_to_quarter_buckets_mid_quarter_dates():
    # Mid-Feb acquisition bucketed to Q1.
    assert date_to_quarter(date(2024, 2, 15)) == "2024-Q1"
    # Mid-August exit bucketed to Q3.
    assert date_to_quarter(date(2028, 8, 10)) == "2028-Q3"
    # Q-boundary months.
    assert date_to_quarter(date(2024, 3, 31)) == "2024-Q1"
    assert date_to_quarter(date(2024, 4, 1)) == "2024-Q2"


# ---------------------------------------------------------------------------
# IRR from hand-constructed series (bypass DB via series=... parameter)
# ---------------------------------------------------------------------------


def _mk_point(
    q: str,
    amount: Decimal,
    *,
    has_acquisition: bool = False,
    has_exit: bool = False,
    has_terminal: bool = False,
    has_actual: bool = False,
    warnings: list[str] | None = None,
    tv_failure: dict | None = None,
) -> CFPoint:
    breakdown: dict = {}
    if has_acquisition:
        breakdown["acquisition"] = float(amount)
    if has_exit:
        breakdown["exit"] = {"status": "realized", "amount": float(amount)}
    if has_terminal:
        breakdown["terminal_value"] = {
            "kind": "terminal_value",
            "source": "quarter_state_nav",
            "amount": float(amount),
        }
    if tv_failure:
        breakdown["terminal_value_failure"] = tv_failure
    return CFPoint(
        quarter=q,
        quarter_end_date=quarter_end_date(q),
        amount=amount,
        component_breakdown=breakdown,
        has_actual=has_actual,
        has_exit=has_exit,
        has_terminal_value=has_terminal,
        warnings=warnings or [],
    )


def test_golden_irr_realized_asset_matches_hand_calc():
    # Acquire at -100, 4 quarters of NOI of +5 each, sell for +130 at Q4.
    # CFs on quarter-end dates:
    #   2024-Q1: -100
    #   2024-Q2..2024-Q4: +5 each (operating)
    #   2024-Q4: +135 total (operating 5 + exit 130)
    # Collapse Q4 into a single CFPoint by adding separately.
    series = [
        _mk_point("2024-Q1", Decimal("-100"), has_acquisition=True),
        _mk_point("2024-Q2", Decimal("5"), has_actual=True),
        _mk_point("2024-Q3", Decimal("5"), has_actual=True),
        _mk_point("2024-Q4", Decimal("135"), has_exit=True, has_actual=True),
    ]
    result = compute_asset_irr(uuid4(), "2024-Q4", series=series)
    assert result.value is not None
    assert result.null_reason is None
    assert result.has_exit is True
    # Hand IRR: roughly 75-78% annualized (9 months, ~45% unannualized return).
    assert Decimal("0.65") < result.value < Decimal("0.90")


def test_irr_null_when_no_acquisition():
    series = [
        _mk_point("2024-Q2", Decimal("5")),
        _mk_point("2024-Q4", Decimal("135"), has_exit=True),
    ]
    result = compute_asset_irr(uuid4(), "2024-Q4", series=series)
    assert result.value is None
    assert result.null_reason == "missing_acquisition"


def test_irr_null_when_no_inflow():
    # Acquisition only, no operating / no exit / no terminal.
    series = [_mk_point("2024-Q1", Decimal("-100"), has_acquisition=True)]
    result = compute_asset_irr(uuid4(), "2024-Q1", series=series)
    assert result.value is None
    assert result.null_reason == "no_inflow"


def test_irr_null_when_insufficient_sign_changes():
    # Acquisition AND an inflow that's zero — no actual sign change.
    series = [
        _mk_point("2024-Q1", Decimal("-100"), has_acquisition=True),
        _mk_point("2024-Q2", Decimal("-5"), has_actual=True),
    ]
    result = compute_asset_irr(uuid4(), "2024-Q2", series=series)
    assert result.value is None
    assert result.null_reason == "no_inflow"


def test_irr_null_on_invalid_cap_rate():
    # Terminal-value fallback hit the cap-rate guardrail.
    series = [
        _mk_point("2024-Q1", Decimal("-100"), has_acquisition=True),
        _mk_point(
            "2024-Q4",
            Decimal("0"),
            tv_failure={"reason": "invalid_cap_rate", "cap_rate": 0.02},
        ),
    ]
    result = compute_asset_irr(uuid4(), "2024-Q4", series=series)
    assert result.value is None
    assert result.null_reason == "invalid_cap_rate"


def test_irr_pre_exit_asset_uses_terminal_value():
    # Active investment with NAV terminal value — IRR must still be computable.
    series = [
        _mk_point("2023-Q1", Decimal("-100"), has_acquisition=True),
        _mk_point("2023-Q2", Decimal("3"), has_actual=True),
        _mk_point("2023-Q3", Decimal("3"), has_actual=True),
        _mk_point("2023-Q4", Decimal("3"), has_actual=True),
        _mk_point("2024-Q1", Decimal("130"), has_terminal=True),
    ]
    result = compute_asset_irr(uuid4(), "2024-Q1", series=series)
    assert result.value is not None
    assert result.has_terminal_value is True
    assert result.has_exit is False


def test_irr_warnings_propagate():
    # Dominance warning flows from series into IrrResult.
    series = [
        _mk_point("2024-Q1", Decimal("-100"), has_acquisition=True),
        _mk_point(
            "2024-Q4",
            Decimal("150"),
            has_terminal=True,
            warnings=["terminal_value_dominant"],
        ),
    ]
    result = compute_asset_irr(uuid4(), "2024-Q4", series=series)
    assert result.value is not None
    assert "terminal_value_dominant" in result.warnings


# ---------------------------------------------------------------------------
# build_asset_cf_series with fake_cursor
# ---------------------------------------------------------------------------


def _push_acquisition_context(cur, asset_id, *, acquisition_date, cost_basis):
    cur.push_result(
        [
            {
                "asset_id": asset_id,
                "deal_id": uuid4(),
                "name": "Test Asset",
                "acquisition_date": acquisition_date,
                "cost_basis": Decimal(cost_basis),
                "fund_id": uuid4(),
            }
        ]
    )


def test_build_series_realized_exit_includes_acquisition_operating_and_exit(fake_cursor):
    """Full realized-exit path: acquisition + 3 operating quarters + exit."""
    asset_id = uuid4()

    # Sequence of queries inside build_asset_cf_series:
    #   1. _load_asset_context
    #   2. _load_operating_quarters
    #   3. _load_latest_exit_event
    #   4. _load_projection_quarters (only if forecast needed — realized exit
    #       in the past skips forecast, but we still queue an empty row for
    #       safety). Realized exit <= last_closed: NO projection query fires.

    _push_acquisition_context(
        fake_cursor, asset_id,
        acquisition_date=date(2024, 2, 15),  # bucketed to 2024-Q1
        cost_basis=1000,
    )
    fake_cursor.push_result([
        {"quarter": "2024-Q2", "revenue": Decimal("30"), "other_income": Decimal("0"),
         "opex": Decimal("10"), "capex": Decimal("0"), "debt_service": Decimal("5"),
         "cash_balance": None},
        {"quarter": "2024-Q3", "revenue": Decimal("32"), "other_income": Decimal("0"),
         "opex": Decimal("11"), "capex": Decimal("0"), "debt_service": Decimal("5"),
         "cash_balance": None},
        {"quarter": "2024-Q4", "revenue": Decimal("33"), "other_income": Decimal("0"),
         "opex": Decimal("11"), "capex": Decimal("0"), "debt_service": Decimal("5"),
         "cash_balance": None},
    ])
    # Latest exit event: realized, at 2024-Q4.
    fake_cursor.push_result([
        {
            "status": "realized",
            "exit_quarter": "2024-Q4",
            "exit_date": date(2024, 11, 10),
            "gross_sale_price": Decimal("1200"),
            "selling_costs": Decimal("20"),
            "debt_payoff": Decimal("0"),
            "net_proceeds": Decimal("1180"),
            "projected_cap_rate": None,
            "revision_at": None,
        }
    ])

    series = build_asset_cf_series(asset_id, "2024-Q4")
    assert len(series) == 4

    points_by_q = {p.quarter: p for p in series}
    assert points_by_q["2024-Q1"].amount == Decimal("-1000")
    assert "acquisition" in points_by_q["2024-Q1"].component_breakdown

    # Operating: 30 - 10 - 5 = 15; 32 - 11 - 5 = 16; 33 - 11 - 5 = 17 + exit 1180 = 1197.
    assert points_by_q["2024-Q2"].amount == Decimal("15")
    assert points_by_q["2024-Q3"].amount == Decimal("16")
    assert points_by_q["2024-Q4"].amount == Decimal("1197")
    assert points_by_q["2024-Q4"].has_exit is True

    # IRR must be a real number; roughly very high given 3-quarter hold with 18% gross return.
    result = compute_asset_irr(asset_id, "2024-Q4", series=series)
    assert result.value is not None
    assert result.has_exit is True


def test_build_series_pre_exit_uses_authoritative_nav_terminal(fake_cursor):
    asset_id = uuid4()
    _push_acquisition_context(
        fake_cursor, asset_id,
        acquisition_date=date(2023, 1, 15),  # 2023-Q1
        cost_basis=1000,
    )
    fake_cursor.push_result([
        {"quarter": "2023-Q2", "revenue": Decimal("30"), "other_income": Decimal("0"),
         "opex": Decimal("10"), "capex": Decimal("0"), "debt_service": Decimal("5"),
         "cash_balance": None},
        {"quarter": "2023-Q3", "revenue": Decimal("30"), "other_income": Decimal("0"),
         "opex": Decimal("10"), "capex": Decimal("0"), "debt_service": Decimal("5"),
         "cash_balance": None},
        {"quarter": "2023-Q4", "revenue": Decimal("30"), "other_income": Decimal("0"),
         "opex": Decimal("10"), "capex": Decimal("0"), "debt_service": Decimal("5"),
         "cash_balance": None},
    ])
    # No exit event.
    fake_cursor.push_result([])
    # Authoritative NAV lookup: released snapshot has NAV 1100.
    fake_cursor.push_result([
        {"canonical_metrics": {"nav": 1100}}
    ])

    series = build_asset_cf_series(asset_id, "2023-Q4")
    points_by_q = {p.quarter: p for p in series}
    # Q4 gets operating 15 + terminal 1100 = 1115.
    assert points_by_q["2023-Q4"].amount == Decimal("1115")
    assert points_by_q["2023-Q4"].has_terminal_value is True
    tv = points_by_q["2023-Q4"].component_breakdown["terminal_value"]
    assert tv["source"] == "authoritative_nav"
    assert tv["amount"] == 1100


def test_build_series_pre_exit_falls_back_to_noi_cap_rate(fake_cursor):
    asset_id = uuid4()
    _push_acquisition_context(
        fake_cursor, asset_id,
        acquisition_date=date(2023, 1, 15),
        cost_basis=1000,
    )
    # 4 quarters of consistent NOI, TTM NOI = 4 * 20 = 80.
    fake_cursor.push_result([
        {"quarter": f"2023-Q{q}", "revenue": Decimal("30"), "other_income": Decimal("0"),
         "opex": Decimal("10"), "capex": Decimal("0"), "debt_service": Decimal("0"),
         "cash_balance": None}
        for q in range(1, 5)
    ])
    # Exit event with projected_cap_rate = 0.08 (valid), no exit_quarter in horizon.
    # Actually we want *no exit_event* so the fallback is triggered.
    fake_cursor.push_result([])
    # No authoritative snapshot.
    fake_cursor.push_result([])
    # No quarter_state NAV.
    fake_cursor.push_result([])

    # Provide env default cap rate.
    series = build_asset_cf_series(
        asset_id, "2023-Q4", env_default_cap_rate=Decimal("0.08")
    )
    points_by_q = {p.quarter: p for p in series}
    # TTM NOI = 4 * (30 - 10) = 80; terminal = 80 / 0.08 = 1000.
    tv = points_by_q["2023-Q4"].component_breakdown.get("terminal_value")
    assert tv is not None
    assert tv["source"] == "noi_cap_rate"
    assert tv["cap_rate"] == 0.08
    assert Decimal(str(tv["amount"])) == Decimal("1000")


def test_build_series_invalid_cap_rate_produces_null_reason(fake_cursor):
    asset_id = uuid4()
    _push_acquisition_context(
        fake_cursor, asset_id,
        acquisition_date=date(2023, 1, 15),
        cost_basis=1000,
    )
    fake_cursor.push_result([
        {"quarter": f"2023-Q{q}", "revenue": Decimal("30"), "other_income": Decimal("0"),
         "opex": Decimal("10"), "capex": Decimal("0"), "debt_service": Decimal("0"),
         "cash_balance": None}
        for q in range(1, 5)
    ])
    fake_cursor.push_result([])  # no exit
    fake_cursor.push_result([])  # no auth NAV
    fake_cursor.push_result([])  # no quarter state NAV

    # Cap rate below 3% floor.
    series = build_asset_cf_series(
        asset_id, "2023-Q4", env_default_cap_rate=Decimal("0.02")
    )
    result = compute_asset_irr(asset_id, "2023-Q4", series=series)
    assert result.value is None
    assert result.null_reason == "invalid_cap_rate"


def test_build_series_terminal_dominance_flag(fake_cursor):
    """Terminal value > 80% of positive inflows flags terminal_value_dominant."""
    asset_id = uuid4()
    _push_acquisition_context(
        fake_cursor, asset_id,
        acquisition_date=date(2023, 1, 15),
        cost_basis=1000,
    )
    # Tiny operating income, big terminal NAV.
    fake_cursor.push_result([
        {"quarter": "2023-Q2", "revenue": Decimal("2"), "other_income": Decimal("0"),
         "opex": Decimal("1"), "capex": Decimal("0"), "debt_service": Decimal("0"),
         "cash_balance": None},
    ])
    fake_cursor.push_result([])  # no exit
    # Authoritative NAV 1500 dwarfs the 1 unit of operating CF.
    fake_cursor.push_result([{"canonical_metrics": {"nav": 1500}}])

    series = build_asset_cf_series(asset_id, "2023-Q2")
    tv_point = next(p for p in series if p.has_terminal_value)
    assert "terminal_value_dominant" in tv_point.warnings


# ---------------------------------------------------------------------------
# Date-convention end-to-end
# ---------------------------------------------------------------------------


def test_route_returns_full_payload_shape(client, monkeypatch):
    """GET /api/re/v2/assets/{id}/cashflow passes through the service payload.

    We mock the service layer directly — the route's job is to relay, not
    reshape. Deeper tests exercise the service itself.
    """
    asset_id = "11111111-1111-4111-8111-000000000001"

    fake_payload = {
        "asset_id": asset_id,
        "as_of_quarter": "2024-Q1",
        "series": [
            {
                "quarter": "2022-Q1",
                "quarter_end_date": "2022-03-31",
                "amount": -25000000.0,
                "component_breakdown": {"acquisition": -25000000},
                "has_actual": False, "has_projection": False,
                "has_exit": False, "has_terminal_value": False, "warnings": [],
            },
            {
                "quarter": "2024-Q1",
                "quarter_end_date": "2024-03-31",
                "amount": 30905000.0,
                "component_breakdown": {"exit": {"status": "realized", "amount": 30500000}},
                "has_actual": True, "has_projection": False,
                "has_exit": True, "has_terminal_value": False, "warnings": [],
            },
        ],
        "irr": 0.181438,
        "null_reason": None,
        "cashflow_count": 2,
        "has_exit": True,
        "has_terminal_value": False,
        "warnings": [],
        "terminal_value": None,
        "is_stale": False,
        "staleness_seconds": 0,
        "source_hash": "abcdef0123456789",
        "computed_at": "2026-04-12T00:00:00+00:00",
    }

    def _mock(asset_id_arg, quarter_arg, **kwargs):
        return fake_payload

    monkeypatch.setattr(
        "app.services.bottom_up_refresh.get_asset_cashflow_response", _mock
    )

    resp = client.get(f"/api/re/v2/assets/{asset_id}/cashflow?quarter=2024-Q1")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["asset_id"] == asset_id
    assert data["as_of_quarter"] == "2024-Q1"
    # Shape contract the UI depends on:
    for key in (
        "series", "irr", "null_reason", "cashflow_count", "has_exit",
        "has_terminal_value", "warnings", "terminal_value", "is_stale",
        "staleness_seconds", "source_hash", "computed_at",
    ):
        assert key in data, f"missing key {key}"
    assert data["irr"] == pytest.approx(0.181438)


def test_mid_quarter_acquisition_bucketed_to_quarter_end(fake_cursor):
    asset_id = uuid4()
    _push_acquisition_context(
        fake_cursor, asset_id,
        acquisition_date=date(2024, 2, 15),
        cost_basis=1000,
    )
    fake_cursor.push_result([])  # no operating
    fake_cursor.push_result([
        {
            "status": "realized",
            "exit_quarter": "2028-Q3",
            "exit_date": date(2028, 8, 10),
            "gross_sale_price": Decimal("1500"),
            "selling_costs": Decimal("0"),
            "debt_payoff": Decimal("0"),
            "net_proceeds": Decimal("1500"),
            "projected_cap_rate": None,
            "revision_at": None,
        }
    ])

    series = build_asset_cf_series(asset_id, "2028-Q3")
    acq = next(p for p in series if "acquisition" in p.component_breakdown)
    # Mid-Feb 2024 -> 2024-Q1 end 2024-03-31.
    assert acq.quarter == "2024-Q1"
    assert acq.quarter_end_date == date(2024, 3, 31)

    exit_p = next(p for p in series if p.has_exit)
    # Mid-Aug 2028 -> 2028-Q3 end 2028-09-30.
    assert exit_p.quarter == "2028-Q3"
    assert exit_p.quarter_end_date == date(2028, 9, 30)
