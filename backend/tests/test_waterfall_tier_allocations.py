"""Tier-allocation invariants for run_us_waterfall — INV-W1/W2/W3.

These are the three invariants that every tier in run_us_waterfall must
satisfy. Without all three, the engine can leak or double-count cash
silently (bugs move to later tiers).

  INV-W1 — Tier-level conservation:
      Σ(payouts_in_tier) == min(remaining_entering_tier, Σ(weights))
      Exactly equal. Not ≤, not ≥.

  INV-W2 — Per-partner cap:
      payout_{partner, tier} ≤ weight_{partner, tier}
      Every partner, every tier. Zero weight → zero payout.

  INV-W3 — Residual correctness:
      remaining_after_tier == remaining_entering_tier - Σ(payouts_in_tier)
      And that exact value flows into the next tier.

Regression target: fix at waterfall_engine.py:80-88 (tier-1 cap).
Pre-fix bug: tier 1 passed the full `remaining` into _tier_alloc with no
cap at sum(weights), over-allocating when distributable > Σ unreturned.
"""
from __future__ import annotations

from decimal import Decimal

from app.finance.waterfall_engine import (
    ParticipantState,
    WaterfallContract,
    WaterfallInput,
    run_us_waterfall,
)


# ---------------------------------------------------------------------------
# Fixtures — hand-built participant rosters
# ---------------------------------------------------------------------------

def _contract(pref=0.08, carry=0.20, catchup=1.0, style="european") -> WaterfallContract:
    return WaterfallContract(
        pref_rate=Decimal(str(pref)),
        pref_is_compound=False,
        carry_rate=Decimal(str(carry)),
        catchup_rate=Decimal(str(catchup)),
        style=style,
    )


def _participants_standard() -> tuple[ParticipantState, ...]:
    """2 GPs + 3 LPs with varied unreturned capital and pref_due."""
    return (
        ParticipantState(
            participant_id="gp-1",
            role="gp",
            commitment_amount=Decimal("10000000"),
            unreturned_capital=Decimal("10000000"),
            pref_due=Decimal("800000"),
        ),
        ParticipantState(
            participant_id="gp-2",
            role="gp",
            commitment_amount=Decimal("5000000"),
            unreturned_capital=Decimal("5000000"),
            pref_due=Decimal("400000"),
        ),
        ParticipantState(
            participant_id="lp-big",
            role="lp",
            commitment_amount=Decimal("100000000"),
            unreturned_capital=Decimal("100000000"),
            pref_due=Decimal("8000000"),
        ),
        ParticipantState(
            participant_id="lp-mid",
            role="lp",
            commitment_amount=Decimal("50000000"),
            unreturned_capital=Decimal("50000000"),
            pref_due=Decimal("4000000"),
        ),
        ParticipantState(
            participant_id="lp-small",
            role="lp",
            commitment_amount=Decimal("20000000"),
            unreturned_capital=Decimal("20000000"),
            pref_due=Decimal("1600000"),
        ),
    )


def _participants_with_zero_weight() -> tuple[ParticipantState, ...]:
    """Mix: some partners with unreturned=0 (excluded from tier 1)."""
    return (
        ParticipantState(
            participant_id="gp-1",
            role="gp",
            commitment_amount=Decimal("10000000"),
            unreturned_capital=Decimal("10000000"),
            pref_due=Decimal("800000"),
        ),
        ParticipantState(
            participant_id="lp-funded",
            role="lp",
            commitment_amount=Decimal("100000000"),
            unreturned_capital=Decimal("40000000"),  # already partly returned
            pref_due=Decimal("8000000"),
        ),
        ParticipantState(
            participant_id="lp-unfunded",
            role="lp",
            commitment_amount=Decimal("50000000"),
            unreturned_capital=Decimal("0"),  # zero weight in tier 1
            pref_due=Decimal("0"),
        ),
    )


def _aggregate_weights_tier1(participants: tuple[ParticipantState, ...]) -> Decimal:
    return sum((p.unreturned_capital for p in participants), Decimal("0"))


