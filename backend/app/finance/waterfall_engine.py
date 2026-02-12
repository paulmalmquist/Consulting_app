"""Deterministic JV waterfall engine (v1).

Design goals:
- Deterministic outputs for identical inputs.
- Auditable line-by-line distributions with tier lineage.
- Decimal-based currency math.
- Robust XIRR solver using bracketing + Newton fallback.

Limitations (documented):
- v1 implements American waterfall behavior. European is accepted but treated as
  American with a limitation note in the run metadata.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP, getcontext
import hashlib
import json
import math
from typing import Any, Iterable

# High precision for compounding and proportional splits.
getcontext().prec = 42

ENGINE_VERSION = "wf_engine_v1.0.0"

DECIMAL_ZERO = Decimal("0")
MONEY_QUANT = Decimal("0.000001")
EPS = Decimal("0.0000005")


def _to_decimal(value: Any, *, default: Decimal = DECIMAL_ZERO) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float, str)):
        try:
            return Decimal(str(value))
        except Exception:
            return default
    return default


def _q_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


@dataclass(frozen=True)
class PartnerInput:
    id: str
    name: str
    role: str
    has_promote: bool
    commitment_amount: Decimal
    ownership_pct: Decimal


@dataclass(frozen=True)
class TierInput:
    id: str
    tier_order: int
    tier_type: str
    hurdle_irr: Decimal | None
    hurdle_multiple: Decimal | None
    pref_rate: Decimal | None
    catch_up_pct: Decimal | None
    split_lp: Decimal | None
    split_gp: Decimal | None
    notes: str | None


@dataclass(frozen=True)
class CashflowEventInput:
    date: date
    event_type: str
    amount: Decimal
    metadata: dict[str, Any]


@dataclass
class PartnerState:
    contributed: Decimal = DECIMAL_ZERO
    returned_capital: Decimal = DECIMAL_ZERO
    unpaid_pref: Decimal = DECIMAL_ZERO
    total_distributed: Decimal = DECIMAL_ZERO
    profit_distributed: Decimal = DECIMAL_ZERO

    @property
    def unreturned_capital(self) -> Decimal:
        return max(self.contributed - self.returned_capital, DECIMAL_ZERO)


@dataclass
class XirrResult:
    value: Decimal | None
    reason: str | None = None


@dataclass
class WaterfallRunResult:
    engine_version: str
    run_hash: str
    summary_metrics: dict[str, Decimal]
    summary_meta: dict[str, Any]
    distributions: list[dict[str, Any]]
    tier_ledger: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# XIRR
# ---------------------------------------------------------------------------


def _xnpv(rate: float, cashflows: list[tuple[date, Decimal]]) -> float:
    if rate <= -0.999999999:
        return math.inf
    t0 = cashflows[0][0]
    total = 0.0
    for d, amount in cashflows:
        years = (d - t0).days / 365.0
        try:
            disc = (1.0 + rate) ** years
            total += float(amount) / disc
        except (OverflowError, ZeroDivisionError):
            # Extremely high rates can overflow in denominator; treat as tiny present value.
            if amount > 0:
                total += 0.0
            else:
                total += 0.0
    return total


def _xnpv_prime(rate: float, cashflows: list[tuple[date, Decimal]]) -> float:
    if rate <= -0.999999999:
        return math.inf
    t0 = cashflows[0][0]
    total = 0.0
    for d, amount in cashflows:
        years = (d - t0).days / 365.0
        if years == 0:
            continue
        try:
            denom = (1.0 + rate) ** (years + 1.0)
            total += -years * float(amount) / denom
        except (OverflowError, ZeroDivisionError):
            continue
    return total


def xirr(cashflows: Iterable[tuple[date, Decimal]]) -> XirrResult:
    """Compute XIRR with bracketed Newton method.

    Returns None with reason when no mathematical solution can be bracketed.
    """

    cf = sorted([(d, _to_decimal(a)) for d, a in cashflows], key=lambda x: (x[0], x[1]))
    if len(cf) < 2:
        return XirrResult(value=None, reason="need_at_least_two_cashflows")

    has_pos = any(a > 0 for _, a in cf)
    has_neg = any(a < 0 for _, a in cf)
    if not has_pos or not has_neg:
        return XirrResult(value=None, reason="cashflows_must_have_positive_and_negative")

    low = -0.9999
    high = 1.0
    f_low = _xnpv(low, cf)
    f_high = _xnpv(high, cf)

    # Expand upper bound until sign changes.
    for _ in range(80):
        if math.isnan(f_low) or math.isnan(f_high):
            break
        if f_low == 0.0:
            return XirrResult(value=Decimal(str(low)), reason=None)
        if f_high == 0.0:
            return XirrResult(value=Decimal(str(high)), reason=None)
        if f_low * f_high < 0:
            break
        high = high * 2.0 + 0.5
        if high > 1_000_000:
            break
        f_high = _xnpv(high, cf)

    if not (f_low * f_high < 0):
        return XirrResult(value=None, reason="unable_to_bracket_root")

    # Hybrid Newton with bisection fallback.
    x = 0.1 if low < 0.1 < high else (low + high) / 2.0
    for _ in range(120):
        f_x = _xnpv(x, cf)
        if abs(f_x) < 1e-12:
            return XirrResult(value=Decimal(str(x)), reason=None)

        fp_x = _xnpv_prime(x, cf)
        use_newton = fp_x not in (0.0, math.inf, -math.inf) and not math.isnan(fp_x)
        x_new = x - (f_x / fp_x) if use_newton else (low + high) / 2.0

        if not (low < x_new < high) or math.isnan(x_new) or math.isinf(x_new):
            x_new = (low + high) / 2.0

        f_new = _xnpv(x_new, cf)
        if f_low * f_new <= 0:
            high = x_new
            f_high = f_new
        else:
            low = x_new
            f_low = f_new

        x = x_new
        if abs(high - low) < 1e-13:
            return XirrResult(value=Decimal(str((high + low) / 2.0)), reason=None)

    return XirrResult(value=Decimal(str(x)), reason="max_iterations_reached")


# ---------------------------------------------------------------------------
# Input hashing + assumptions
# ---------------------------------------------------------------------------


def _normalize_for_json(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _normalize_for_json(v) for k, v in sorted(value.items(), key=lambda i: i[0])}
    if isinstance(value, list):
        return [_normalize_for_json(v) for v in value]
    return value


def build_run_hash(
    *,
    assumptions: dict[str, Any],
    events: list[CashflowEventInput],
    tiers: list[TierInput],
    engine_version: str = ENGINE_VERSION,
) -> str:
    """Deterministic hash over scenario assumptions, events, tiers, and engine version."""

    payload = {
        "engine_version": engine_version,
        "assumptions": _normalize_for_json(assumptions),
        "events": _normalize_for_json(
            [
                {
                    "date": e.date,
                    "event_type": e.event_type,
                    "amount": _q_money(e.amount),
                    "metadata": e.metadata,
                }
                for e in sorted(events, key=lambda x: (x.date, x.event_type, x.amount))
            ]
        ),
        "tiers": _normalize_for_json(
            [
                {
                    "tier_order": t.tier_order,
                    "tier_type": t.tier_type,
                    "hurdle_irr": t.hurdle_irr,
                    "hurdle_multiple": t.hurdle_multiple,
                    "pref_rate": t.pref_rate,
                    "catch_up_pct": t.catch_up_pct,
                    "split_lp": t.split_lp,
                    "split_gp": t.split_gp,
                    "notes": t.notes,
                }
                for t in sorted(tiers, key=lambda x: (x.tier_order, x.id))
            ]
        ),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=_normalize_for_json)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _assumption_num(assumptions: dict[str, Any], key: str) -> Decimal | None:
    value = assumptions.get(key)
    if value is None:
        return None
    if isinstance(value, dict):
        # DB row shape from scenario_assumption may pass nested dict.
        if value.get("value_num") is not None:
            return _to_decimal(value.get("value_num"))
        return None
    return _to_decimal(value)


def _assumption_text(assumptions: dict[str, Any], key: str) -> str | None:
    value = assumptions.get(key)
    if value is None:
        return None
    if isinstance(value, dict):
        if value.get("value_text") is not None:
            return str(value.get("value_text"))
        if value.get("value_json") is not None:
            return str(value.get("value_json"))
        return None
    return str(value)


def _apply_assumptions_to_events(
    *,
    events: list[CashflowEventInput],
    assumptions: dict[str, Any],
    as_of_date: date | None,
) -> tuple[list[CashflowEventInput], list[str]]:
    """Generate synthetic events from scenario assumptions when missing."""

    out = list(events)
    notes: list[str] = []

    exit_date = _as_date(_assumption_text(assumptions, "exit_date"))
    sale_price = _assumption_num(assumptions, "sale_price")
    exit_cap_rate = _assumption_num(assumptions, "exit_cap_rate")
    noi_growth = _assumption_num(assumptions, "noi_growth") or DECIMAL_ZERO
    disposition_fee = _assumption_num(assumptions, "disposition_fee") or DECIMAL_ZERO

    # Refinance proceeds assumption.
    refinance_date = _as_date(_assumption_text(assumptions, "refinance_date"))
    refinance_proceeds = _assumption_num(assumptions, "refinance_proceeds")
    if refinance_date and refinance_proceeds and refinance_proceeds != DECIMAL_ZERO:
        has_refi = any(e.event_type == "refinance_proceeds" and e.date == refinance_date for e in out)
        if not has_refi:
            out.append(
                CashflowEventInput(
                    date=refinance_date,
                    event_type="refinance_proceeds",
                    amount=_q_money(refinance_proceeds),
                    metadata={
                        "generated": True,
                        "source_assumption": "refinance_proceeds",
                    },
                )
            )
            notes.append("generated_refinance_proceeds")

    # Generate sale proceeds event if missing.
    has_sale = any(e.event_type == "sale_proceeds" for e in out)
    if not has_sale:
        if sale_price is None and exit_cap_rate and exit_cap_rate > DECIMAL_ZERO:
            # Derive sale price from stabilized NOI and cap rate.
            noi_events = sorted((e for e in out if e.event_type == "operating_cf"), key=lambda e: e.date)
            if noi_events:
                if exit_date is None:
                    exit_date = noi_events[-1].date
                trailing = [e for e in noi_events if e.date <= exit_date][-12:]
                base_monthly_noi = (
                    sum((e.amount for e in trailing), DECIMAL_ZERO) / Decimal(len(trailing))
                    if trailing
                    else noi_events[-1].amount
                )
                annual_noi = base_monthly_noi * Decimal("12")

                last_noi_date = trailing[-1].date if trailing else noi_events[-1].date
                year_factor = Decimal((exit_date - last_noi_date).days) / Decimal("365")
                growth_multiplier = (Decimal("1") + noi_growth) ** year_factor
                stabilized_noi = annual_noi * growth_multiplier
                sale_price = stabilized_noi / exit_cap_rate
                notes.append("derived_sale_price_from_exit_cap_rate")

        if exit_date and sale_price and sale_price > DECIMAL_ZERO:
            net_sale = sale_price * (Decimal("1") - disposition_fee)
            out.append(
                CashflowEventInput(
                    date=exit_date,
                    event_type="sale_proceeds",
                    amount=_q_money(net_sale),
                    metadata={
                        "generated": True,
                        "source_assumption": "sale_price",
                        "gross_sale_price": format(_q_money(sale_price), "f"),
                        "disposition_fee_rate": format(disposition_fee, "f"),
                    },
                )
            )
            notes.append("generated_sale_proceeds")

    # Optional management fee generation when assumption exists and no fee events exist.
    fee_rate_or_amount = _assumption_num(assumptions, "asset_mgmt_fee") or _assumption_num(assumptions, "mgmt_fee")
    if fee_rate_or_amount and fee_rate_or_amount > DECIMAL_ZERO:
        has_fee = any(e.event_type == "fee" for e in out)
        if not has_fee:
            anchor_dates = sorted([e.date for e in out])
            if anchor_dates:
                start = as_of_date or anchor_dates[0]
                end = exit_date or anchor_dates[-1]
                if end >= start:
                    quarterly_fee = fee_rate_or_amount / Decimal("4") if fee_rate_or_amount > Decimal("1") else fee_rate_or_amount
                    q_date = date(start.year, start.month, 1)
                    # Move to quarter boundary month.
                    quarter_month = ((q_date.month - 1) // 3) * 3 + 1
                    q_date = date(q_date.year, quarter_month, 1)
                    while q_date <= end:
                        out.append(
                            CashflowEventInput(
                                date=q_date,
                                event_type="fee",
                                amount=_q_money(-quarterly_fee),
                                metadata={
                                    "generated": True,
                                    "source_assumption": "asset_mgmt_fee",
                                },
                            )
                        )
                        # Advance one quarter.
                        year = q_date.year + (q_date.month + 2) // 12
                        month = ((q_date.month + 2) % 12) + 1
                        q_date = date(year, month, 1)
                    notes.append("generated_asset_management_fees")

    out.sort(key=lambda e: (e.date, e.event_type, e.amount))
    return out, notes


# ---------------------------------------------------------------------------
# Allocation helpers
# ---------------------------------------------------------------------------


def _normalize_weights(pairs: list[tuple[str, Decimal]]) -> list[tuple[str, Decimal]]:
    valid = [(k, w) for k, w in pairs if w > DECIMAL_ZERO]
    if not valid:
        return []
    total = sum((w for _, w in valid), DECIMAL_ZERO)
    if total <= DECIMAL_ZERO:
        return []
    return [(k, w / total) for k, w in sorted(valid, key=lambda x: x[0])]


def _allocate_pro_rata(
    total_amount: Decimal,
    weights: list[tuple[str, Decimal]],
) -> dict[str, Decimal]:
    if total_amount <= DECIMAL_ZERO or not weights:
        return {}

    ordered = sorted(weights, key=lambda x: x[0])
    out: dict[str, Decimal] = {}
    running = DECIMAL_ZERO
    for idx, (entity_id, weight) in enumerate(ordered):
        if idx == len(ordered) - 1:
            amount = _q_money(total_amount - running)
        else:
            amount = _q_money(total_amount * weight)
            running += amount
        out[entity_id] = max(amount, DECIMAL_ZERO)

    # Final tiny reconciliation for quantization drift.
    allocated = sum(out.values(), DECIMAL_ZERO)
    drift = _q_money(total_amount - allocated)
    if drift != DECIMAL_ZERO and ordered:
        first_id = ordered[0][0]
        out[first_id] = _q_money(out[first_id] + drift)
    return out


def _bucket_date(d: date, frequency: str) -> date:
    if frequency == "quarterly":
        q_month = ((d.month - 1) // 3) * 3 + 1
        return date(d.year, q_month, 1)
    return date(d.year, d.month, 1)


def _group_cashflows(flows: list[tuple[date, Decimal]]) -> list[tuple[date, Decimal]]:
    grouped: dict[date, Decimal] = {}
    for d, amount in flows:
        grouped[d] = grouped.get(d, DECIMAL_ZERO) + amount
    return sorted([(d, _q_money(a)) for d, a in grouped.items()], key=lambda x: x[0])


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


def run_waterfall_engine(
    *,
    partners: list[dict[str, Any]],
    tiers: list[dict[str, Any]],
    events: list[dict[str, Any]],
    assumptions: dict[str, Any],
    distribution_frequency: str,
    promote_structure_type: str,
) -> WaterfallRunResult:
    """Run deterministic waterfall model and return auditable outputs."""

    partner_inputs: list[PartnerInput] = [
        PartnerInput(
            id=str(p["id"]),
            name=str(p.get("name", "")),
            role=str(p.get("role", "JV_PARTNER")),
            has_promote=bool(p.get("has_promote", False)),
            commitment_amount=_to_decimal(p.get("commitment_amount")),
            ownership_pct=_to_decimal(p.get("ownership_pct")),
        )
        for p in partners
    ]

    tier_inputs: list[TierInput] = [
        TierInput(
            id=str(t["id"]),
            tier_order=int(t.get("tier_order", 0)),
            tier_type=str(t.get("tier_type", "split")),
            hurdle_irr=_to_decimal(t.get("hurdle_irr")) if t.get("hurdle_irr") is not None else None,
            hurdle_multiple=_to_decimal(t.get("hurdle_multiple")) if t.get("hurdle_multiple") is not None else None,
            pref_rate=_to_decimal(t.get("pref_rate")) if t.get("pref_rate") is not None else None,
            catch_up_pct=_to_decimal(t.get("catch_up_pct")) if t.get("catch_up_pct") is not None else None,
            split_lp=_to_decimal(t.get("split_lp")) if t.get("split_lp") is not None else None,
            split_gp=_to_decimal(t.get("split_gp")) if t.get("split_gp") is not None else None,
            notes=t.get("notes"),
        )
        for t in tiers
    ]
    tier_inputs.sort(key=lambda t: (t.tier_order, t.id))

    event_inputs: list[CashflowEventInput] = [
        CashflowEventInput(
            date=_as_date(e.get("date")) or date.today(),
            event_type=str(e.get("event_type", "operating_cf")),
            amount=_to_decimal(e.get("amount")),
            metadata=dict(e.get("metadata") or {}),
        )
        for e in events
    ]

    raw_event_inputs = list(event_inputs)
    run_hash = build_run_hash(
        assumptions=assumptions,
        events=raw_event_inputs,
        tiers=tier_inputs,
        engine_version=ENGINE_VERSION,
    )

    as_of_date = _as_date(_assumption_text(assumptions, "as_of_date"))
    event_inputs, assumption_generation_notes = _apply_assumptions_to_events(
        events=event_inputs,
        assumptions=assumptions,
        as_of_date=as_of_date,
    )

    partner_states: dict[str, PartnerState] = {p.id: PartnerState() for p in partner_inputs}
    partner_cashflows: dict[str, list[tuple[date, Decimal]]] = {p.id: [] for p in partner_inputs}

    lp_ids = [p.id for p in partner_inputs if p.role == "LP"]
    gp_ids = [p.id for p in partner_inputs if p.role == "GP" or p.has_promote]
    if not gp_ids:
        gp_ids = [p.id for p in partner_inputs if p.role != "LP"]

    ownership_pairs = [(p.id, p.ownership_pct if p.ownership_pct > DECIMAL_ZERO else DECIMAL_ZERO) for p in partner_inputs]
    # Fallback to equal split if ownerships are not populated.
    if sum((w for _, w in ownership_pairs), DECIMAL_ZERO) <= DECIMAL_ZERO and partner_inputs:
        ownership_pairs = [(p.id, Decimal("1")) for p in partner_inputs]

    lp_weights = _normalize_weights([(pid, w) for pid, w in ownership_pairs if pid in lp_ids])
    gp_promote_weights = _normalize_weights(
        [
            (p.id, p.ownership_pct if p.ownership_pct > DECIMAL_ZERO else Decimal("1"))
            for p in partner_inputs
            if p.id in gp_ids and (p.has_promote or p.role == "GP")
        ]
    )
    if not gp_promote_weights:
        gp_promote_weights = _normalize_weights([(pid, w) for pid, w in ownership_pairs if pid in gp_ids])

    contribution_weights = _normalize_weights(
        [
            (
                p.id,
                p.commitment_amount if p.commitment_amount > DECIMAL_ZERO else p.ownership_pct,
            )
            for p in partner_inputs
        ]
    )

    if not contribution_weights:
        contribution_weights = _normalize_weights([(pid, w) for pid, w in ownership_pairs])

    pref_rate = DECIMAL_ZERO
    for tier in tier_inputs:
        if tier.tier_type == "preferred_return" and tier.pref_rate is not None:
            pref_rate = tier.pref_rate
            break

    # Aggregate events to timeline buckets.
    timeline: dict[date, dict[str, Any]] = {}
    for e in event_inputs:
        bdate = _bucket_date(e.date, distribution_frequency)
        bucket = timeline.setdefault(
            bdate,
            {
                "date": bdate,
                "total": DECIMAL_ZERO,
                "by_type": {},
                "source_events": [],
            },
        )
        bucket["total"] += e.amount
        bucket["by_type"][e.event_type] = bucket["by_type"].get(e.event_type, DECIMAL_ZERO) + e.amount
        bucket["source_events"].append(e)

    sorted_buckets = [timeline[d] for d in sorted(timeline.keys())]

    if promote_structure_type != "american":
        assumption_generation_notes.append("european_promote_requested_but_american_behavior_used")

    distributions: list[dict[str, Any]] = []
    tier_ledger: list[dict[str, Any]] = []
    cumulative_tier_lp: dict[str, Decimal] = {t.id: DECIMAL_ZERO for t in tier_inputs}
    cumulative_tier_gp: dict[str, Decimal] = {t.id: DECIMAL_ZERO for t in tier_inputs}

    last_period_date: date | None = None

    def _lp_total_pref_due() -> Decimal:
        return sum((partner_states[pid].unpaid_pref for pid in lp_ids), DECIMAL_ZERO)

    def _total_outstanding_capital(ids: list[str] | None = None) -> Decimal:
        ids = ids if ids is not None else list(partner_states.keys())
        return sum((partner_states[pid].unreturned_capital for pid in ids), DECIMAL_ZERO)

    def _record_distribution(
        *,
        run_date: date,
        tier: TierInput | None,
        distribution_type: str,
        allocations: dict[str, Decimal],
        available_before: Decimal,
        available_after: Decimal,
        notes: dict[str, Any],
    ) -> None:
        nonlocal distributions

        for partner_id, amount in sorted(allocations.items(), key=lambda x: x[0]):
            if amount <= DECIMAL_ZERO:
                continue
            state = partner_states[partner_id]
            state.total_distributed += amount
            if distribution_type != "roc":
                state.profit_distributed += amount
            partner_cashflows[partner_id].append((run_date, amount))

            distributions.append(
                {
                    "date": run_date,
                    "tier_id": tier.id if tier else None,
                    "partner_id": partner_id,
                    "distribution_amount": _q_money(amount),
                    "distribution_type": distribution_type,
                    "lineage_json": {
                        "tier_order": tier.tier_order if tier else None,
                        "tier_type": tier.tier_type if tier else "other",
                        "available_before": format(_q_money(available_before), "f"),
                        "available_after": format(_q_money(available_after), "f"),
                        **notes,
                    },
                }
            )

    def _record_tier_ledger(
        *,
        run_date: date,
        tier: TierInput,
        lp_alloc: Decimal,
        gp_alloc: Decimal,
        note_payload: dict[str, Any],
    ) -> None:
        cumulative_tier_lp[tier.id] = _q_money(cumulative_tier_lp[tier.id] + lp_alloc)
        cumulative_tier_gp[tier.id] = _q_money(cumulative_tier_gp[tier.id] + gp_alloc)

        tier_ledger.append(
            {
                "as_of_date": run_date,
                "tier_id": tier.id,
                "cumulative_lp_distributed": cumulative_tier_lp[tier.id],
                "cumulative_gp_distributed": cumulative_tier_gp[tier.id],
                "notes": note_payload,
            }
        )

    def _accrue_pref(run_date: date) -> None:
        nonlocal last_period_date
        if pref_rate <= DECIMAL_ZERO or not lp_ids:
            return
        if last_period_date is None:
            return
        day_count = max((run_date - last_period_date).days, 0)
        if day_count == 0:
            return

        dc = Decimal(day_count) / Decimal("365")
        for pid in lp_ids:
            outstanding = partner_states[pid].unreturned_capital
            if outstanding <= DECIMAL_ZERO:
                continue
            accrual = _q_money(outstanding * pref_rate * dc)
            if accrual > DECIMAL_ZERO:
                partner_states[pid].unpaid_pref += accrual

    def _allocate_contribution(run_date: date, amount: Decimal) -> None:
        if amount <= DECIMAL_ZERO:
            return
        allocations = _allocate_pro_rata(amount, contribution_weights)
        for pid, alloc in allocations.items():
            partner_states[pid].contributed += alloc
            partner_cashflows[pid].append((run_date, -alloc))

    def _group_cashflows_for_ids(ids: list[str], extra_amount: Decimal = DECIMAL_ZERO, extra_date: date | None = None) -> list[tuple[date, Decimal]]:
        merged: list[tuple[date, Decimal]] = []
        for pid in ids:
            merged.extend(partner_cashflows[pid])
        if extra_amount != DECIMAL_ZERO and extra_date is not None:
            merged.append((extra_date, extra_amount))
        return _group_cashflows(merged)

    def _gp_target_share_for_catchup(idx: int, tier: TierInput) -> Decimal:
        if tier.split_gp is not None and tier.split_gp > DECIMAL_ZERO:
            return tier.split_gp
        for next_tier in tier_inputs[idx + 1 :]:
            if next_tier.tier_type == "split" and next_tier.split_gp is not None:
                return next_tier.split_gp
        return Decimal("0.20")

    for bucket in sorted_buckets:
        run_date = bucket["date"]
        _accrue_pref(run_date)

        explicit_calls = bucket["by_type"].get("capital_call", DECIMAL_ZERO)
        non_call_net = bucket["total"] - explicit_calls

        if explicit_calls < DECIMAL_ZERO:
            # Negative capital calls are modeled as non-call outflows.
            non_call_net += explicit_calls
            explicit_calls = DECIMAL_ZERO

        deficit_after_explicit = non_call_net + explicit_calls
        auto_call = -deficit_after_explicit if deficit_after_explicit < DECIMAL_ZERO else DECIMAL_ZERO
        total_call = _q_money(explicit_calls + auto_call)

        if total_call > DECIMAL_ZERO:
            _allocate_contribution(run_date, total_call)

        # Capital calls fund deficits and are not themselves distributable cash.
        available_cash = _q_money(max(non_call_net, DECIMAL_ZERO))

        if available_cash <= DECIMAL_ZERO:
            last_period_date = run_date
            continue

        for idx, tier in enumerate(tier_inputs):
            if available_cash <= EPS:
                break

            available_before = available_cash
            lp_pref_before = _lp_total_pref_due()
            outstanding_before = _total_outstanding_capital()

            if tier.tier_type == "return_of_capital":
                outstanding_map = {
                    pid: partner_states[pid].unreturned_capital
                    for pid in partner_states.keys()
                    if partner_states[pid].unreturned_capital > DECIMAL_ZERO
                }
                total_outstanding = sum(outstanding_map.values(), DECIMAL_ZERO)
                if total_outstanding <= DECIMAL_ZERO:
                    continue

                pay_amount = min(available_cash, total_outstanding)
                roc_alloc = _allocate_pro_rata(
                    pay_amount,
                    _normalize_weights(list(outstanding_map.items())),
                )
                for pid, alloc in roc_alloc.items():
                    partner_states[pid].returned_capital += alloc

                _record_distribution(
                    run_date=run_date,
                    tier=tier,
                    distribution_type="roc",
                    allocations=roc_alloc,
                    available_before=available_before,
                    available_after=_q_money(available_before - pay_amount),
                    notes={
                        "outstanding_capital_before": format(_q_money(total_outstanding), "f"),
                        "outstanding_capital_after": format(_q_money(total_outstanding - pay_amount), "f"),
                        "unpaid_pref_before": format(_q_money(lp_pref_before), "f"),
                        "unpaid_pref_after": format(_q_money(_lp_total_pref_due()), "f"),
                    },
                )

                lp_alloc = sum((amt for pid, amt in roc_alloc.items() if pid in lp_ids), DECIMAL_ZERO)
                gp_alloc = sum((amt for pid, amt in roc_alloc.items() if pid in gp_ids), DECIMAL_ZERO)
                _record_tier_ledger(
                    run_date=run_date,
                    tier=tier,
                    lp_alloc=lp_alloc,
                    gp_alloc=gp_alloc,
                    note_payload={
                        "tier_type": tier.tier_type,
                        "allocated": format(_q_money(pay_amount), "f"),
                    },
                )
                available_cash = _q_money(available_cash - pay_amount)
                continue

            if tier.tier_type == "preferred_return":
                pref_map = {
                    pid: partner_states[pid].unpaid_pref
                    for pid in lp_ids
                    if partner_states[pid].unpaid_pref > DECIMAL_ZERO
                }
                total_pref_due = sum(pref_map.values(), DECIMAL_ZERO)
                if total_pref_due <= DECIMAL_ZERO:
                    continue

                pay_amount = min(available_cash, total_pref_due)
                pref_alloc = _allocate_pro_rata(
                    pay_amount,
                    _normalize_weights(list(pref_map.items())),
                )
                for pid, alloc in pref_alloc.items():
                    partner_states[pid].unpaid_pref = _q_money(max(partner_states[pid].unpaid_pref - alloc, DECIMAL_ZERO))

                _record_distribution(
                    run_date=run_date,
                    tier=tier,
                    distribution_type="pref",
                    allocations=pref_alloc,
                    available_before=available_before,
                    available_after=_q_money(available_before - pay_amount),
                    notes={
                        "outstanding_capital_before": format(_q_money(outstanding_before), "f"),
                        "outstanding_capital_after": format(_q_money(_total_outstanding_capital()), "f"),
                        "unpaid_pref_before": format(_q_money(total_pref_due), "f"),
                        "unpaid_pref_after": format(_q_money(_lp_total_pref_due()), "f"),
                    },
                )

                _record_tier_ledger(
                    run_date=run_date,
                    tier=tier,
                    lp_alloc=pay_amount,
                    gp_alloc=DECIMAL_ZERO,
                    note_payload={
                        "tier_type": tier.tier_type,
                        "allocated": format(_q_money(pay_amount), "f"),
                    },
                )
                available_cash = _q_money(available_cash - pay_amount)
                continue

            if tier.tier_type == "catch_up":
                gp_split = tier.catch_up_pct if tier.catch_up_pct is not None else Decimal("1")
                gp_split = min(max(gp_split, DECIMAL_ZERO), Decimal("1"))
                target_gp_share = _gp_target_share_for_catchup(idx, tier)

                gp_profit = sum((partner_states[pid].profit_distributed for pid in gp_ids), DECIMAL_ZERO)
                total_profit = sum((s.profit_distributed for s in partner_states.values()), DECIMAL_ZERO)

                current_share = (gp_profit / total_profit) if total_profit > DECIMAL_ZERO else DECIMAL_ZERO
                if current_share >= target_gp_share:
                    continue

                if gp_split <= target_gp_share:
                    cash_needed = available_cash
                else:
                    cash_needed = (target_gp_share * total_profit - gp_profit) / (gp_split - target_gp_share)
                    cash_needed = max(cash_needed, DECIMAL_ZERO)

                pay_amount = min(available_cash, _q_money(cash_needed))
                if pay_amount <= DECIMAL_ZERO:
                    continue

                gp_amount = _q_money(pay_amount * gp_split)
                lp_amount = _q_money(pay_amount - gp_amount)

                gp_alloc = _allocate_pro_rata(gp_amount, gp_promote_weights)
                lp_alloc = _allocate_pro_rata(lp_amount, lp_weights)
                merged_alloc = {**lp_alloc}
                for pid, amount in gp_alloc.items():
                    merged_alloc[pid] = merged_alloc.get(pid, DECIMAL_ZERO) + amount

                _record_distribution(
                    run_date=run_date,
                    tier=tier,
                    distribution_type="catchup",
                    allocations=merged_alloc,
                    available_before=available_before,
                    available_after=_q_money(available_before - pay_amount),
                    notes={
                        "gp_split": format(gp_split, "f"),
                        "target_gp_share": format(target_gp_share, "f"),
                        "current_gp_share_before": format(_q_money(current_share), "f"),
                        "outstanding_capital_before": format(_q_money(outstanding_before), "f"),
                        "outstanding_capital_after": format(_q_money(_total_outstanding_capital()), "f"),
                        "unpaid_pref_before": format(_q_money(lp_pref_before), "f"),
                        "unpaid_pref_after": format(_q_money(_lp_total_pref_due()), "f"),
                    },
                )

                _record_tier_ledger(
                    run_date=run_date,
                    tier=tier,
                    lp_alloc=lp_amount,
                    gp_alloc=gp_amount,
                    note_payload={
                        "tier_type": tier.tier_type,
                        "allocated": format(_q_money(pay_amount), "f"),
                    },
                )
                available_cash = _q_money(available_cash - pay_amount)
                continue

            # split tier
            lp_split = tier.split_lp if tier.split_lp is not None else Decimal("0.8")
            gp_split = tier.split_gp if tier.split_gp is not None else (Decimal("1") - lp_split)
            lp_split = min(max(lp_split, DECIMAL_ZERO), Decimal("1"))
            gp_split = min(max(gp_split, DECIMAL_ZERO), Decimal("1"))

            split_total = lp_split + gp_split
            if split_total <= DECIMAL_ZERO:
                continue

            # Normalize if misconfigured.
            if split_total != Decimal("1"):
                lp_split = lp_split / split_total
                gp_split = gp_split / split_total

            tier_cap = available_cash

            # IRR hurdle cap: this tier is active until LP hurdle is reached.
            if tier.hurdle_irr is not None and lp_split > DECIMAL_ZERO and lp_ids:
                target_irr = tier.hurdle_irr
                lp_flows = _group_cashflows_for_ids(lp_ids)
                current_irr = xirr(lp_flows).value
                if current_irr is not None and current_irr >= target_irr:
                    tier_cap = DECIMAL_ZERO
                else:
                    irr_with_all = xirr(_group_cashflows_for_ids(lp_ids, extra_amount=available_cash * lp_split, extra_date=run_date)).value
                    if irr_with_all is not None and irr_with_all >= target_irr:
                        # Binary search minimum cash to reach hurdle.
                        lo = DECIMAL_ZERO
                        hi = available_cash
                        for _ in range(50):
                            mid = _q_money((lo + hi) / Decimal("2"))
                            trial_irr = xirr(
                                _group_cashflows_for_ids(
                                    lp_ids,
                                    extra_amount=mid * lp_split,
                                    extra_date=run_date,
                                )
                            ).value
                            if trial_irr is not None and trial_irr >= target_irr:
                                hi = mid
                            else:
                                lo = mid
                            if abs(hi - lo) <= MONEY_QUANT:
                                break
                        tier_cap = min(tier_cap, hi)

            # Multiple hurdle cap.
            if tier.hurdle_multiple is not None and lp_split > DECIMAL_ZERO and lp_ids:
                lp_flows = _group_cashflows_for_ids(lp_ids)
                lp_contrib = sum((-a for _, a in lp_flows if a < DECIMAL_ZERO), DECIMAL_ZERO)
                lp_dist = sum((a for _, a in lp_flows if a > DECIMAL_ZERO), DECIMAL_ZERO)
                if lp_contrib > DECIMAL_ZERO:
                    needed_lp = tier.hurdle_multiple * lp_contrib - lp_dist
                    if needed_lp <= DECIMAL_ZERO:
                        tier_cap = DECIMAL_ZERO
                    else:
                        tier_cap = min(tier_cap, _q_money(needed_lp / lp_split))

            pay_amount = min(available_cash, max(tier_cap, DECIMAL_ZERO))
            if pay_amount <= DECIMAL_ZERO:
                continue

            lp_amount = _q_money(pay_amount * lp_split)
            gp_amount = _q_money(pay_amount - lp_amount)

            lp_alloc = _allocate_pro_rata(lp_amount, lp_weights)
            gp_alloc = _allocate_pro_rata(gp_amount, gp_promote_weights)

            merged_alloc = {**lp_alloc}
            for pid, amount in gp_alloc.items():
                merged_alloc[pid] = merged_alloc.get(pid, DECIMAL_ZERO) + amount

            _record_distribution(
                run_date=run_date,
                tier=tier,
                distribution_type="split",
                allocations=merged_alloc,
                available_before=available_before,
                available_after=_q_money(available_before - pay_amount),
                notes={
                    "lp_split": format(lp_split, "f"),
                    "gp_split": format(gp_split, "f"),
                    "hurdle_irr": format(tier.hurdle_irr, "f") if tier.hurdle_irr is not None else None,
                    "hurdle_multiple": format(tier.hurdle_multiple, "f") if tier.hurdle_multiple is not None else None,
                    "outstanding_capital_before": format(_q_money(outstanding_before), "f"),
                    "outstanding_capital_after": format(_q_money(_total_outstanding_capital()), "f"),
                    "unpaid_pref_before": format(_q_money(lp_pref_before), "f"),
                    "unpaid_pref_after": format(_q_money(_lp_total_pref_due()), "f"),
                },
            )

            _record_tier_ledger(
                run_date=run_date,
                tier=tier,
                lp_alloc=lp_amount,
                gp_alloc=gp_amount,
                note_payload={
                    "tier_type": tier.tier_type,
                    "allocated": format(_q_money(pay_amount), "f"),
                },
            )
            available_cash = _q_money(available_cash - pay_amount)

        # Any residual after explicit tiers goes pro-rata ownership as "other".
        if available_cash > EPS:
            fallback_weights = _normalize_weights(ownership_pairs)
            fallback_alloc = _allocate_pro_rata(available_cash, fallback_weights)
            _record_distribution(
                run_date=run_date,
                tier=None,
                distribution_type="other",
                allocations=fallback_alloc,
                available_before=available_cash,
                available_after=DECIMAL_ZERO,
                notes={
                    "reason": "residual_cash_after_tiers",
                },
            )
            available_cash = DECIMAL_ZERO

        last_period_date = run_date

    # ------------------------------------------------------------------
    # Summary metrics
    # ------------------------------------------------------------------

    def _partner_totals(ids: list[str]) -> tuple[Decimal, Decimal, list[tuple[date, Decimal]]]:
        flows = _group_cashflows_for_ids(ids)
        contrib = sum((-a for _, a in flows if a < DECIMAL_ZERO), DECIMAL_ZERO)
        dist = sum((a for _, a in flows if a > DECIMAL_ZERO), DECIMAL_ZERO)
        return contrib, dist, flows

    lp_contrib, lp_dist, lp_flows = _partner_totals(lp_ids)
    gp_contrib, gp_dist, gp_flows = _partner_totals(gp_ids)
    all_ids = [p.id for p in partner_inputs]
    all_contrib, all_dist, _all_flows = _partner_totals(all_ids)

    lp_irr_res = xirr(lp_flows)
    gp_irr_res = xirr(gp_flows)

    total_promote = sum((partner_states[pid].profit_distributed for pid in gp_ids), DECIMAL_ZERO)

    metrics: dict[str, Decimal] = {
        "lp_irr": _q_money(lp_irr_res.value) if lp_irr_res.value is not None else DECIMAL_ZERO,
        "gp_irr": _q_money(gp_irr_res.value) if gp_irr_res.value is not None else DECIMAL_ZERO,
        "lp_em": _q_money(lp_dist / lp_contrib) if lp_contrib > DECIMAL_ZERO else DECIMAL_ZERO,
        "gp_em": _q_money(gp_dist / gp_contrib) if gp_contrib > DECIMAL_ZERO else DECIMAL_ZERO,
        "total_promote": _q_money(total_promote),
        "gp_promote": _q_money(total_promote),
        "dpi": _q_money(lp_dist / lp_contrib) if lp_contrib > DECIMAL_ZERO else DECIMAL_ZERO,
        "tvpi": _q_money(lp_dist / lp_contrib) if lp_contrib > DECIMAL_ZERO else DECIMAL_ZERO,
        "moic": _q_money(all_dist / all_contrib) if all_contrib > DECIMAL_ZERO else DECIMAL_ZERO,
    }

    distributable_cash = sum(
        (
            max(
                bucket["total"] - bucket["by_type"].get("capital_call", DECIMAL_ZERO),
                DECIMAL_ZERO,
            )
            for bucket in sorted_buckets
        ),
        DECIMAL_ZERO,
    )
    distributed_cash = sum((d["distribution_amount"] for d in distributions), DECIMAL_ZERO)

    summary_meta = {
        "lp_irr_reason": lp_irr_res.reason,
        "gp_irr_reason": gp_irr_res.reason,
        "generated_event_notes": assumption_generation_notes,
        "promote_structure_effective": "american",
        "total_distributable_cash": format(_q_money(distributable_cash), "f"),
        "total_distributed_cash": format(_q_money(distributed_cash), "f"),
    }

    return WaterfallRunResult(
        engine_version=ENGINE_VERSION,
        run_hash=run_hash,
        summary_metrics=metrics,
        summary_meta=summary_meta,
        distributions=distributions,
        tier_ledger=tier_ledger,
    )
