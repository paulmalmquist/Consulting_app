"""Phase 5 — Fund waterfall layer.

Consumes ``fund_pre_waterfall_net_cf`` (Phase 4 output) and runs the fund's
waterfall contract against each distributable event, accumulating LP/GP cash
streams from inception through as_of. Produces the net-side metrics the
gross-to-net bridge depends on:

  * net_irr  (XIRR of LP cash stream + ending NAV)
  * net_tvpi (LP-side total value over LP-side called)
  * dpi      (LP distributions / LP called)
  * rvpi     (LP-share of ending NAV / LP called)
  * carry    (sum of GP allocations across events)
  * gp_share / lp_share (totals)
  * gross_net_spread_bps (gross IRR − net IRR)

Fail-closed contract:
  * Missing waterfall definition → ``waterfall_status='missing_contract'``,
    all net metrics null.
  * Missing partner commitments  → ``waterfall_status='missing_participants'``.
  * Missing fee_policy upstream  → propagated from FundExpenseSchedule
    (handled by caller before waterfall is invoked).
  * Empty distributable events   → ``waterfall_status='no_distributions'``,
    net metrics computed from LP-side outflows only (LP IRR with no
    distributions is structurally negative and labeled as such).

Sign-handling invariants:
  * run_us_waterfall is invoked ONLY with positive distribution amounts.
  * Negative pre-waterfall events (calls + expenses) are added to the LP
    cash stream as outflows but never passed to the allocator.
  * Sum of allocations per event equals the distribution amount within 1¢.
  * No allocation line carries a negative amount.

Per-distribution crystallization:
  Each distribution event is allocated against the participant state that
  exists at the moment of distribution: commitment, unreturned_capital
  reduced by prior distributions, pref_due accrued from prior contribution
  dates. ``gp_profit_paid_to_date`` and ``lp_profit_paid_to_date`` carry
  forward across events to support American (deal-by-deal) waterfalls.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Iterable, Literal
from uuid import UUID

from app.db import get_cursor
from app.finance.utils import qmoney
from app.finance.waterfall_engine import (
    AllocationLine,
    ParticipantState,
    WaterfallContract,
    WaterfallInput,
    run_us_waterfall,
)
from app.finance.irr_engine import xirr
from app.services.bottom_up_cashflow import CFPoint


WaterfallStatus = Literal[
    "computed",
    "missing_contract",
    "missing_participants",
    "missing_partner_commitments",
    "no_distributions",
    "no_lp_calls",
    "computation_error",
]

DEFAULT_PREF_RATE = Decimal("0.08")
DEFAULT_CARRY_RATE = Decimal("0.20")
DEFAULT_CATCHUP_RATE = Decimal("1.0")


@dataclass(frozen=False)
class WaterfallEventLog:
    """One distribution event after allocation, with full per-line provenance."""

    event_date: date
    quarter: str
    distribution_amount: Decimal
    allocations: list[dict[str, Any]]
    lp_share: Decimal
    gp_share: Decimal
    carry_share: Decimal  # subset of gp_share that is tier-4 carry only
    pref_share: Decimal
    return_of_capital: Decimal
    catch_up: Decimal
    conservation_diff: Decimal  # |sum(allocations) - distribution|

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_date": self.event_date.isoformat(),
            "quarter": self.quarter,
            "distribution_amount": float(self.distribution_amount),
            "lp_share": float(self.lp_share),
            "gp_share": float(self.gp_share),
            "carry_share": float(self.carry_share),
            "pref_share": float(self.pref_share),
            "return_of_capital": float(self.return_of_capital),
            "catch_up": float(self.catch_up),
            "conservation_diff": float(self.conservation_diff),
            "allocations": self.allocations,
        }


@dataclass
class FundWaterfallResult:
    fund_id: UUID
    as_of_quarter: str
    waterfall_status: WaterfallStatus
    pre_waterfall_net_cf_hash: str

    # Top-line net metrics (None when not computable)
    net_irr: Decimal | None
    net_tvpi: Decimal | None
    dpi: Decimal | None
    rvpi: Decimal | None
    carry: Decimal | None
    gp_share: Decimal | None
    lp_share: Decimal | None
    pref_distributed: Decimal | None
    return_of_capital_distributed: Decimal | None
    catch_up_distributed: Decimal | None
    gross_net_spread_bps: int | None

    # Stream reconstructions
    lp_called: Decimal | None
    lp_distributions: Decimal | None
    lp_ending_nav_share: Decimal | None
    gp_called: Decimal | None
    gp_distributions: Decimal | None
    gp_ending_nav_share: Decimal | None

    # Contract metadata
    waterfall_style: str | None
    pref_rate: Decimal | None
    carry_rate: Decimal | None
    catchup_rate: Decimal | None
    definition_id: str | None
    definition_version: int | None

    # Event log
    event_logs: list[WaterfallEventLog]

    # Diagnostics
    null_reasons: dict[str, str]
    warnings: list[str]
    inputs_hash: str | None

    def to_dict(self) -> dict[str, Any]:
        def _f(v: Decimal | None) -> float | None:
            return float(v) if v is not None else None

        return {
            "fund_id": str(self.fund_id),
            "as_of_quarter": self.as_of_quarter,
            "waterfall_status": self.waterfall_status,
            "pre_waterfall_net_cf_hash": self.pre_waterfall_net_cf_hash,
            "net_irr": _f(self.net_irr),
            "net_tvpi": _f(self.net_tvpi),
            "dpi": _f(self.dpi),
            "rvpi": _f(self.rvpi),
            "carry": _f(self.carry),
            "gp_share": _f(self.gp_share),
            "lp_share": _f(self.lp_share),
            "pref_distributed": _f(self.pref_distributed),
            "return_of_capital_distributed": _f(self.return_of_capital_distributed),
            "catch_up_distributed": _f(self.catch_up_distributed),
            "gross_net_spread_bps": self.gross_net_spread_bps,
            "lp_called": _f(self.lp_called),
            "lp_distributions": _f(self.lp_distributions),
            "lp_ending_nav_share": _f(self.lp_ending_nav_share),
            "gp_called": _f(self.gp_called),
            "gp_distributions": _f(self.gp_distributions),
            "gp_ending_nav_share": _f(self.gp_ending_nav_share),
            "waterfall_style": self.waterfall_style,
            "pref_rate": _f(self.pref_rate),
            "carry_rate": _f(self.carry_rate),
            "catchup_rate": _f(self.catchup_rate),
            "definition_id": self.definition_id,
            "definition_version": self.definition_version,
            "null_reasons": dict(self.null_reasons),
            "warnings": list(self.warnings),
            "inputs_hash": self.inputs_hash,
            "event_logs": [ev.to_dict() for ev in self.event_logs],
        }


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


def _load_definition_and_tiers(cur, fund_id: UUID, definition_id: UUID | None):
    if definition_id:
        cur.execute(
            "SELECT * FROM re_waterfall_definition WHERE definition_id = %s",
            (str(definition_id),),
        )
    else:
        cur.execute(
            """
            SELECT * FROM re_waterfall_definition
            WHERE fund_id = %s AND is_active = true
            ORDER BY version DESC LIMIT 1
            """,
            (str(fund_id),),
        )
    defn = cur.fetchone()
    if not defn:
        return None, []
    cur.execute(
        """
        SELECT * FROM re_waterfall_tier
        WHERE definition_id = %s
        ORDER BY tier_order
        """,
        (str(defn["definition_id"]),),
    )
    return defn, cur.fetchall()


def _build_contract(defn, tiers) -> WaterfallContract:
    pref_rate = DEFAULT_PREF_RATE
    carry_rate = DEFAULT_CARRY_RATE
    catchup_rate = DEFAULT_CATCHUP_RATE
    for t in tiers:
        ttype = (t.get("tier_type") or "").lower()
        if ttype in ("preferred_return", "pref") and t.get("hurdle_rate") is not None:
            pref_rate = Decimal(str(t["hurdle_rate"]))
        if ttype in ("split", "promote", "carry") and t.get("split_gp") is not None:
            carry_rate = Decimal(str(t["split_gp"]))
        if ttype in ("catch_up", "catchup") and t.get("catch_up_percent") is not None:
            catchup_rate = Decimal(str(t["catch_up_percent"]))
    return WaterfallContract(
        pref_rate=pref_rate,
        pref_is_compound=False,
        carry_rate=carry_rate,
        catchup_rate=catchup_rate,
        style=(defn.get("waterfall_type") or "american").lower(),
    )


def _load_partners_with_state(cur, fund_id: UUID) -> list[dict[str, Any]]:
    """Load every partner with a commitment plus running totals from the ledger."""
    cur.execute(
        """
        SELECT p.partner_id, p.name, p.partner_type, pc.committed_amount, pc.commitment_date
        FROM re_partner p
        JOIN re_partner_commitment pc ON pc.partner_id = p.partner_id
        WHERE pc.fund_id = %s AND pc.status = 'active'
        ORDER BY p.partner_type, p.name
        """,
        (str(fund_id),),
    )
    return cur.fetchall() or []


def _ledger_balances_through(
    cur, fund_id: UUID, partner_id: UUID, through_date: date
) -> tuple[Decimal, Decimal]:
    """Return (contributed, distributed) for one partner through ``through_date``."""
    cur.execute(
        """
        SELECT
          COALESCE(SUM(CASE WHEN entry_type = 'contribution' THEN amount_base ELSE 0 END), 0) AS c,
          COALESCE(SUM(CASE WHEN entry_type = 'distribution' THEN amount_base ELSE 0 END), 0) AS d
        FROM re_capital_ledger_entry
        WHERE fund_id = %s AND partner_id = %s AND effective_date <= %s
        """,
        (str(fund_id), str(partner_id), through_date),
    )
    row = cur.fetchone() or {"c": 0, "d": 0}
    return Decimal(str(row["c"])), Decimal(str(row["d"]))


# ---------------------------------------------------------------------------
# Per-event allocation
# ---------------------------------------------------------------------------


def _allocate_event(
    contract: WaterfallContract,
    partners: list[dict[str, Any]],
    contributed_by_partner: dict[str, Decimal],
    distributed_by_partner: dict[str, Decimal],
    pref_due_by_partner: dict[str, Decimal],
    event_date: date,
    distribution_amount: Decimal,
    gp_profit_paid_to_date: Decimal,
    lp_profit_paid_to_date: Decimal,
) -> tuple[list[AllocationLine], dict[str, Decimal]]:
    """Run a single distribution through the waterfall.

    Returns ``(lines, per_partner_total)`` where per_partner_total is the
    aggregate amount each partner_id received from this event (used to
    update unreturned capital and ledger-distributed totals).
    """
    participants = []
    for p in partners:
        pid = str(p["partner_id"])
        contributed = contributed_by_partner.get(pid, Decimal("0"))
        distributed = distributed_by_partner.get(pid, Decimal("0"))
        unreturned = max(contributed - distributed, Decimal("0"))
        pref_due = pref_due_by_partner.get(pid, Decimal("0"))
        role = "lp" if (p["partner_type"] or "").lower() in ("lp", "co_invest") else "gp"
        participants.append(
            ParticipantState(
                participant_id=pid,
                role=role,
                commitment_amount=Decimal(str(p["committed_amount"])),
                unreturned_capital=unreturned,
                pref_due=pref_due,
            )
        )

    lines = run_us_waterfall(
        contract,
        WaterfallInput(
            as_of_date=event_date,
            distribution_amount=distribution_amount,
            gp_profit_paid_to_date=gp_profit_paid_to_date,
            lp_profit_paid_to_date=lp_profit_paid_to_date,
            participants=tuple(participants),
        ),
    )

    per_partner: dict[str, Decimal] = {}
    for ln in lines:
        per_partner[ln.participant_id] = (
            per_partner.get(ln.participant_id, Decimal("0")) + ln.amount
        )

    return lines, per_partner


def _accrue_pref_through(
    *,
    contract: WaterfallContract,
    contribution_history: list[tuple[date, Decimal]],
    distribution_history: list[tuple[date, Decimal]],
    through_date: date,
) -> Decimal:
    """Simple pref accrual on net unreturned capital, day-count actual/365.

    For each contribution date, the partner accrues pref_rate on the
    unreturned principal until either repaid by a distribution (FIFO) or
    until ``through_date``. Since the engine treats pref as ``pref_due``
    (a stock measure at event time), we approximate by computing total
    accrued pref, then subtracting all prior pref-tier payouts from
    distribution_history-as-pref_payments. For now we treat distributions
    as fully reducing unreturned capital first (return-of-capital in tier 1)
    and then pref. The engine's tier 2 reads pref_due at event time.

    This implementation accrues pref from the first contribution date through
    ``through_date``, on the running net unreturned balance, using simple
    interest. Compound pref is left as an extension (contract.pref_is_compound).
    """
    if not contribution_history:
        return Decimal("0")

    # Build a sorted timeline of all contributions and distributions
    events: list[tuple[date, str, Decimal]] = []
    for d, amt in contribution_history:
        events.append((d, "contrib", amt))
    for d, amt in distribution_history:
        events.append((d, "dist", amt))
    events.sort(key=lambda x: (x[0], 0 if x[1] == "contrib" else 1))

    # Walk events; track unreturned balance and accrue pref between events.
    unreturned = Decimal("0")
    accrued = Decimal("0")
    last_t = events[0][0]
    rate = contract.pref_rate
    if rate is None or rate <= 0:
        return Decimal("0")

    for d, kind, amt in events:
        days = (d - last_t).days
        if days > 0 and unreturned > 0:
            accrued += unreturned * rate * Decimal(days) / Decimal("365")
        last_t = d
        if kind == "contrib":
            unreturned += amt
        else:
            # Distributions reduce unreturned first (return of capital), then pref.
            roc = min(unreturned, amt)
            unreturned -= roc
            remainder = amt - roc
            # Prior accrued pref absorbs the remainder.
            accrued = max(accrued - remainder, Decimal("0"))

    # Accrue from last event to through_date
    days = (through_date - last_t).days
    if days > 0 and unreturned > 0:
        accrued += unreturned * rate * Decimal(days) / Decimal("365")

    return qmoney(accrued)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_fund_waterfall_layer(
    fund_id: UUID,
    as_of_quarter: str,
    *,
    pre_waterfall_cf: list[CFPoint],
    fund_gross_irr: Decimal | None = None,
    ending_nav: Decimal | None = None,
    expense_null_reasons: dict[str, str] | None = None,
    definition_id: UUID | None = None,
) -> FundWaterfallResult:
    """Run the fund's waterfall against pre_waterfall_cf and produce LP/GP net.

    ``pre_waterfall_cf`` is the merged stream of fund_gross_cf + fund_expense_cf
    from Phase 4. This function:
      1. Loads the active waterfall definition (or fails closed).
      2. Loads partners + commitments (or fails closed).
      3. Walks pre_waterfall_cf event-by-event, treating positive amounts as
         distributable events and negative amounts as LP-side outflows
         (capital calls and expense outflows).
      4. For each distribution event, accrues pref-due per partner from the
         ledger history through that date, then runs the waterfall.
      5. Tracks per-partner contributed/distributed across events to feed
         the next event's unreturned_capital.
      6. Reconstructs LP and GP cash streams; computes net IRR via XIRR
         and TVPI/DPI/RVPI from totals.
      7. Returns a FundWaterfallResult with full event-level provenance.
    """
    null_reasons: dict[str, str] = {}
    warnings: list[str] = []
    pre_hash = _hash_cf(pre_waterfall_cf)

    # If upstream expense layer fails closed, propagate that as the dominant
    # reason but still try to load contract metadata for diagnostic purposes.
    if expense_null_reasons:
        for k, v in expense_null_reasons.items():
            null_reasons[k] = v
        if any(
            k in expense_null_reasons
            for k in ("fund_expense_layer", "fund_term", "management_fee")
        ):
            null_reasons["net_irr"] = "out_of_scope_requires_complete_expense_layer"

    with get_cursor() as cur:
        defn, tiers = _load_definition_and_tiers(cur, fund_id, definition_id)
        if not defn:
            null_reasons["waterfall"] = "missing_contract"
            null_reasons.setdefault("net_irr", "out_of_scope_requires_waterfall")
            return _empty_result(
                fund_id, as_of_quarter, "missing_contract", pre_hash, null_reasons, warnings
            )

        contract = _build_contract(defn, tiers)

        partners = _load_partners_with_state(cur, fund_id)
        if not partners:
            null_reasons["waterfall"] = "missing_partner_commitments"
            null_reasons.setdefault("net_irr", "out_of_scope_requires_waterfall")
            return _empty_result(
                fund_id,
                as_of_quarter,
                "missing_participants",
                pre_hash,
                null_reasons,
                warnings,
                waterfall_style=contract.style,
                pref_rate=contract.pref_rate,
                carry_rate=contract.carry_rate,
                catchup_rate=contract.catchup_rate,
                definition_id=str(defn["definition_id"]),
                definition_version=defn.get("version"),
            )

        # Pre-load the ledger contribution/distribution history per partner.
        # We need contribution dates for pref accrual.
        contribution_history: dict[str, list[tuple[date, Decimal]]] = {}
        distribution_history: dict[str, list[tuple[date, Decimal]]] = {}
        contributed_total: dict[str, Decimal] = {}
        distributed_total: dict[str, Decimal] = {}
        for p in partners:
            pid = str(p["partner_id"])
            cur.execute(
                """
                SELECT effective_date, entry_type, amount_base
                FROM re_capital_ledger_entry
                WHERE fund_id = %s AND partner_id = %s
                ORDER BY effective_date
                """,
                (str(fund_id), pid),
            )
            contribs: list[tuple[date, Decimal]] = []
            dists: list[tuple[date, Decimal]] = []
            for row in cur.fetchall():
                ed = row["effective_date"]
                amt = Decimal(str(row["amount_base"]))
                t = (row["entry_type"] or "").lower()
                if t == "contribution":
                    contribs.append((ed, amt))
                elif t == "distribution":
                    dists.append((ed, amt))
            contribution_history[pid] = contribs
            distribution_history[pid] = dists
            contributed_total[pid] = sum((a for _, a in contribs), Decimal("0"))
            distributed_total[pid] = sum((a for _, a in dists), Decimal("0"))

    # Compute ending NAV if not supplied: from re_fund_quarter_state at as_of.
    if ending_nav is None:
        with get_cursor() as cur2:
            cur2.execute(
                """
                SELECT portfolio_nav FROM re_fund_quarter_state
                WHERE fund_id = %s AND quarter = %s AND scenario_id IS NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (str(fund_id), as_of_quarter),
            )
            row = cur2.fetchone()
            ending_nav = (
                Decimal(str(row["portfolio_nav"])) if row and row.get("portfolio_nav")
                else Decimal("0")
            )

    # Partition pre_waterfall_cf
    distributable_events = [p for p in pre_waterfall_cf if p.amount > 0]
    lp_outflows = [p for p in pre_waterfall_cf if p.amount < 0]

    # Allocation walk
    contributed_running: dict[str, Decimal] = dict(contributed_total)
    distributed_running: dict[str, Decimal] = dict(distributed_total)
    pref_due_running: dict[str, Decimal] = {pid: Decimal("0") for pid in contributed_running}

    gp_profit_paid_to_date = Decimal("0")
    lp_profit_paid_to_date = Decimal("0")
    event_logs: list[WaterfallEventLog] = []

    for evt in distributable_events:
        ed = evt.quarter_end_date
        # Update pref_due per partner through ed using ledger history
        for p in partners:
            pid = str(p["partner_id"])
            pref_due_running[pid] = _accrue_pref_through(
                contract=contract,
                contribution_history=contribution_history.get(pid, []),
                distribution_history=distribution_history.get(pid, []),
                through_date=ed,
            )

        lines, per_partner = _allocate_event(
            contract=contract,
            partners=partners,
            contributed_by_partner=contributed_running,
            distributed_by_partner=distributed_running,
            pref_due_by_partner=pref_due_running,
            event_date=ed,
            distribution_amount=qmoney(evt.amount),
            gp_profit_paid_to_date=gp_profit_paid_to_date,
            lp_profit_paid_to_date=lp_profit_paid_to_date,
        )

        partner_role: dict[str, str] = {
            str(p["partner_id"]): (
                "lp" if (p["partner_type"] or "").lower() in ("lp", "co_invest") else "gp"
            )
            for p in partners
        }
        lp_share_evt = sum(
            (a for pid, a in per_partner.items() if partner_role.get(pid) == "lp"),
            Decimal("0"),
        )
        gp_share_evt = sum(
            (a for pid, a in per_partner.items() if partner_role.get(pid) == "gp"),
            Decimal("0"),
        )
        carry_evt = sum(
            (ln.amount for ln in lines if ln.tier_code.startswith("tier_4_carry_split_gp")),
            Decimal("0"),
        )
        pref_evt = sum(
            (ln.amount for ln in lines if ln.tier_code == "tier_2_preferred_return"),
            Decimal("0"),
        )
        roc_evt = sum(
            (ln.amount for ln in lines if ln.tier_code == "tier_1_return_of_capital"),
            Decimal("0"),
        )
        catchup_evt = sum(
            (ln.amount for ln in lines if ln.tier_code == "tier_3_gp_catch_up"),
            Decimal("0"),
        )

        conservation = abs(
            sum((ln.amount for ln in lines), Decimal("0")) - qmoney(evt.amount)
        )
        if any(ln.amount < 0 for ln in lines):
            warnings.append(
                f"negative_allocation_line_event={ed.isoformat()}"
            )

        event_logs.append(
            WaterfallEventLog(
                event_date=ed,
                quarter=evt.quarter,
                distribution_amount=qmoney(evt.amount),
                allocations=[
                    {
                        "tier_code": ln.tier_code,
                        "payout_type": ln.payout_type,
                        "participant_id": ln.participant_id,
                        "amount": float(ln.amount),
                        "role": partner_role.get(ln.participant_id, "unknown"),
                    }
                    for ln in lines
                ],
                lp_share=lp_share_evt,
                gp_share=gp_share_evt,
                carry_share=carry_evt,
                pref_share=pref_evt,
                return_of_capital=roc_evt,
                catch_up=catchup_evt,
                conservation_diff=conservation,
            )
        )

        # Roll forward state
        for pid, amt in per_partner.items():
            distributed_running[pid] = distributed_running.get(pid, Decimal("0")) + amt
        # Profit paid forward = LP+GP shares minus return-of-capital portion.
        gp_profit_paid_to_date += gp_share_evt
        lp_profit_paid_to_date += lp_share_evt - roc_evt  # ROC isn't profit

    # If no distributions at all
    if not distributable_events:
        warnings.append("no_distributable_events_in_pre_waterfall_cf")

    # Compute totals
    lp_partners = [p for p in partners if (p["partner_type"] or "").lower() in ("lp", "co_invest")]
    gp_partners = [p for p in partners if (p["partner_type"] or "").lower() not in ("lp", "co_invest")]
    total_committed = sum((Decimal(str(p["committed_amount"])) for p in partners), Decimal("0"))
    lp_committed = sum(
        (Decimal(str(p["committed_amount"])) for p in lp_partners), Decimal("0")
    )
    gp_committed = sum(
        (Decimal(str(p["committed_amount"])) for p in gp_partners), Decimal("0")
    )

    if total_committed <= 0:
        null_reasons["waterfall"] = "zero_total_commitments"
        null_reasons["net_irr"] = "out_of_scope_requires_waterfall"
        return _empty_result(
            fund_id, as_of_quarter, "missing_participants", pre_hash, null_reasons, warnings,
            waterfall_style=contract.style,
            pref_rate=contract.pref_rate,
            carry_rate=contract.carry_rate,
            catchup_rate=contract.catchup_rate,
            definition_id=str(defn["definition_id"]),
            definition_version=defn.get("version"),
        )

    lp_share_pct = lp_committed / total_committed
    gp_share_pct = gp_committed / total_committed

    # Aggregate event-side LP/GP shares
    total_lp_distributions = sum((ev.lp_share for ev in event_logs), Decimal("0"))
    total_gp_distributions = sum((ev.gp_share for ev in event_logs), Decimal("0"))
    total_carry = sum((ev.carry_share for ev in event_logs), Decimal("0"))
    total_pref = sum((ev.pref_share for ev in event_logs), Decimal("0"))
    total_roc = sum((ev.return_of_capital for ev in event_logs), Decimal("0"))
    total_catchup = sum((ev.catch_up for ev in event_logs), Decimal("0"))

    # LP and GP-side calls (pre_waterfall_cf negatives are LP-side outflows;
    # GP doesn't fund calls in most US waterfalls beyond GP's commitment %)
    total_outflow = sum((p.amount for p in lp_outflows), Decimal("0"))  # negative
    lp_called = -total_outflow * lp_share_pct
    gp_called = -total_outflow * gp_share_pct

    # Ending NAV split pro-rata by committed (proxy until the contract is run on liquidation)
    lp_ending_nav = ending_nav * lp_share_pct
    gp_ending_nav = ending_nav * gp_share_pct

    # LP cash stream: LP-side outflows (negatives, scaled by lp_share_pct) +
    # LP distributions per event (positive) + LP-share of ending NAV at as_of.
    as_of_end = pre_waterfall_cf[-1].quarter_end_date if pre_waterfall_cf else None

    lp_stream: list[tuple[date, Decimal]] = []
    for p in lp_outflows:
        lp_stream.append((p.quarter_end_date, p.amount * lp_share_pct))
    for ev in event_logs:
        lp_stream.append((ev.event_date, ev.lp_share))
    if as_of_end and lp_ending_nav > 0:
        # Add LP NAV one day after the last cash flow to avoid same-date stacking issues
        lp_stream.append((as_of_end, lp_ending_nav))

    gp_stream: list[tuple[date, Decimal]] = []
    for p in lp_outflows:
        gp_stream.append((p.quarter_end_date, p.amount * gp_share_pct))
    for ev in event_logs:
        gp_stream.append((ev.event_date, ev.gp_share))
    if as_of_end and gp_ending_nav > 0:
        gp_stream.append((as_of_end, gp_ending_nav))

    net_irr: Decimal | None = None
    if lp_called > 0:
        try:
            r = xirr([(d, a) for d, a in lp_stream if a != 0])
            if r is not None:
                net_irr = Decimal(str(r)).quantize(Decimal("0.000001"))
        except Exception as exc:
            warnings.append(f"xirr_lp_stream_failed:{type(exc).__name__}")

    dpi = (total_lp_distributions / lp_called).quantize(Decimal("0.0001")) if lp_called > 0 else None
    rvpi = (lp_ending_nav / lp_called).quantize(Decimal("0.0001")) if lp_called > 0 else None
    net_tvpi = ((total_lp_distributions + lp_ending_nav) / lp_called).quantize(
        Decimal("0.0001")
    ) if lp_called > 0 else None

    gross_net_spread_bps: int | None = None
    if fund_gross_irr is not None and net_irr is not None:
        gross_net_spread_bps = int(((fund_gross_irr - net_irr) * Decimal("10000")).quantize(Decimal("1")))

    inputs_hash = _hash_inputs(
        fund_id=fund_id,
        as_of_quarter=as_of_quarter,
        defn_id=defn["definition_id"],
        defn_version=defn.get("version"),
        pre_hash=pre_hash,
        partner_ids=sorted(str(p["partner_id"]) for p in partners),
        ending_nav=ending_nav,
    )

    status: WaterfallStatus = "computed" if event_logs else "no_distributions"

    return FundWaterfallResult(
        fund_id=fund_id,
        as_of_quarter=as_of_quarter,
        waterfall_status=status,
        pre_waterfall_net_cf_hash=pre_hash,
        net_irr=net_irr,
        net_tvpi=net_tvpi,
        dpi=dpi,
        rvpi=rvpi,
        carry=total_carry,
        gp_share=total_gp_distributions,
        lp_share=total_lp_distributions,
        pref_distributed=total_pref,
        return_of_capital_distributed=total_roc,
        catch_up_distributed=total_catchup,
        gross_net_spread_bps=gross_net_spread_bps,
        lp_called=lp_called,
        lp_distributions=total_lp_distributions,
        lp_ending_nav_share=lp_ending_nav,
        gp_called=gp_called,
        gp_distributions=total_gp_distributions,
        gp_ending_nav_share=gp_ending_nav,
        waterfall_style=contract.style,
        pref_rate=contract.pref_rate,
        carry_rate=contract.carry_rate,
        catchup_rate=contract.catchup_rate,
        definition_id=str(defn["definition_id"]),
        definition_version=defn.get("version"),
        event_logs=event_logs,
        null_reasons=null_reasons,
        warnings=warnings,
        inputs_hash=inputs_hash,
    )


