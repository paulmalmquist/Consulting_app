"""Deterministic REPE asset cash-flow calibrator.

Takes a portfolio of `AssetProfile` inputs (identity + economics envelope)
and emits calibrated quarterly operating cash flows + an exit event per
asset so the realized IRR lands in a target band. Reuses the production
XIRR engine at `app.finance.irr_engine.xirr` to verify.

Design goals:
  * **Deterministic** — same inputs produce identical outputs. RNG seeded
    by the asset_id hash.
  * **Economically grounded** — NOI evolves by property-type-typical growth;
    terminal value respects cap-rate bounds (4%–9%) by property type.
  * **Fail-honest** — if the generator cannot hit a band within tolerance
    after the bracket search, the asset is flagged in the result; it is
    NOT silently fudged.
  * **Auditable** — each asset's output includes the full inputs, the CF
    series, the resolved IRR, and the driver/flag that shaped it.

Used by:
  * `tests/test_repe_calibration.py` — asserts fund-level distribution
  * `scripts/emit_repe_calibrated_seed.py` — writes the SQL seed
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from app.finance.irr_engine import xirr

# ---------------------------------------------------------------------------
# Domain constants
# ---------------------------------------------------------------------------

PropertyType = str  # multifamily | industrial | office | retail | mixed_use | senior_housing

# Cap-rate bounds per property type. Bottom-up CF engine rejects <3% or >15%
# globally; this layer is tighter — 4%–9% — per the underwriting discipline.
CAP_RATE_BAND: dict[PropertyType, tuple[Decimal, Decimal]] = {
    "multifamily":    (Decimal("0.040"), Decimal("0.065")),
    "industrial":     (Decimal("0.045"), Decimal("0.070")),
    "office":         (Decimal("0.060"), Decimal("0.090")),
    "retail":         (Decimal("0.055"), Decimal("0.085")),
    "mixed_use":      (Decimal("0.050"), Decimal("0.075")),
    "senior_housing": (Decimal("0.055"), Decimal("0.080")),
}

# Market tier → NOI growth + cap compression. Tight markets grow faster and
# compress; secondary markets are flatter. Markers are heuristic; an opinionated
# tier list is the right scope for the seed, not a global taxonomy.
TIER_1_MARKETS = {
    "Austin", "Nashville", "Phoenix", "Dallas", "Atlanta", "Charlotte",
    "Miami", "Tampa", "Raleigh", "Seattle", "Denver",
}
TIER_2_MARKETS = {
    "Boston", "Washington", "San Diego", "Scottsdale", "Portland",
    "Riverside", "Columbus",
}
TIER_3_MARKETS: set[str] = set()  # treated as default "secondary"

# Quarterly NOI growth rates per (property_type, market_tier). Annualized in
# the low-single-digits for stabilized assets; higher for value-add plans.
QUARTERLY_NOI_GROWTH = {
    ("multifamily", 1):    Decimal("0.0095"),
    ("multifamily", 2):    Decimal("0.0060"),
    ("multifamily", 3):    Decimal("0.0035"),
    ("industrial", 1):     Decimal("0.0110"),
    ("industrial", 2):     Decimal("0.0075"),
    ("industrial", 3):     Decimal("0.0045"),
    ("office", 1):         Decimal("0.0040"),
    ("office", 2):         Decimal("0.0020"),
    ("office", 3):         Decimal("0.0000"),
    ("retail", 1):         Decimal("0.0060"),
    ("retail", 2):         Decimal("0.0030"),
    ("retail", 3):         Decimal("0.0010"),
    ("mixed_use", 1):      Decimal("0.0080"),
    ("mixed_use", 2):      Decimal("0.0050"),
    ("mixed_use", 3):      Decimal("0.0025"),
    ("senior_housing", 1): Decimal("0.0070"),
    ("senior_housing", 2): Decimal("0.0050"),
    ("senior_housing", 3): Decimal("0.0030"),
}

# Strategy → multiplier on base NOI growth. Value-add plans lift NOI faster
# via capex-driven rent growth; distressed plans can swing negative if the
# workout fails. Opportunistic bets bigger on cap compression than on NOI.
STRATEGY_GROWTH_MULT = {
    "core":          Decimal("0.85"),
    "core_plus":     Decimal("1.00"),
    "value_add":     Decimal("1.45"),
    "opportunistic": Decimal("1.25"),
    "development":   Decimal("1.30"),
    "lease_up":      Decimal("1.60"),
    "distressed":    Decimal("0.80"),  # with a chance of contraction via driver
    "credit":        Decimal("0.00"),  # not modeled as equity NOI
}


def _market_tier(city: str) -> int:
    if city in TIER_1_MARKETS:
        return 1
    if city in TIER_2_MARKETS:
        return 2
    return 3


def _seeded_rng(asset_id: str) -> random.Random:
    h = hashlib.sha256(asset_id.encode()).hexdigest()
    return random.Random(int(h[:16], 16))


# ---------------------------------------------------------------------------
# Input profile + output record
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AssetProfile:
    """Identity + envelope used by the calibrator. Every field is required."""

    fund_id: str
    investment_id: str
    asset_id: str
    name: str
    property_type: PropertyType
    city: str
    state: str
    strategy: str                 # core | value_add | ...
    driver: str                   # rent_growth | cap_compression | ...
    acquisition_date: date
    cost_basis: Decimal           # full acquisition cost
    ltv: Decimal                  # 0.50–0.70
    interest_rate: Decimal        # 0.05–0.09, quoted as decimal
    hold_years: int               # 3–10
    target_irr_band: tuple[Decimal, Decimal]  # inclusive

    @property
    def market_tier(self) -> int:
        return _market_tier(self.city)


@dataclass
class CalibratedCashflow:
    profile: AssetProfile
    # Quarterly operating series (quarter-label → components). Quarter labels
    # are "YYYY-QN". All amounts are USD.
    operating_quarters: list[dict[str, Any]] = field(default_factory=list)
    # Exit event — status='realized' if exit_quarter <= as_of_quarter, else
    # 'projected'. net_proceeds already nets debt payoff + selling costs.
    exit_event: dict[str, Any] | None = None
    terminal_value: Decimal | None = None
    realized_irr: Decimal | None = None
    driver_shape: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Quarter helpers
# ---------------------------------------------------------------------------


def _quarter_of(d: date) -> str:
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


def _quarter_end_date(q: str) -> date:
    year = int(q[:4])
    qn = int(q[-1])
    month = qn * 3
    if month == 3:
        return date(year, 3, 31)
    if month == 6:
        return date(year, 6, 30)
    if month == 9:
        return date(year, 9, 30)
    return date(year, 12, 31)


def _add_quarters(q: str, n: int) -> str:
    year = int(q[:4])
    qn = int(q[-1])
    total = year * 4 + (qn - 1) + n
    new_y = total // 4
    new_q = (total % 4) + 1
    return f"{new_y}-Q{new_q}"


def _quarters_between(start_q: str, end_q: str) -> list[str]:
    """Inclusive list of quarter labels between start and end."""
    out: list[str] = []
    cur = start_q
    while True:
        out.append(cur)
        if cur == end_q:
            break
        cur = _add_quarters(cur, 1)
    return out


# ---------------------------------------------------------------------------
# Cash-flow construction
# ---------------------------------------------------------------------------


def _clamp(v: Decimal, lo: Decimal, hi: Decimal) -> Decimal:
    return max(lo, min(hi, v))


def _initial_noi(profile: AssetProfile) -> Decimal:
    """Base quarterly NOI at acquisition. Implied from a property-type
    entry cap rate applied to cost_basis."""
    lo, hi = CAP_RATE_BAND[profile.property_type]
    # Entry cap: slight premium to exit cap (the value-creation delta).
    # Start at mid-band + small premium.
    entry_cap = (lo + hi) / Decimal("2") + Decimal("0.0025")
    annual_noi = Decimal(profile.cost_basis) * entry_cap
    return (annual_noi / Decimal("4")).quantize(Decimal("1"))


def _apply_driver_to_growth(
    base_growth: Decimal, driver: str, qi: int, rng: random.Random
) -> Decimal:
    """Shape quarterly growth by the named driver.

    * rent_growth — flat base growth
    * cap_compression — base growth + tighter exit cap (applied at exit)
    * operational_improvement — growth ramps over first 2 years, stabilizes
    * development — flat or slightly negative early, jumps at delivery
    * distressed_recovery — negative in early quarters, recovery in late
    * lease_up — ramps from negative to base growth
    """
    if driver == "rent_growth":
        return base_growth
    if driver == "cap_compression":
        return base_growth  # handled at exit cap
    if driver == "operational_improvement":
        # First 8 quarters: 1.5× base growth; then base.
        return base_growth * (Decimal("1.5") if qi < 8 else Decimal("1.0"))
    if driver == "development":
        # Quarters 0-4: slightly negative; 5+: base × 1.3.
        if qi < 4:
            return Decimal("-0.005")
        return base_growth * Decimal("1.3")
    if driver == "distressed_recovery":
        # First 4 quarters contraction; then strong recovery.
        if qi < 4:
            return Decimal("-0.015")
        if qi < 8:
            return Decimal("0.010")
        return base_growth * Decimal("1.2")
    if driver == "lease_up":
        if qi < 4:
            return Decimal("-0.020")  # large drag during lease-up
        if qi < 8:
            return Decimal("0.015")
        return base_growth
    return base_growth


def _exit_cap(profile: AssetProfile, driver: str) -> Decimal:
    lo, hi = CAP_RATE_BAND[profile.property_type]
    mid = (lo + hi) / Decimal("2")
    # Cap compression driver tightens by 50 bps off mid; secondary markets
    # widen by 25 bps. Distressed exits widen 75 bps.
    cap = mid
    if driver == "cap_compression":
        cap -= Decimal("0.0050")
    if profile.market_tier == 3:
        cap += Decimal("0.0025")
    if driver == "distressed_recovery":
        cap += Decimal("0.0075")
    # Stay in the discipline band.
    return _clamp(cap, lo, hi)


def _build_quarterly_series(
    profile: AssetProfile,
    *,
    growth_mult: Decimal,
    driver: str,
    hold_quarters: int,
) -> list[dict[str, Any]]:
    """Build the operating quarter rows. Debt service is constant (IO loan at
    profile.interest_rate on LTV × cost_basis). Capex is modest except during
    value-add or development early-hold periods."""
    rng = _seeded_rng(profile.asset_id)
    acq_q = _quarter_of(profile.acquisition_date)
    tier = profile.market_tier
    base_growth = QUARTERLY_NOI_GROWTH[(profile.property_type, tier)] * growth_mult

    # Debt — IO, constant annual coupon × LTV × cost_basis, split per quarter.
    loan_balance = Decimal(profile.cost_basis) * Decimal(profile.ltv)
    quarterly_debt_service = (loan_balance * Decimal(profile.interest_rate) / Decimal("4")).quantize(Decimal("1"))

    noi = _initial_noi(profile)  # quarterly
    # Operating series runs from (acq_q + 1) through (acq_q + hold_quarters).
    rows: list[dict[str, Any]] = []
    for qi in range(1, hold_quarters + 1):
        q = _add_quarters(acq_q, qi)
        g = _apply_driver_to_growth(base_growth, driver, qi, rng)
        noi = noi * (Decimal("1") + g)

        # Realistic revenue / opex split: ~70% revenue - 30% opex collapses
        # to NOI. We back-solve revenue from NOI for a stable ~30% opex ratio.
        opex_ratio = Decimal("0.30") + Decimal(str(rng.uniform(-0.02, 0.02)))
        revenue = (noi / (Decimal("1") - opex_ratio)).quantize(Decimal("1"))
        opex = (revenue * opex_ratio).quantize(Decimal("1"))
        other_income = (revenue * Decimal("0.02")).quantize(Decimal("1"))

        # Capex: value-add / development heavy in first 8 quarters.
        if driver in {"operational_improvement", "development", "lease_up"} and qi <= 8:
            capex = (Decimal(profile.cost_basis) * Decimal("0.004")).quantize(Decimal("1"))
        else:
            capex = (Decimal(profile.cost_basis) * Decimal("0.0015")).quantize(Decimal("1"))

        rows.append(
            {
                "quarter": q,
                "revenue": revenue,
                "other_income": other_income,
                "opex": opex,
                "capex": capex,
                "debt_service": quarterly_debt_service,
                "noi": noi.quantize(Decimal("1")),
            }
        )
    return rows


def _solve_exit_for_irr(
    profile: AssetProfile,
    operating_rows: list[dict[str, Any]],
    *,
    target_irr: Decimal,
    loan_balance: Decimal,
    driver: str,
) -> tuple[Decimal, Decimal]:
    """Back-solve net_proceeds (levered equity exit) so realized XIRR ≈ target.

    We fix operating CFs (already built) and binary-search the exit CF at the
    final operating quarter. Returns (gross_sale_price, net_proceeds).

    This is intentionally allowed to move far enough to hit negative-IRR
    targets when the fund distribution calls for them — we don't cap the exit
    below the realistic downside scenario (e.g. 30–60% equity loss on failed
    distressed deals)."""
    if not operating_rows:
        return (Decimal(profile.cost_basis), Decimal(profile.cost_basis))

    acq_date = profile.acquisition_date
    equity_check = Decimal(profile.cost_basis) * (Decimal("1") - Decimal(profile.ltv))
    acq_q = _quarter_of(acq_date)
    acq_q_end = _quarter_end_date(acq_q)

    # Quarterly CFs to equity: NOI - capex - debt_service.
    equity_cf_quarters: list[tuple[date, Decimal]] = [(acq_q_end, -equity_check)]
    for row in operating_rows:
        q_end = _quarter_end_date(row["quarter"])
        q_cf = row["noi"] - row["capex"] - row["debt_service"]
        equity_cf_quarters.append((q_end, q_cf))

    # Binary-search the exit net proceeds that produces the target IRR.
    last_q_end = equity_cf_quarters[-1][0]
    # Sensible search range: -80% of equity check to 5× equity check.
    lo_np = -equity_check * Decimal("0.8")
    hi_np = equity_check * Decimal("5.0")
    for _ in range(80):
        mid_np = (lo_np + hi_np) / Decimal("2")
        trial = list(equity_cf_quarters)
        # Fold the exit CF into the final quarter alongside ops.
        trial[-1] = (last_q_end, trial[-1][1] + mid_np)
        result = xirr(trial)
        if result is None:
            # Pushing higher usually fixes missing sign changes.
            lo_np = mid_np
            continue
        diff = Decimal(str(result)) - target_irr
        if abs(diff) < Decimal("0.0005"):
            break
        if diff > 0:
            hi_np = mid_np
        else:
            lo_np = mid_np

    net_proceeds = (lo_np + hi_np) / Decimal("2")
    # Gross sale price grosses-up net proceeds for debt payoff + 2% selling costs.
    gross_sale_price = (net_proceeds + loan_balance) / (Decimal("1") - Decimal("0.02"))
    return (gross_sale_price.quantize(Decimal("1")), net_proceeds.quantize(Decimal("1")))


def calibrate_asset(
    profile: AssetProfile,
    *,
    as_of_quarter: str = "2026-Q1",
) -> CalibratedCashflow:
    """Produce a calibrated CF series + exit event for one asset.

    Target IRR is sampled deterministically from `profile.target_irr_band`
    using the asset_id hash as the seed.
    """
    rng = _seeded_rng(profile.asset_id)
    lo, hi = profile.target_irr_band
    lo_f, hi_f = float(lo), float(hi)
    target = Decimal(str(rng.uniform(lo_f, hi_f))).quantize(Decimal("0.0001"))

    driver = profile.driver
    growth_mult = STRATEGY_GROWTH_MULT.get(profile.strategy, Decimal("1.00"))
    hold_quarters = profile.hold_years * 4

    operating_rows = _build_quarterly_series(
        profile,
        growth_mult=growth_mult,
        driver=driver,
        hold_quarters=hold_quarters,
    )

    loan_balance = Decimal(profile.cost_basis) * Decimal(profile.ltv)
    gross_sale_price, net_proceeds = _solve_exit_for_irr(
        profile, operating_rows,
        target_irr=target, loan_balance=loan_balance, driver=driver,
    )

    exit_q = operating_rows[-1]["quarter"]
    exit_status = (
        "realized" if _quarter_end_date(exit_q) <= _quarter_end_date(as_of_quarter)
        else "projected"
    )
    exit_cap = _exit_cap(profile, driver)
    selling_costs = (gross_sale_price * Decimal("0.02")).quantize(Decimal("1"))

    # Verify realized IRR against target.
    acq_q_end = _quarter_end_date(_quarter_of(profile.acquisition_date))
    equity_check = Decimal(profile.cost_basis) * (Decimal("1") - Decimal(profile.ltv))
    equity_cfs: list[tuple[date, Decimal]] = [(acq_q_end, -equity_check)]
    for row in operating_rows[:-1]:
        equity_cfs.append(
            (_quarter_end_date(row["quarter"]),
             row["noi"] - row["capex"] - row["debt_service"])
        )
    final = operating_rows[-1]
    final_cf = final["noi"] - final["capex"] - final["debt_service"] + net_proceeds
    equity_cfs.append((_quarter_end_date(final["quarter"]), final_cf))
    realized = xirr(equity_cfs)
    realized_dec = Decimal(str(realized)) if realized is not None else None

    # Terminal-value discipline: compute TTM NOI / exit_cap; flag if the
    # synthetic TV dominates total positive CF.
    ttm_noi = sum((r["noi"] for r in operating_rows[-4:]), Decimal(0))
    implied_tv = (ttm_noi / exit_cap) if exit_cap else None
    total_positive = sum((c[1] for c in equity_cfs if c[1] > 0), Decimal(0))
    warnings: list[str] = []
    if total_positive > 0 and gross_sale_price - loan_balance > total_positive * Decimal("0.8"):
        warnings.append("terminal_value_dominant")
    if realized_dec is None:
        warnings.append("irr_nonconvergence")
    elif not (lo - Decimal("0.02") <= realized_dec <= hi + Decimal("0.02")):
        warnings.append("irr_outside_band")

    exit_event = {
        "status": exit_status,
        "exit_quarter": exit_q,
        "exit_date": _quarter_end_date(exit_q),
        "gross_sale_price": gross_sale_price,
        "selling_costs": selling_costs,
        "debt_payoff": loan_balance.quantize(Decimal("1")),
        "net_proceeds": net_proceeds,
        "projected_cap_rate": exit_cap,
        "target_irr": target,
    }
    return CalibratedCashflow(
        profile=profile,
        operating_quarters=operating_rows,
        exit_event=exit_event,
        terminal_value=implied_tv,
        realized_irr=realized_dec,
        driver_shape={"driver": driver, "growth_mult": float(growth_mult),
                      "exit_cap": float(exit_cap)},
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Portfolio-level distribution sampler
# ---------------------------------------------------------------------------

# Target distribution bands per the brief.
DISTRIBUTION_TARGETS: list[tuple[str, Decimal, Decimal, float, float]] = [
    # (label, lo, hi, min_share, max_share)
    ("negative",       Decimal("-0.30"), Decimal("-0.005"), 0.10, 0.20),
    ("low_single",     Decimal("0.000"),  Decimal("0.080"), 0.20, 0.30),
    ("core_band",      Decimal("0.080"),  Decimal("0.180"), 0.40, 0.50),
    ("outperformer",   Decimal("0.200"),  Decimal("0.350"), 0.05, 0.10),
]


def assign_target_bands(n_assets: int, *, seed: int = 7) -> list[tuple[Decimal, Decimal]]:
    """Assign a target IRR band to each asset so the resulting distribution
    hits the brief's targets. Uses the midpoints of each target's min/max
    share to allocate counts, then fills the remainder into the core band.
    Deterministic given n_assets."""
    rng = random.Random(seed)
    counts: dict[str, int] = {}
    assigned = 0
    for label, _lo, _hi, mn, mx in DISTRIBUTION_TARGETS:
        share = (mn + mx) / 2
        k = max(1 if mn > 0 else 0, int(round(n_assets * share)))
        counts[label] = k
        assigned += k
    # Close any gap by boosting core_band.
    if assigned < n_assets:
        counts["core_band"] += n_assets - assigned
    elif assigned > n_assets:
        counts["core_band"] = max(0, counts["core_band"] - (assigned - n_assets))

    bands: list[tuple[Decimal, Decimal]] = []
    for label, lo, hi, _mn, _mx in DISTRIBUTION_TARGETS:
        for _ in range(counts[label]):
            bands.append((lo, hi))
    rng.shuffle(bands)
    # Pad/truncate to n_assets.
    if len(bands) < n_assets:
        bands += [(Decimal("0.08"), Decimal("0.18"))] * (n_assets - len(bands))
    return bands[:n_assets]


def classify_irr(irr: Decimal | None) -> str:
    if irr is None:
        return "null"
    if irr < Decimal("0"):
        return "negative"
    if irr < Decimal("0.08"):
        return "low_single"
    if irr < Decimal("0.18"):
        return "core_band"
    if irr < Decimal("0.20"):
        return "gap_18_20"
    return "outperformer"


def distribution_summary(cfs: list[CalibratedCashflow]) -> dict[str, Any]:
    buckets: dict[str, int] = {
        "negative": 0,
        "low_single": 0,
        "core_band": 0,
        "gap_18_20": 0,
        "outperformer": 0,
        "null": 0,
    }
    for c in cfs:
        buckets[classify_irr(c.realized_irr)] += 1
    total = len(cfs) or 1
    return {
        "counts": buckets,
        "shares": {k: v / total for k, v in buckets.items()},
        "n": total,
    }


# ---------------------------------------------------------------------------
# Fund-level reconciliation
# ---------------------------------------------------------------------------


def fund_reconciliation(cfs: list[CalibratedCashflow]) -> dict[str, Any]:
    """Aggregate asset equity CFs to a fund series and compute fund IRR."""
    merged: dict[date, Decimal] = {}
    for c in cfs:
        equity_check = Decimal(c.profile.cost_basis) * (
            Decimal("1") - Decimal(c.profile.ltv)
        )
        acq_q_end = _quarter_end_date(_quarter_of(c.profile.acquisition_date))
        merged[acq_q_end] = merged.get(acq_q_end, Decimal(0)) - equity_check
        for row in c.operating_quarters[:-1]:
            q_end = _quarter_end_date(row["quarter"])
            merged[q_end] = (
                merged.get(q_end, Decimal(0))
                + row["noi"] - row["capex"] - row["debt_service"]
            )
        final = c.operating_quarters[-1]
        q_end = _quarter_end_date(final["quarter"])
        merged[q_end] = (
            merged.get(q_end, Decimal(0))
            + final["noi"] - final["capex"] - final["debt_service"]
            + Decimal(c.exit_event["net_proceeds"])
        )
    series = sorted(merged.items())
    fund_irr = xirr(series)
    total_equity = sum(
        Decimal(c.profile.cost_basis) * (Decimal("1") - Decimal(c.profile.ltv))
        for c in cfs
    )
    total_net_proceeds = sum(
        Decimal(c.exit_event["net_proceeds"]) for c in cfs
    )
    # TVPI approximation — sum positive / sum negative (absolute).
    pos = sum((a for _, a in series if a > 0), Decimal(0))
    neg = sum((a for _, a in series if a < 0), Decimal(0))
    tvpi = (pos / -neg) if neg != 0 else None
    return {
        "gross_irr": float(Decimal(str(fund_irr))) if fund_irr is not None else None,
        "tvpi": float(tvpi) if tvpi is not None else None,
        "total_equity": float(total_equity),
        "total_net_proceeds": float(total_net_proceeds),
        "quarters": len(series),
    }
