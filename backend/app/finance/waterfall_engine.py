"""US-style deterministic waterfall engine (REPE-first)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Iterable

from .allocation_engine import allocate_pro_rata
from .utils import qmoney


@dataclass(frozen=True)
class ParticipantState:
    participant_id: str
    role: str  # gp | lp | co_invest
    commitment_amount: Decimal
    unreturned_capital: Decimal
    pref_due: Decimal


@dataclass(frozen=True)
class WaterfallContract:
    pref_rate: Decimal
    pref_is_compound: bool
    carry_rate: Decimal
    catchup_rate: Decimal
    style: str  # american | european


@dataclass(frozen=True)
class WaterfallInput:
    as_of_date: date
    distribution_amount: Decimal
    gp_profit_paid_to_date: Decimal
    lp_profit_paid_to_date: Decimal
    participants: tuple[ParticipantState, ...]


@dataclass(frozen=True)
class AllocationLine:
    tier_code: str
    payout_type: str
    participant_id: str
    amount: Decimal


def _tier_alloc(
    tier_code: str,
    payout_type: str,
    amount: Decimal,
    weights: dict[str, Decimal],
) -> tuple[Decimal, list[AllocationLine]]:
    total = qmoney(amount)
    if total <= 0:
        return Decimal("0"), []
    allocations = allocate_pro_rata(total, weights)
    lines = [
        AllocationLine(
            tier_code=tier_code,
            payout_type=payout_type,
            participant_id=pid,
            amount=amt,
        )
        for pid, amt in sorted(allocations.items())
        if amt > 0
    ]
    return qmoney(sum((line.amount for line in lines), Decimal("0"))), lines


def run_us_waterfall(contract: WaterfallContract, wf_input: WaterfallInput) -> list[AllocationLine]:
    remaining = qmoney(wf_input.distribution_amount)
    lines: list[AllocationLine] = []

    participants = list(wf_input.participants)
    gp_participants = [p for p in participants if p.role == "gp"]
    lp_participants = [p for p in participants if p.role != "gp"]

    # Tier 1: Return of capital.
    t1_weights = {p.participant_id: qmoney(p.unreturned_capital) for p in participants}
    t1_alloc, t1_lines = _tier_alloc("tier_1_return_of_capital", "return_of_capital", remaining, t1_weights)
    lines.extend(t1_lines)
    remaining = qmoney(remaining - t1_alloc)

    # Tier 2: Preferred return (LP side first in US-style waterfalls).
    t2_weights = {p.participant_id: qmoney(p.pref_due) for p in lp_participants}
    t2_target = qmoney(sum(t2_weights.values(), Decimal("0")))
    t2_amount = min(remaining, t2_target)
    t2_alloc, t2_lines = _tier_alloc("tier_2_preferred_return", "preferred_return", t2_amount, t2_weights)
    lines.extend(t2_lines)
    remaining = qmoney(remaining - t2_alloc)

    # Tier 3: GP catch-up until GP reaches carry share of cumulative profit.
    gp_profit_prior = qmoney(wf_input.gp_profit_paid_to_date)
    lp_profit_after_pref = qmoney(wf_input.lp_profit_paid_to_date + t2_alloc)
    carry_rate = qmoney(contract.carry_rate)

    catchup_needed = Decimal("0")
    if carry_rate > 0 and carry_rate < 1:
        target_gp_profit = qmoney(carry_rate * (lp_profit_after_pref + gp_profit_prior))
        catchup_needed = qmoney((target_gp_profit - gp_profit_prior) / (Decimal("1") - carry_rate))
        if catchup_needed < 0:
            catchup_needed = Decimal("0")

    catchup_cap = qmoney(remaining * qmoney(contract.catchup_rate))
    t3_amount = min(remaining, catchup_cap, catchup_needed)
    t3_weights = {p.participant_id: qmoney(p.commitment_amount) for p in gp_participants}
    t3_alloc, t3_lines = _tier_alloc("tier_3_gp_catch_up", "catch_up", t3_amount, t3_weights)
    lines.extend(t3_lines)
    remaining = qmoney(remaining - t3_alloc)

    # Tier 4: residual carry split.
    if remaining > 0:
        gp_share = qmoney(remaining * carry_rate)
        lp_share = qmoney(remaining - gp_share)

        gp_weights = {p.participant_id: qmoney(p.commitment_amount) for p in gp_participants}
        lp_weights = {p.participant_id: qmoney(p.commitment_amount) for p in lp_participants}

        gp_alloc, gp_lines = _tier_alloc("tier_4_carry_split_gp", "carry", gp_share, gp_weights)
        lp_alloc, lp_lines = _tier_alloc("tier_4_carry_split_lp", "carry", lp_share, lp_weights)

        lines.extend(gp_lines)
        lines.extend(lp_lines)

        remaining = qmoney(remaining - gp_alloc - lp_alloc)

    # Deterministic remainder handling due to quantization.
    if remaining > 0 and participants:
        target_id = sorted(p.participant_id for p in participants)[0]
        lines.append(
            AllocationLine(
                tier_code="tier_5_rounding_adjustment",
                payout_type="carry",
                participant_id=target_id,
                amount=remaining,
            )
        )

    return lines


def lines_total(lines: Iterable[AllocationLine]) -> Decimal:
    return qmoney(sum((line.amount for line in lines), Decimal("0")))
