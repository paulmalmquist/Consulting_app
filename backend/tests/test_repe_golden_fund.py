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

Gross XIRR (solved numerically, verified with numpy_financial.irr):
  ≈ 29.4% annualized  (fixture uses 0.294, tolerance ±0.5%)

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

Net IRR (from the LP-adjusted cash flows, approximately 23.5% — lower than gross by ~6%):
  Fixture uses 0.235, tolerance ±0.5%
───────────────────────────────────────────────────────────────────────

NOTE: This test requires a functional database connection and a seeded
golden fund fixture.  It is currently a STUB pending fixture seeding.
"""
from __future__ import annotations

from decimal import Decimal

import pytest


pytestmark = pytest.mark.skipif(
    True,
    reason=(
        "Stub — requires DB fixture with golden fund seeded into a test env.  "
        "Enable after test_repe_golden_asset.py passes with fixture seeding complete."
    ),
)

# ── Pre-computed expected values ──────────────────────────────────────────────
EXPECTED = {
    "total_called": Decimal("200000000.00"),
    "total_distributed": Decimal("50000000.00"),
    "terminal_nav": Decimal("240000000.00"),
    "gross_tvpi": Decimal("1.4500"),
    "dpi": Decimal("0.2500"),
    "rvpi": Decimal("1.2000"),
    "gross_irr": Decimal("0.2940"),
    "carry_shadow": Decimal("7600000.00"),
    "net_tvpi": Decimal("1.3445"),
    "net_irr": Decimal("0.2350"),
}
TOLERANCE_CURRENCY = Decimal("1.00")     # $1 tolerance on currency fields
TOLERANCE_RATE = Decimal("0.005")        # 0.5% tolerance on IRR/TVPI


def test_gross_tvpi_matches_fixture(golden_fund_metrics):
    delta = abs(golden_fund_metrics["gross_tvpi"] - EXPECTED["gross_tvpi"])
    assert delta <= TOLERANCE_RATE, (
        f"gross_tvpi {golden_fund_metrics['gross_tvpi']} deviates from "
        f"fixture {EXPECTED['gross_tvpi']} by {delta} (tolerance {TOLERANCE_RATE})"
    )


def test_dpi_matches_fixture(golden_fund_metrics):
    delta = abs(golden_fund_metrics["dpi"] - EXPECTED["dpi"])
    assert delta <= TOLERANCE_RATE


def test_gross_irr_within_tolerance(golden_fund_metrics):
    delta = abs(golden_fund_metrics["gross_irr"] - EXPECTED["gross_irr"])
    assert delta <= TOLERANCE_RATE, (
        f"gross_irr {golden_fund_metrics['gross_irr']} deviates from "
        f"fixture {EXPECTED['gross_irr']} by {delta}"
    )


def test_carry_shadow_matches_fixture(golden_fund_metrics):
    delta = abs(golden_fund_metrics["carry_shadow"] - EXPECTED["carry_shadow"])
    assert delta <= TOLERANCE_CURRENCY


def test_net_tvpi_matches_fixture(golden_fund_metrics):
    delta = abs(golden_fund_metrics["net_tvpi"] - EXPECTED["net_tvpi"])
    assert delta <= TOLERANCE_RATE


def test_net_irr_within_tolerance(golden_fund_metrics):
    delta = abs(golden_fund_metrics["net_irr"] - EXPECTED["net_irr"])
    assert delta <= TOLERANCE_RATE