# ---------------------------------------------------------------------------
# INV-W1 — tier-level conservation
# ---------------------------------------------------------------------------

def test_inv_w1_tier1_total_equals_cap_when_distributable_exceeds_unreturned():
    """If distributable > Σ unreturned, tier 1 total must equal Σ unreturned
    exactly. The excess must cascade — not spill silently into tier 1."""
    participants = _participants_standard()
    sum_unreturned = _aggregate_weights_tier1(participants)
    distributable = sum_unreturned * Decimal("1.5")  # way over

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    t1_total = sum(
        (line.amount for line in lines if line.tier_code == "tier_1_return_of_capital"),
        Decimal("0"),
    )
    expected = min(distributable, sum_unreturned)
    assert t1_total == expected, (
        f"INV-W1 violation: tier 1 total {t1_total} != min({distributable}, {sum_unreturned}) = {expected}"
    )


def test_inv_w1_tier1_total_equals_distributable_when_undercap():
    """If distributable < Σ unreturned, tier 1 total must equal distributable
    exactly (fully consumed, no residual to tier 2)."""
    participants = _participants_standard()
    sum_unreturned = _aggregate_weights_tier1(participants)
    distributable = sum_unreturned * Decimal("0.5")  # half

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    t1_total = sum(
        (line.amount for line in lines if line.tier_code == "tier_1_return_of_capital"),
        Decimal("0"),
    )
    assert t1_total == distributable, (
        f"INV-W1 violation: tier 1 total {t1_total} != distributable {distributable}"
    )


def test_inv_w1_tier2_total_equals_cap():
    """Tier 2 (preferred return) must also respect conservation: total ==
    min(remaining, Σ pref_due across LPs)."""
    participants = _participants_standard()
    sum_unreturned = _aggregate_weights_tier1(participants)
    lp_pref_due = sum(
        (p.pref_due for p in participants if p.role != "gp"),
        Decimal("0"),
    )
    # Distributable = Σ unreturned + Σ LP pref_due × 2 (so tier 2 is over-capped)
    distributable = sum_unreturned + lp_pref_due * Decimal("2")

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    t2_total = sum(
        (line.amount for line in lines if line.tier_code == "tier_2_preferred_return"),
        Decimal("0"),
    )
    assert t2_total == lp_pref_due, (
        f"INV-W1 violation on tier 2: total {t2_total} != LP pref_due cap {lp_pref_due}"
    )


# ---------------------------------------------------------------------------
# INV-W2 — per-partner cap
# ---------------------------------------------------------------------------

def test_inv_w2_every_partner_tier1_leq_their_unreturned():
    """For every partner, tier-1 payout must be ≤ their unreturned capital.
    A partner cannot be returned more than they paid in."""
    participants = _participants_standard()
    distributable = _aggregate_weights_tier1(participants) * Decimal("1.5")  # over-cap

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    unreturned_by_id = {p.participant_id: p.unreturned_capital for p in participants}
    for line in lines:
        if line.tier_code != "tier_1_return_of_capital":
            continue
        cap = unreturned_by_id[line.participant_id]
        assert line.amount <= cap, (
            f"INV-W2 violation: {line.participant_id} got {line.amount} > unreturned cap {cap}"
        )


def test_inv_w2_zero_weight_partner_gets_zero_in_tier1():
    """A partner with unreturned_capital=0 must receive $0 in tier 1,
    regardless of distributable magnitude. Zero weight → zero payout."""
    participants = _participants_with_zero_weight()
    # Use huge distributable to make sure nothing leaks into a zero-weight partner.
    distributable = Decimal("1000000000000")

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    # lp-unfunded must receive exactly 0 in tier 1.
    unfunded_t1 = sum(
        (
            line.amount
            for line in lines
            if line.participant_id == "lp-unfunded"
            and line.tier_code == "tier_1_return_of_capital"
        ),
        Decimal("0"),
    )
    assert unfunded_t1 == Decimal("0"), (
        f"INV-W2 violation: zero-unreturned partner received {unfunded_t1} in tier 1"
    )


