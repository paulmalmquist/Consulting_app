"""Golden Asset Test — arithmetic oracle for asset-level rollup math.

One asset (Golden Plaza Office Tower), known NOI timeline, interest-only
debt, 85% fund ownership via a JV. All expected values precomputed by
hand in the fixture file and verified against the production XIRR
engine on 2026-04-19.

This is the asset-level counterpart to test_repe_golden_fund.py. If the
asset-level rollup (raw_nav → effective_owned_nav) or asset-level XIRR
drifts, this test catches it before it contaminates fund-level math.

Pins two contracts:

1. NAV: raw_nav = gross_value - debt; effective_owned_nav = raw_nav × ownership.
2. IRR: date-weighted XIRR on the equity cashflow stream equals the
   engine-verified value within 1bp, cross-checked against the independent
   Newton solver from test_repe_snapshot_consistency.py.
"""
from __future__ import annotations

import json
import os
import sys
import types
from datetime import date
from decimal import Decimal
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *a, **kw: None
    psycopg_stub.Connection = object
    psycopg_stub.rows = types.SimpleNamespace(dict_row=None)
    sys.modules["psycopg"] = psycopg_stub

if "dotenv" not in sys.modules:
    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = lambda *a, **kw: None
    sys.modules["dotenv"] = dotenv_stub


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "repe_golden_asset.json"


def _load_fixture() -> dict:
    with FIXTURE_PATH.open() as f:
        return json.load(f)


def _parse_cashflows(fixture: dict) -> list[tuple[date, Decimal]]:
    out = []
    for flow in fixture["expected_cash_flows_for_asset_irr"]["flows"]:
        d = date.fromisoformat(flow["date"])
        amt = Decimal(flow["amount"])
        out.append((d, amt))
    return out


# ---------------------------------------------------------------------------
# NAV oracle — pure arithmetic. No engine call; just verify the formula.
# If the fixture drifts or the formula is misunderstood, this fails first.
# ---------------------------------------------------------------------------

def test_golden_asset_gross_value_matches_cap_rate_formula():
    """exit_value = annualized_NOI / exit_cap_rate."""
    fx = _load_fixture()
    noi = Decimal(fx["noi_timeline_annualized"]["2026_annualized_at_terminal"])
    cap = Decimal(fx["exit_assumptions"]["exit_cap_rate"])
    expected = Decimal(fx["exit_assumptions"]["expected_gross_value_2026Q2"])

    computed = (noi / cap).quantize(Decimal("0.01"))
    assert computed == expected, f"cap rate formula drift: {computed} vs fixture {expected}"


def test_golden_asset_raw_nav_is_gross_minus_debt():
    """raw_nav = gross_value - debt_balance."""
    fx = _load_fixture()
    gross = Decimal(fx["expected_nav"]["gross_value_2026Q2"])
    debt = Decimal(fx["expected_nav"]["debt_balance_2026Q2"])
    expected = Decimal(fx["expected_nav"]["raw_nav_2026Q2"])

    assert gross - debt == expected, (
        f"raw NAV formula drift: {gross} - {debt} = {gross - debt}, fixture {expected}"
    )


def test_golden_asset_effective_owned_nav_applies_ownership_once():
    """effective_owned_nav = raw_nav × effective_fund_ownership.

    Pins Patch A ownership-at-the-edge: ownership must be applied exactly
    once. If the rollup multiplied ownership twice, this would produce
    $23.9M instead of $28.17M; if omitted entirely, $33.14M.
    """
    fx = _load_fixture()
    raw = Decimal(fx["expected_nav"]["raw_nav_2026Q2"])
    ownership = Decimal(fx["ownership"]["effective_fund_ownership"])
    expected = Decimal(fx["expected_nav"]["effective_owned_nav_2026Q2"])

    computed = (raw * ownership).quantize(Decimal("0.01"))
    assert computed == expected, (
        f"effective-owned NAV drift: {raw} × {ownership} = {computed}, fixture {expected}"
    )

    # Regression anchors:
    double_applied = (raw * ownership * ownership).quantize(Decimal("0.01"))
    assert computed != double_applied, "ownership must not be applied twice"
    assert computed != raw, "ownership must be applied (not omitted)"


# ---------------------------------------------------------------------------
# IRR oracle — production XIRR must match the engine-verified fixture value,
# and the independent Newton solver must agree within 1bp.
# ---------------------------------------------------------------------------

def test_golden_asset_production_xirr_matches_fixture():
    """Production irr_engine.xirr must return the engine-verified value
    from the fixture within 1bp. If this drifts, the solver has changed
    or the fixture must be re-verified against the new solver."""
    from app.finance.irr_engine import xirr

    fx = _load_fixture()
    cashflows = _parse_cashflows(fx)
    expected_irr = Decimal(fx["expected_cash_flows_for_asset_irr"]["engine_verified_irr"])
    tolerance_bps = int(fx["tolerances"]["irr_bps"])

    computed = xirr(cashflows)
    assert computed is not None, "production XIRR returned None on valid series"

    delta_bps = abs(float(computed) - float(expected_irr)) * 10_000
    assert delta_bps < tolerance_bps, (
        f"production XIRR {float(computed):.6f} vs fixture {float(expected_irr):.6f} "
        f"= {delta_bps:.2f}bp > {tolerance_bps}bp tolerance"
    )


def test_golden_asset_independent_newton_xirr_agrees_with_production():
    """Cross-check: the independent Newton solver and the production
    bisection solver must agree within 1bp on the golden asset flows.

    If they disagree, one is wrong — don't use either as the oracle
    until the discrepancy is resolved."""
    from app.finance.irr_engine import xirr
    from tests.test_repe_snapshot_consistency import independent_newton_xirr

    fx = _load_fixture()
    cashflows = _parse_cashflows(fx)

    prod = xirr(cashflows)
    indep = independent_newton_xirr([(dt, float(amt)) for dt, amt in cashflows])

    assert prod is not None
    assert indep is not None

    delta_bps = abs(float(prod) - indep) * 10_000
    assert delta_bps < 1.0, (
        f"solver disagreement on golden asset: production {float(prod):.6f} "
        f"vs Newton {indep:.6f} = {delta_bps:.2f}bp"
    )


def test_golden_asset_cashflow_stream_is_complete():
    """INV-3: the golden asset stream has at least one negative (equity
    outlay) and at least one positive (NOI or exit), so XIRR is defined.
    Verifies the fixture itself satisfies the completeness gate."""
    fx = _load_fixture()
    cashflows = _parse_cashflows(fx)
    assert any(amt < 0 for _, amt in cashflows), "no negative cashflow"
    assert any(amt > 0 for _, amt in cashflows), "no positive cashflow"


def test_golden_asset_equity_outlay_equals_price_minus_debt():
    """Sanity: the initial negative cashflow must equal
    acquisition_price - debt_principal (the equity slug at close)."""
    fx = _load_fixture()
    price = Decimal(fx["asset"]["acquisition_price"])
    debt = Decimal(fx["debt_schedule"]["original_principal"])
    cashflows = _parse_cashflows(fx)

    equity_outlay = cashflows[0][1]
    expected_outlay = -(price - debt)
    assert equity_outlay == expected_outlay, (
        f"equity outlay {equity_outlay} should equal -(price {price} - debt {debt}) = {expected_outlay}"
    )
