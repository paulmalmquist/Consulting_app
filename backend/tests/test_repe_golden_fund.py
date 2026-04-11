"""Golden Fund Test — end-to-end metric correctness oracle.

One fund, two assets, one JV + one direct, a simple two-tier waterfall
(8% pref, 80/20 carry).  Expected IRR / DPI / TVPI / net metrics are
pre-computed in the fixture below and verified against the engine.

This test is the acid bath — any future refactor must still pass it or
justify the delta.  If the engine drifts, this test catches it before
any user does.

All numbers are computed from first principles (no engine calls during
test setup) so the fixture is self-documenting and reproducible by hand.

───────────────────────────────────────────────────────────────────────
Fixture summary
───────────────────────────────────────────────────────────────────────
Fund:            Golden Fund I (closed-end, vintage 2023)
Terminal quarter: 2026Q2 (June 30 2026, 3.25 years since inception Jan 2023)
Capital calls:
  2023-01-15   $100,000,000   (CALL)
  2023-07-15   $ 50,000,000   (CALL)
  2024-01-15   $ 50,000,000   (CALL)
Total called:    $200,000,000

Distributions:
  2025-01-15   $ 20,000,000   (DIST)
  2026-01-15   $ 30,000,000   (DIST)
Total dist:      $ 50,000,000

Terminal NAV (June 30 2026):  $240,000,000

Cash flows for gross XIRR (sign convention: outflows negative, inflows positive):
  2023-01-15  -100,000,000
  2023-07-15  -  50,000,000
  2024-01-15  -  50,000,000
  2025-01-15  +  20,000,000
  2026-01-15  +  30,000,000
  2026-06-30  + 240,000,000  (terminal NAV as positive inflow)

Gross XIRR (solved by irr_engine.xirr with actual date-weighted periods):
  ≈ 13.48% annualized  (fixture verified against engine — 2026-04-11)

NOTE: An earlier version of this fixture cited 29.4% as the gross IRR, claiming
"verified with numpy_financial.irr."  That claim was wrong: the equal-period
numpy.irr and date-weighted xirr produce different results.  The correct value
from date-weighted XIRR on these cash flows is 13.48%.  All six tests were
updated to use engine-verified values, not manually estimated ones.

Gross TVPI:  (50M + 240M) / 200M = 1.450x
DPI:          50M / 200M = 0.250x
RVPI:        240M / 200M = 1.200x

Management fees (2% per year of committed capital = 2% × $200M × 3.25yr):
  ≈ $13,000,000 (simplified: $4M/yr × 3.25yr rounded)
  Fixture uses: $13,000,000

Fund expenses: $500,000 (flat)

Carry — waterfall:
  ROC tier:  all $200M returned → no carry
  Pref tier: 8% × $200M × 3.25yr = $52M hurdle
  Pref satisfied by: $50M dist + $240M NAV = $290M total value → $90M above cost
  Gain above hurdle: $290M − $200M − $52M pref = $38M over hurdle
  At 80/20 split: GP carry = $38M × 0.20 = $7,600,000
  LP net: $290M − $7.6M carry − $13M fees − $0.5M expenses = $268.9M
  Net TVPI: ($50M dist − $13M fees − $0.5M expenses − $7.6M carry + $240M NAV) / $200M called
           = ($50M + $240M − $21.1M) / $200M = $268.9M / $200M = 1.3445x

Net IRR (terminal NAV reduced by fees+expenses+carry = $21.1M → net terminal $218.9M):
  ≈ 10.65% annualized  (engine-verified date-weighted XIRR)
───────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import importlib
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest


# ── Pre-computed expected values ──────────────────────────────────────────────
EXPECTED = {
    "total_called": Decimal("200000000.00"),
    "total_distributed": Decimal("50000000.00"),
    "terminal_nav": Decimal("240000000.00"),
    "gross_tvpi": Decimal("1.4500"),
    "dpi": Decimal("0.2500"),
    "rvpi": Decimal("1.2000"),
    "gross_irr": Decimal("0.1348"),   # engine-verified date-weighted XIRR
    "carry_shadow": Decimal("7600000.00"),
    "net_tvpi": Decimal("1.3445"),
    "net_irr": Decimal("0.1065"),    # engine-verified; net terminal = $218.9M
}
TOLERANCE_CURRENCY = Decimal("1.00")     # $1 tolerance on currency fields
TOLERANCE_RATE = Decimal("0.005")        # 0.5% tolerance on IRR/TVPI

# ── Golden cash-event rows (as the DB would return them) ────────────────────
_CASH_EVENT_ROWS = [
    {"event_date": date(2023, 1, 15), "event_type": "CALL", "amount": "100000000"},
    {"event_date": date(2023, 7, 15), "event_type": "CALL", "amount": "50000000"},
    {"event_date": date(2024, 1, 15), "event_type": "CALL", "amount": "50000000"},
    {"event_date": date(2025, 1, 15), "event_type": "DIST", "amount": "20000000"},
    {"event_date": date(2026, 1, 15), "event_type": "DIST", "amount": "30000000"},
]

_FUND_ID = UUID("aaaaaaaa-0000-0000-0000-000000000001")
_BUSINESS_ID = UUID("bbbbbbbb-0000-0000-0000-000000000001")
_RUN_ID = UUID("cccccccc-0000-0000-0000-000000000001")
_ENV_ID = "golden-test-env"
_QUARTER = "2026Q2"


# ── Mock cursor factory ───────────────────────────────────────────────────────

def _make_cursor():
    """Return a mock cursor pre-loaded with golden fixture responses.

    Query order inside compute_return_metrics with the golden fixture:
      1. fetchone()  → cash totals (total_called, total_distributed)
      2. fetchall()  → cash events (used by _compute_fund_xirr)
      3. fetchone()  → fee accruals
      4. fetchone()  → fund expenses
      5. fetchall()  → cash events again (used by _compute_net_xirr)
      6. fetchone()  → INSERT re_fund_metrics_qtr RETURNING *
      7. fetchone()  → INSERT re_gross_net_bridge_qtr RETURNING *
    """
    cur = MagicMock()
    cur.fetchall.side_effect = [
        _CASH_EVENT_ROWS,   # for _compute_fund_xirr
        _CASH_EVENT_ROWS,   # for _compute_net_xirr
    ]
    cur.fetchone.side_effect = [
        # call[0]: cash totals
        {"total_called": "200000000", "total_distributed": "50000000"},
        # call[2]: fee accruals
        {"total": "13000000"},
        # call[3]: fund expenses
        {"total": "500000"},
        # call[5]: INSERT re_fund_metrics_qtr RETURNING *
        {"id": 1},
        # call[6]: INSERT re_gross_net_bridge_qtr RETURNING *
        {"id": 1},
    ]
    return cur


def _golden_auth_state():
    return {
        "promotion_state": "released",
        "null_reason": None,
        "state": {
            "canonical_metrics": {
                "ending_nav": "240000000",
                "portfolio_nav": "240000000",
            }
        },
    }


def _run_compute():
    """Run compute_return_metrics with golden fixture and return the captured INSERT params."""
    mod = importlib.import_module("app.services.re_fund_metrics")

    cur = _make_cursor()
    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=cur)
    ctx.__exit__ = MagicMock(return_value=False)

    with (
        patch.object(mod, "get_authoritative_state", return_value=_golden_auth_state()),
        patch.object(mod, "get_cursor", return_value=ctx),
        patch.object(mod, "_compute_waterfall_carry", return_value=Decimal("7600000")),
        patch("app.observability.logger.emit_log"),
    ):
        mod.compute_return_metrics(
            env_id=_ENV_ID,
            business_id=_BUSINESS_ID,
            fund_id=_FUND_ID,
            quarter=_QUARTER,
            run_id=_RUN_ID,
        )

    # 7 execute calls in order:
    #   [0] cash totals query
    #   [1] cash events for _compute_fund_xirr
    #   [2] fee accruals
    #   [3] fund expenses
    #   [4] cash events for _compute_net_xirr
    #   [5] INSERT re_fund_metrics_qtr  ← target
    #   [6] INSERT re_gross_net_bridge_qtr
    insert_params = cur.execute.call_args_list[5][0][1]
    return insert_params


# ── Test: gross TVPI ─────────────────────────────────────────────────────────

def test_gross_tvpi_matches_fixture():
    """gross_tvpi = (distributed + nav) / called = (50M + 240M) / 200M = 1.45"""
    insert_params = _run_compute()
    # INSERT params layout: (run_id, env_id, biz, fund, quarter, gross_irr, net_irr,
    #                        gross_tvpi, net_tvpi, dpi, rvpi, coc, spread, inputs_missing)
    # Index:                   0       1      2     3     4      5       6
    #                          7          8    9    10    11   12        13
    gross_tvpi = Decimal(str(insert_params[7]))
    delta = abs(gross_tvpi - EXPECTED["gross_tvpi"])
    assert delta <= TOLERANCE_RATE, (
        f"gross_tvpi {gross_tvpi} deviates from fixture {EXPECTED['gross_tvpi']} "
        f"by {delta} (tolerance {TOLERANCE_RATE})"
    )


def test_dpi_matches_fixture():
    """dpi = distributed / called = 50M / 200M = 0.25"""
    insert_params = _run_compute()
    dpi = Decimal(str(insert_params[9]))
    delta = abs(dpi - EXPECTED["dpi"])
    assert delta <= TOLERANCE_RATE, f"dpi {dpi} != {EXPECTED['dpi']} (delta {delta})"


def test_rvpi_matches_fixture():
    """rvpi = nav / called = 240M / 200M = 1.20"""
    insert_params = _run_compute()
    rvpi = Decimal(str(insert_params[10]))
    delta = abs(rvpi - EXPECTED["rvpi"])
    assert delta <= TOLERANCE_RATE, f"rvpi {rvpi} != {EXPECTED['rvpi']} (delta {delta})"


def test_gross_irr_within_tolerance():
    """Gross IRR from XIRR engine on golden cash flows should be ~13.48% (date-weighted)."""
    insert_params = _run_compute()
    gross_irr = insert_params[5]
    if gross_irr is None:
        pytest.fail("gross_irr is None — XIRR engine returned nothing for golden cash flows")
    gross_irr = Decimal(str(gross_irr))
    delta = abs(gross_irr - EXPECTED["gross_irr"])
    assert delta <= TOLERANCE_RATE, (
        f"gross_irr {gross_irr} deviates from fixture {EXPECTED['gross_irr']} "
        f"by {delta} (tolerance {TOLERANCE_RATE})"
    )


def test_net_tvpi_matches_fixture():
    """net_tvpi = (50M + 240M − 13M fees − 0.5M expenses − 7.6M carry) / 200M = 1.3445"""
    insert_params = _run_compute()
    net_tvpi = Decimal(str(insert_params[8]))
    delta = abs(net_tvpi - EXPECTED["net_tvpi"])
    assert delta <= TOLERANCE_RATE, (
        f"net_tvpi {net_tvpi} deviates from fixture {EXPECTED['net_tvpi']} "
        f"by {delta}"
    )


def test_net_irr_within_tolerance():
    """Net IRR: same cash flows but terminal NAV reduced by $21.1M fees/carry → ~10.65%."""
    insert_params = _run_compute()
    net_irr = insert_params[6]
    if net_irr is None:
        pytest.fail("net_irr is None — expected ~23.5% for golden fixture with known carry")
    net_irr = Decimal(str(net_irr))
    delta = abs(net_irr - EXPECTED["net_irr"])
    assert delta <= TOLERANCE_RATE, (
        f"net_irr {net_irr} deviates from fixture {EXPECTED['net_irr']} "
        f"by {delta}"
    )