def _empty_result(
    fund_id: UUID,
    as_of_quarter: str,
    status: WaterfallStatus,
    pre_hash: str,
    null_reasons: dict[str, str],
    warnings: list[str],
    *,
    waterfall_style: str | None = None,
    pref_rate: Decimal | None = None,
    carry_rate: Decimal | None = None,
    catchup_rate: Decimal | None = None,
    definition_id: str | None = None,
    definition_version: int | None = None,
) -> FundWaterfallResult:
    return FundWaterfallResult(
        fund_id=fund_id,
        as_of_quarter=as_of_quarter,
        waterfall_status=status,
        pre_waterfall_net_cf_hash=pre_hash,
        net_irr=None,
        net_tvpi=None,
        dpi=None,
        rvpi=None,
        carry=None,
        gp_share=None,
        lp_share=None,
        pref_distributed=None,
        return_of_capital_distributed=None,
        catch_up_distributed=None,
        gross_net_spread_bps=None,
        lp_called=None,
        lp_distributions=None,
        lp_ending_nav_share=None,
        gp_called=None,
        gp_distributions=None,
        gp_ending_nav_share=None,
        waterfall_style=waterfall_style,
        pref_rate=pref_rate,
        carry_rate=carry_rate,
        catchup_rate=catchup_rate,
        definition_id=definition_id,
        definition_version=definition_version,
        event_logs=[],
        null_reasons=null_reasons,
        warnings=warnings,
        inputs_hash=None,
    )


def _hash_cf(cf: Iterable[CFPoint]) -> str:
    import hashlib

    h = hashlib.sha256()
    for p in cf:
        h.update(f"{p.quarter_end_date.isoformat()}|{p.amount}|".encode())
    return f"sha256:{h.hexdigest()}"


def _hash_inputs(
    *,
    fund_id: UUID,
    as_of_quarter: str,
    defn_id,
    defn_version,
    pre_hash: str,
    partner_ids: list[str],
    ending_nav: Decimal,
) -> str:
    import hashlib

    h = hashlib.sha256()
    h.update(
        f"{fund_id}|{as_of_quarter}|{defn_id}|{defn_version}|{pre_hash}|{ending_nav}|".encode()
    )
    h.update(("|".join(partner_ids)).encode())
    return f"sha256:{h.hexdigest()}"