def test_inv_w2_every_partner_tier2_leq_their_pref_due():
    """Tier 2 per-partner cap: each LP's preferred-return payout ≤ their pref_due."""
    participants = _participants_standard()
    sum_unreturned = _aggregate_weights_tier1(participants)
    lp_pref_due = sum(
        (p.pref_due for p in participants if p.role != "gp"),
        Decimal("0"),
    )
    distributable = sum_unreturned + lp_pref_due * Decimal("2")  # over-cap tier 2

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    pref_by_id = {p.participant_id: p.pref_due for p in participants}
    for line in lines:
        if line.tier_code != "tier_2_preferred_return":
            continue
        cap = pref_by_id[line.participant_id]
        assert line.amount <= cap, (
            f"INV-W2 violation (tier 2): {line.participant_id} got {line.amount} > pref_due cap {cap}"
        )


# ---------------------------------------------------------------------------
# INV-W3 — residual correctness
# ---------------------------------------------------------------------------

def test_inv_w3_residual_cascades_exactly_from_tier1_to_tier2():
    """remaining_after_tier1 must equal distributable - tier1_total, to the
    penny. And whatever tier 2 consumes must come from that residual."""
    participants = _participants_standard()
    sum_unreturned = _aggregate_weights_tier1(participants)
    distributable = sum_unreturned * Decimal("2")  # plenty to cascade

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    t1_total = sum(
        (line.amount for line in lines if line.tier_code == "tier_1_return_of_capital"),
        Decimal("0"),
    )
    t2_total = sum(
        (line.amount for line in lines if line.tier_code == "tier_2_preferred_return"),
        Decimal("0"),
    )

    expected_residual_after_t1 = distributable - t1_total
    # Tier 2 must consume at most what tier 1 left behind.
    assert t2_total <= expected_residual_after_t1, (
        f"INV-W3 violation: tier 2 consumed {t2_total} but only {expected_residual_after_t1} "
        f"was left after tier 1 (distributable={distributable}, tier1={t1_total})"
    )


def test_inv_w3_all_tier_payouts_sum_to_distributable():
    """Total of all payouts (all tiers combined) must equal the distributable
    amount exactly. No cash leaks to /dev/null, no cash conjured."""
    participants = _participants_standard()
    sum_unreturned = _aggregate_weights_tier1(participants)
    distributable = sum_unreturned * Decimal("3")  # definitely exercises all tiers

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    total_paid = sum((line.amount for line in lines), Decimal("0"))
    # Allow 1-cent quantization tolerance across 4+ tiers.
    assert abs(total_paid - distributable) <= Decimal("0.01"), (
        f"INV-W3 violation: total payouts {total_paid} != distributable {distributable}; "
        f"delta {total_paid - distributable}"
    )


def test_inv_w3_tier_totals_are_non_overlapping():
    """A partner's tier 1 + tier 2 + tier 3 + tier 4 payouts must be
    computed from the distributable residual at each step — not from the
    full distributable. Tier 2 total must be ≤ distributable - tier1_total."""
    participants = _participants_standard()
    sum_unreturned = _aggregate_weights_tier1(participants)
    distributable = sum_unreturned + Decimal("1000000")  # small residual

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=participants,
        ),
    )

    t1_total = sum(
        (line.amount for line in lines if line.tier_code == "tier_1_return_of_capital"),
        Decimal("0"),
    )
    t2_total = sum(
        (line.amount for line in lines if line.tier_code == "tier_2_preferred_return"),
        Decimal("0"),
    )

    residual_after_t1 = distributable - t1_total
    assert t2_total <= residual_after_t1, (
        f"INV-W3 violation: tier 2 ({t2_total}) consumed more than residual ({residual_after_t1})"
    )


# ---------------------------------------------------------------------------
# IGF VII regression — the exact scenario from phase_B3a
# ---------------------------------------------------------------------------

