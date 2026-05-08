"""NAV trace — drill from a fund's portfolio_nav to the asset rows that compose it.

Contract:

    Asset rows are read from re_authoritative_asset_state_qtr filtered by
    (audit_run_id, fund_id) of the released fund snapshot. This is the only
    legitimate source. The route does not recompute NAV from any other table.

    asset_sum = Σ(asset.ending_nav × asset.ownership_pct) for rows where both
    values are present. Asset rows with null ending_nav are returned (so the
    UI can display the null_reason) but excluded from the sum.

    Reconciliation:
        delta            = fund_nav - asset_sum
        hard_tolerance   = max($1.00, 1bp × |fund_nav|)
        soft_tolerance   = $1.00
        status           = reconciled  if |delta| <= soft_tolerance
                           soft_fail   if soft_tolerance < |delta| <= hard_tolerance
                           hard_fail   if |delta| > hard_tolerance
                           unavailable if fund_nav is None

    All values are returned as decimal-encoded strings; null values stay null.

The gate is enforced by re_trace_gate.assert_fund_traceable(); call it BEFORE
calling this service.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from app.db import get_cursor
from app.services.re_authoritative_snapshots import _normalize, _to_decimal
from app.services.re_trace_gate import TraceableFundSnapshot


SOFT_TOLERANCE_USD = Decimal("1.00")
HARD_TOLERANCE_BPS = Decimal("0.0001")


ReconciliationStatus = Literal["reconciled", "soft_fail", "hard_fail", "unavailable"]


@dataclass
class AssetNavRow:
    asset_id: str
    asset_name: str | None
    investment_id: str | None
    investment_name: str | None
    ending_nav: str | None
    ownership_pct: str | None
    fund_attributed_nav: str | None
    trust_status: str
    null_reasons: dict[str, Any]
    source_table: str
    audit_run_id: str


@dataclass
class NavReconciliationCheck:
    fund_nav: str | None
    asset_sum: str
    delta: str
    soft_tolerance: str
    hard_tolerance: str
    soft_pass: bool
    hard_pass: bool
    status: ReconciliationStatus


@dataclass
class NavTracePayload:
    fund_id: str
    fund_name: str
    quarter: str
    audit_run_id: str
    snapshot_version: str
    fund_nav: str | None
    asset_rows: list[AssetNavRow]
    reconciliation: NavReconciliationCheck
    null_reason: str | None
    provenance: dict[str, Any]


def _metric(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _asset_row_attributed_nav(
    ending_nav: Any, ownership_pct: Any
) -> Decimal | None:
    if ending_nav is None or ending_nav == "":
        return None
    if ownership_pct is None or ownership_pct == "":
        return None
    try:
        nav = Decimal(str(ending_nav))
        own = Decimal(str(ownership_pct))
    except Exception:
        return None
    return nav * own


def get_nav_trace(snapshot: TraceableFundSnapshot) -> NavTracePayload:
    """Build the NAV trace payload for a gated fund snapshot.

    Caller must invoke re_trace_gate.assert_fund_traceable() first; passing
    its return value here scopes the asset query by audit_run_id, which is
    the only legitimate scope.
    """
    fund_metrics = snapshot.canonical_metrics or {}
    raw_fund_nav = fund_metrics.get("ending_nav") or fund_metrics.get("portfolio_nav")
    fund_nav: Decimal | None
    if raw_fund_nav is None or raw_fund_nav == "":
        fund_nav = None
    else:
        try:
            fund_nav = Decimal(str(raw_fund_nav))
        except Exception:
            fund_nav = None

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              a.asset_id::text                                AS asset_id,
              a.investment_id::text                           AS investment_id,
              a.canonical_metrics->>'ending_nav'              AS ending_nav,
              a.canonical_metrics->>'ownership_pct'           AS ownership_pct,
              a.trust_status                                  AS trust_status,
              a.null_reasons                                  AS null_reasons,
              a.audit_run_id::text                            AS audit_run_id,
              ra.name                                         AS asset_name,
              ri.name                                         AS investment_name
            FROM re_authoritative_asset_state_qtr a
            LEFT JOIN repe_asset ra ON ra.asset_id = a.asset_id
            LEFT JOIN repe_deal  ri ON ri.deal_id  = a.investment_id
            WHERE a.audit_run_id = %s::uuid
              AND a.fund_id      = %s::uuid
              AND a.promotion_state = 'released'
            ORDER BY a.investment_id NULLS LAST, a.asset_id
            """,
            (snapshot.audit_run_id, snapshot.fund_id),
        )
        rows = cur.fetchall()

    asset_rows: list[AssetNavRow] = []
    asset_sum = Decimal("0")
    for r in rows:
        attributed = _asset_row_attributed_nav(
            r.get("ending_nav"), r.get("ownership_pct")
        )
        if attributed is not None:
            asset_sum += attributed
        asset_rows.append(
            AssetNavRow(
                asset_id=str(r["asset_id"]),
                asset_name=r.get("asset_name"),
                investment_id=r.get("investment_id"),
                investment_name=r.get("investment_name"),
                ending_nav=_metric(r.get("ending_nav")),
                ownership_pct=_metric(r.get("ownership_pct")),
                fund_attributed_nav=str(attributed) if attributed is not None else None,
                trust_status=r.get("trust_status") or "untrusted",
                null_reasons=_normalize(r.get("null_reasons") or {}),
                source_table="re_authoritative_asset_state_qtr",
                audit_run_id=str(r["audit_run_id"]),
            )
        )

    # ── Reconciliation ─────────────────────────────────────────────────────
    null_reason: str | None = None
    if fund_nav is None:
        null_reason = (
            snapshot.null_reasons.get("ending_nav")
            or snapshot.null_reasons.get("portfolio_nav")
            or "fund_nav_unavailable"
        )
        reconciliation = NavReconciliationCheck(
            fund_nav=None,
            asset_sum=str(asset_sum),
            delta="0",
            soft_tolerance=str(SOFT_TOLERANCE_USD),
            hard_tolerance=str(SOFT_TOLERANCE_USD),
            soft_pass=False,
            hard_pass=False,
            status="unavailable",
        )
    else:
        delta = fund_nav - asset_sum
        bp_ceiling = (fund_nav.copy_abs() * HARD_TOLERANCE_BPS) if fund_nav else Decimal("0")
        hard_tol = max(SOFT_TOLERANCE_USD, bp_ceiling)
        abs_delta = delta.copy_abs()
        soft_pass = abs_delta <= SOFT_TOLERANCE_USD
        hard_pass = abs_delta <= hard_tol
        if soft_pass:
            status: ReconciliationStatus = "reconciled"
        elif hard_pass:
            status = "soft_fail"
        else:
            status = "hard_fail"
        reconciliation = NavReconciliationCheck(
            fund_nav=str(fund_nav),
            asset_sum=str(asset_sum),
            delta=str(delta),
            soft_tolerance=str(SOFT_TOLERANCE_USD),
            hard_tolerance=str(hard_tol),
            soft_pass=soft_pass,
            hard_pass=hard_pass,
            status=status,
        )

    return NavTracePayload(
        fund_id=snapshot.fund_id,
        fund_name=snapshot.fund_name,
        quarter=snapshot.quarter,
        audit_run_id=snapshot.audit_run_id,
        snapshot_version=snapshot.snapshot_version,
        fund_nav=str(fund_nav) if fund_nav is not None else None,
        asset_rows=asset_rows,
        reconciliation=reconciliation,
        null_reason=null_reason,
        provenance={
            "source_table": "re_authoritative_asset_state_qtr",
            "scope": "audit_run_id = fund_snapshot.audit_run_id",
            "asset_count": len(asset_rows),
            "contributing_asset_count": sum(
                1 for a in asset_rows if a.fund_attributed_nav is not None
            ),
        },
    )


def payload_to_dict(payload: NavTracePayload) -> dict[str, Any]:
    return _normalize(asdict(payload))
