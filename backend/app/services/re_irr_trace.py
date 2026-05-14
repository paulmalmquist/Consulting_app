"""Gross IRR trace — drill from a fund's gross_irr to the cash-flow rows used.

Lineage authority:

    The fund snapshot stores the CF series hash in two places:
        snapshot.provenance[0].cf_series_hash
        snapshot.inputs_hash
    These are written together by bottom_up_snapshot_writer.py and must
    match. This trace treats the hash as the AUTHORITATIVE GATE. If the hash
    is missing, or if no row in re_investment_cf_series_mat for the fund's
    investments and the snapshot quarter carries a matching source_hash, the
    trace returns Unavailable(source_lineage_missing). It never falls back
    to recomputing IRR from current cashflow tables.

    This is the "partial lineage gap" classified in the schema sanity check
    (audit/fund_trace/irr_lineage_gap_classification.md): re_authoritative_*_qtr
    has source_row_refs = [], so the FK from snapshot to CF rows is
    indirect — the hash is the only proof the rows are the same inputs.

Verification (not authority):

    When the hash gate passes, the service runs xirr() over the matched CF
    rows as a cross-check. The recomputed value is reported alongside the
    snapshot's gross_irr with a delta_bps; the snapshot's value remains the
    displayed number. Reconciliation status is purely diagnostic — a delta
    above the hard tolerance (1 bp) is logged as `hard_fail` so the receipt
    surfaces stale-CF risk, but the route still serves the snapshot value.

The gate is enforced by re_trace_gate.assert_fund_traceable(); call it BEFORE
calling this service.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from app.db import get_cursor
from app.finance.irr_engine import xirr
from app.services.re_authoritative_snapshots import _normalize
from app.services.re_trace_gate import TraceableFundSnapshot


HARD_TOLERANCE_BPS = Decimal("1")
SOFT_TOLERANCE_BPS = Decimal("0.0001")


ReconciliationStatus = Literal[
    "reconciled", "soft_fail", "hard_fail", "unavailable", "lineage_missing"
]


@dataclass
class InvestmentCfRow:
    investment_id: str
    investment_name: str | None
    quarter: str
    quarter_end_date: str
    cash_flow_base: str
    asset_contributions: list[Any]
    source_hash: str
    source_table: str


@dataclass
class IrrReconciliationCheck:
    snapshot_gross_irr: str | None
    recomputed_irr: str | None
    delta_bps: str | None
    soft_tolerance_bps: str
    hard_tolerance_bps: str
    soft_pass: bool | None
    hard_pass: bool | None
    status: ReconciliationStatus
    lineage_note: str | None


@dataclass
class IrrTracePayload:
    fund_id: str
    fund_name: str
    quarter: str
    audit_run_id: str
    snapshot_version: str
    snapshot_gross_irr: str | None
    cf_rows: list[InvestmentCfRow]
    reconciliation: IrrReconciliationCheck
    null_reason: str | None
    provenance: dict[str, Any]


def _extract_cf_series_hash(snapshot: TraceableFundSnapshot) -> str | None:
    """Resolve the CF series hash from snapshot provenance + inputs_hash.

    Both must be present and equal. Disagreement is treated as missing
    lineage; the route does not pick one over the other.
    """
    inputs_hash = snapshot.inputs_hash
    prov = snapshot.provenance or []
    prov_hash: str | None = None
    if prov and isinstance(prov, list) and isinstance(prov[0], dict):
        prov_hash = prov[0].get("cf_series_hash")

    if not inputs_hash or not prov_hash:
        return None
    if str(inputs_hash) != str(prov_hash):
        return None
    return str(inputs_hash)


def _coerce_quarter_end(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value))
    except Exception:
        return None


def _unavailable_payload(
    snapshot: TraceableFundSnapshot,
    *,
    note: str,
    status: ReconciliationStatus,
    null_reason: str,
) -> IrrTracePayload:
    metrics = snapshot.canonical_metrics or {}
    snapshot_gross_irr = metrics.get("gross_irr")
    return IrrTracePayload(
        fund_id=snapshot.fund_id,
        fund_name=snapshot.fund_name,
        quarter=snapshot.quarter,
        audit_run_id=snapshot.audit_run_id,
        snapshot_version=snapshot.snapshot_version,
        snapshot_gross_irr=str(snapshot_gross_irr) if snapshot_gross_irr is not None else None,
        cf_rows=[],
        reconciliation=IrrReconciliationCheck(
            snapshot_gross_irr=str(snapshot_gross_irr) if snapshot_gross_irr is not None else None,
            recomputed_irr=None,
            delta_bps=None,
            soft_tolerance_bps=str(SOFT_TOLERANCE_BPS),
            hard_tolerance_bps=str(HARD_TOLERANCE_BPS),
            soft_pass=None,
            hard_pass=None,
            status=status,
            lineage_note=note,
        ),
        null_reason=null_reason,
        provenance={
            "source_table": "re_investment_cf_series_mat",
            "scope": "source_hash = fund_snapshot.provenance[0].cf_series_hash",
            "matched_row_count": 0,
            "lineage_status": status,
        },
    )


def get_irr_trace(snapshot: TraceableFundSnapshot) -> IrrTracePayload:
    """Build the gross-IRR trace payload for a gated fund snapshot.

    The hash gate is the authority. If it fails, returns
    Unavailable(source_lineage_missing) with no CF rows. Recomputation is
    forbidden when the hash gate fails.
    """
    cf_hash = _extract_cf_series_hash(snapshot)
    if cf_hash is None:
        return _unavailable_payload(
            snapshot,
            note=(
                "Fund snapshot is missing a cf_series_hash, or provenance "
                "and inputs_hash disagree. Cannot prove the CF series matches."
            ),
            status="lineage_missing",
            null_reason="source_lineage_missing",
        )

    # Resolve the investment_ids the fund snapshot was built from. This is the
    # released investment-state set scoped by audit_run_id — same authoritative
    # source as the fund snapshot, so no drift.
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT investment_id::text AS investment_id
            FROM re_authoritative_investment_state_qtr
            WHERE audit_run_id = %s::uuid
              AND fund_id      = %s::uuid
              AND promotion_state = 'released'
            """,
            (snapshot.audit_run_id, snapshot.fund_id),
        )
        investment_rows = cur.fetchall()

    if not investment_rows:
        return _unavailable_payload(
            snapshot,
            note=(
                "No released investment-state rows for the fund's audit_run_id. "
                "Cannot resolve the investment set deterministically."
            ),
            status="lineage_missing",
            null_reason="source_lineage_missing",
        )

    investment_ids = [r["investment_id"] for r in investment_rows]

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              cf.investment_id::text  AS investment_id,
              cf.quarter              AS quarter,
              cf.as_of_quarter        AS as_of_quarter,
              cf.quarter_end_date     AS quarter_end_date,
              cf.cash_flow_base       AS cash_flow_base,
              cf.asset_contributions  AS asset_contributions,
              cf.source_hash          AS source_hash,
              ri.name                 AS investment_name
            FROM re_investment_cf_series_mat cf
            LEFT JOIN repe_deal ri ON ri.deal_id = cf.investment_id
            WHERE cf.investment_id = ANY(%s::uuid[])
              AND cf.as_of_quarter = %s
            ORDER BY cf.quarter_end_date, cf.investment_id
            """,
            (investment_ids, snapshot.quarter),
        )
        all_rows = cur.fetchall()

    if not all_rows:
        return _unavailable_payload(
            snapshot,
            note=(
                "re_investment_cf_series_mat has no rows for this fund's "
                "investments at as_of_quarter = snapshot.quarter."
            ),
            status="lineage_missing",
            null_reason="source_lineage_missing",
        )

    # Hash gate — only rows whose source_hash matches the snapshot hash count.
    matched_rows = [r for r in all_rows if str(r.get("source_hash") or "") == cf_hash]
    if not matched_rows:
        return _unavailable_payload(
            snapshot,
            note=(
                "CF rows exist for the fund's investments but none carry the "
                "snapshot's cf_series_hash. The materialized series was "
                "regenerated after the snapshot was taken; lineage cannot be "
                "proven."
            ),
            status="lineage_missing",
            null_reason="source_lineage_missing",
        )

    # ── Investment-set membership check ────────────────────────────────────
    # The CF rows must be for investments that belong to the same released
    # investment-state set as the fund snapshot. The SQL filter above bounds
    # this in principle (WHERE cf.investment_id = ANY(investment_ids)), but a
    # defensive post-check guards against drift if the SQL is ever modified
    # or the matched_rows shape changes. Until investment_set_hash is written
    # by the snapshot writer (separate PR), this is the strongest local check
    # we can make.
    expected_investment_set = set(investment_ids)
    rogue_investment_ids = [
        str(r["investment_id"])
        for r in matched_rows
        if str(r["investment_id"]) not in expected_investment_set
    ]
    if rogue_investment_ids:
        return _unavailable_payload(
            snapshot,
            note=(
                "Matched CF rows include investment_id(s) outside the fund's "
                f"released investment-state set: {sorted(set(rogue_investment_ids))[:5]}. "
                "Aggregation scope cannot be proven."
            ),
            status="lineage_missing",
            null_reason="source_lineage_missing",
        )

    # ── Quarter-consistency assertion ──────────────────────────────────────
    # Every matched CF row's as_of_quarter must equal the fund snapshot's
    # quarter. The SQL bounds this with WHERE cf.as_of_quarter = snapshot.quarter,
    # but we double-check to surface any drift if the query is later changed.
    # cf.quarter is the cash-flow period (the row's bucket); cf.as_of_quarter
    # is the "what view of the series" — that's the one that must match the
    # snapshot quarter so we can't be looking at a different vintage.
    mismatched_quarters = {
        str(r.get("as_of_quarter"))
        for r in matched_rows
        if str(r.get("as_of_quarter") or "") != snapshot.quarter
    }
    if mismatched_quarters:
        return _unavailable_payload(
            snapshot,
            note=(
                "Matched CF rows include as_of_quarter values that disagree "
                f"with snapshot.quarter={snapshot.quarter}: "
                f"{sorted(mismatched_quarters)[:5]}. Quarter split-brain — "
                "trace cannot prove it is reading the same series the snapshot used."
            ),
            status="lineage_missing",
            null_reason="source_lineage_missing",
        )

    cf_rows: list[InvestmentCfRow] = []
    xirr_inputs: list[tuple[date, Decimal]] = []
    for r in matched_rows:
        qe = _coerce_quarter_end(r.get("quarter_end_date"))
        cfb = r.get("cash_flow_base")
        cf_rows.append(
            InvestmentCfRow(
                investment_id=str(r["investment_id"]),
                investment_name=r.get("investment_name"),
                quarter=r["quarter"],
                quarter_end_date=qe.isoformat() if qe else "",
                cash_flow_base=str(cfb) if cfb is not None else "0",
                asset_contributions=_normalize(r.get("asset_contributions") or []),
                source_hash=str(r["source_hash"]),
                source_table="re_investment_cf_series_mat",
            )
        )
        if qe is not None and cfb is not None:
            try:
                xirr_inputs.append((qe, Decimal(str(cfb))))
            except Exception:
                continue

    # Cross-check via xirr — verification only, never the displayed number.
    metrics = snapshot.canonical_metrics or {}
    snapshot_irr_raw = metrics.get("gross_irr")
    snapshot_irr: Decimal | None
    if snapshot_irr_raw is None:
        snapshot_irr = None
    else:
        try:
            snapshot_irr = Decimal(str(snapshot_irr_raw))
        except Exception:
            snapshot_irr = None

    recomputed = xirr(xirr_inputs) if len(xirr_inputs) >= 2 else None

    if snapshot_irr is None or recomputed is None:
        reconciliation = IrrReconciliationCheck(
            snapshot_gross_irr=str(snapshot_irr) if snapshot_irr is not None else None,
            recomputed_irr=str(recomputed) if recomputed is not None else None,
            delta_bps=None,
            soft_tolerance_bps=str(SOFT_TOLERANCE_BPS),
            hard_tolerance_bps=str(HARD_TOLERANCE_BPS),
            soft_pass=None,
            hard_pass=None,
            status="unavailable",
            lineage_note=(
                "xirr_nonconvergence" if recomputed is None else "snapshot_irr_null"
            ),
        )
        null_reason = "irr_recomputation_unavailable"
    else:
        delta = (snapshot_irr - recomputed) * Decimal("10000")
        abs_delta = delta.copy_abs()
        soft_pass = abs_delta <= SOFT_TOLERANCE_BPS
        hard_pass = abs_delta <= HARD_TOLERANCE_BPS
        if soft_pass:
            status: ReconciliationStatus = "reconciled"
        elif hard_pass:
            status = "soft_fail"
        else:
            status = "hard_fail"
        reconciliation = IrrReconciliationCheck(
            snapshot_gross_irr=str(snapshot_irr),
            recomputed_irr=str(recomputed),
            delta_bps=str(delta),
            soft_tolerance_bps=str(SOFT_TOLERANCE_BPS),
            hard_tolerance_bps=str(HARD_TOLERANCE_BPS),
            soft_pass=soft_pass,
            hard_pass=hard_pass,
            status=status,
            lineage_note=None,
        )
        null_reason = None

    return IrrTracePayload(
        fund_id=snapshot.fund_id,
        fund_name=snapshot.fund_name,
        quarter=snapshot.quarter,
        audit_run_id=snapshot.audit_run_id,
        snapshot_version=snapshot.snapshot_version,
        snapshot_gross_irr=str(snapshot_irr) if snapshot_irr is not None else None,
        cf_rows=cf_rows,
        reconciliation=reconciliation,
        null_reason=null_reason,
        provenance={
            "source_table": "re_investment_cf_series_mat",
            "scope": "source_hash = fund_snapshot.provenance[0].cf_series_hash",
            "cf_series_hash": cf_hash,
            "matched_row_count": len(cf_rows),
            "candidate_row_count": len(all_rows),
            "investment_count": len(investment_ids),
            "investment_set_check": "passed",
            "quarter_consistency_check": "passed",
            "lineage_status": "verified",
        },
    )


def payload_to_dict(payload: IrrTracePayload) -> dict[str, Any]:
    return _normalize(asdict(payload))