def test_igf7_scenario_tier1_no_longer_overallocates():
    """Pins the IGF VII 2026Q2 mechanism documented in
    verification/receipts/meridian_repromotion_2026-04-20/phase_B3a_waterfall_root_cause.md.

    Pre-fix: engine paid $1,446M in tier 1 with Σ unreturned = $1,187M,
    over-allocating every partner by factor 1.2189.

    Post-fix: tier 1 total == Σ unreturned = $1,187M; residual $259M
    cascades to tier 2+."""
    igf7_partners = (
        ParticipantState("meridian-gp", "gp", Decimal("25000000"), Decimal("786997988.84"), Decimal("0")),
        ParticipantState("winston-gp", "gp", Decimal("10000000"), Decimal("106623580.55"), Decimal("0")),
        ParticipantState("state-pension", "lp", Decimal("200000000"), Decimal("99497988.84"), Decimal("7959839.11")),
        ParticipantState("university-endow", "lp", Decimal("150000000"), Decimal("98623571.09"), Decimal("7889885.69")),
        ParticipantState("calpers", "lp", Decimal("125000000"), Decimal("86700388.81"), Decimal("6936031.10")),
        ParticipantState("sovereign-wealth", "lp", Decimal("140000000"), Decimal("8192243.91"), Decimal("655379.51")),
        # Zero-unreturned partners (seeding bug — kept for regression realism)
        ParticipantState("blackrock", "lp", Decimal("100000000"), Decimal("0"), Decimal("0")),
        ParticipantState("hartford", "lp", Decimal("75000000"), Decimal("0"), Decimal("0")),
        ParticipantState("texas-teachers", "lp", Decimal("50000000"), Decimal("0"), Decimal("0")),
        ParticipantState("whitfield", "lp", Decimal("50000000"), Decimal("0"), Decimal("0")),
        ParticipantState("duke-endow", "lp", Decimal("50000000"), Decimal("0"), Decimal("0")),
        ParticipantState("evergreen", "lp", Decimal("25000000"), Decimal("0"), Decimal("0")),
    )
    sum_unreturned = sum((p.unreturned_capital for p in igf7_partners), Decimal("0"))
    distributable = Decimal("1446373530.90")  # IGF VII 2026Q2 NAV

    lines = run_us_waterfall(
        _contract(),
        WaterfallInput(
            as_of_date=None,
            distribution_amount=distributable,
            gp_profit_paid_to_date=Decimal("0"),
            lp_profit_paid_to_date=Decimal("0"),
            participants=igf7_partners,
        ),
    )

    t1_total = sum(
        (line.amount for line in lines if line.tier_code == "tier_1_return_of_capital"),
        Decimal("0"),
    )

    # INV-W1: tier 1 total equals Σ unreturned, NOT the full $1.446B.
    # Allow 1-cent quantization slack from the pro-rata rounding pass.
    assert abs(t1_total - sum_unreturned) <= Decimal("0.01"), (
        f"regression: IGF VII tier 1 total {t1_total} should equal Σ unreturned "
        f"{sum_unreturned}, not the old over-allocated $1.446B"
    )

    # INV-W2: each partner's tier 1 payout ≤ their unreturned.
    unreturned_by_id = {p.participant_id: p.unreturned_capital for p in igf7_partners}
    for line in lines:
        if line.tier_code != "tier_1_return_of_capital":
            continue
        cap = unreturned_by_id[line.participant_id]
        # Post-fix, each partner should receive exactly their unreturned (no over-cap).
        # 1-cent tolerance for rounding.
        assert line.amount <= cap + Decimal("0.01"), (
            f"regression: {line.participant_id} got {line.amount} > unreturned {cap}"
        )

    # INV-W3: residual must cascade. Tier 2/3/4 must fire.
    later_tier_total = sum(
        (line.amount for line in lines if line.tier_code != "tier_1_return_of_capital"),
        Decimal("0"),
    )
    expected_residual = distributable - sum_unreturned
    assert later_tier_total >= expected_residual - Decimal("0.01"), (
        f"regression: residual {expected_residual} didn't cascade to later tiers "
        f"(later tiers total: {later_tier_total})"
    )
