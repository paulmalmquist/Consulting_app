"""Gate service for fund-metric trace routes.

A trace request is permitted only if the fund:

    1. is in re_fund_portfolio_included_v for (env_id, business_id, quarter), AND
    2. has a released snapshot for the same (fund_id, quarter).

Both checks are required. Item 1 alone proves the fund is investor-facing for
the requested period; item 2 returns the snapshot row from which trace data
must be sourced. The trace services scope every read by the snapshot's
audit_run_id, so failing item 2 means there is no authoritative state to
trace from.

If either check fails, the gate raises HTTPException(404). The route handler
must call this gate first; downstream services must not be reachable
otherwise.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.db import get_cursor


@dataclass
class TraceableFundSnapshot:
    """The released fund snapshot returned by the gate.

    audit_run_id      Authoritative scope for asset-state and investment-state
                      reads. Every trace query must filter by this value.
    snapshot_version  Human-readable label for the snapshot.
    canonical_metrics The metrics block as serialized in the snapshot.
    provenance        Raw provenance list as serialized in the snapshot.
                      The IRR trace reads provenance[0].cf_series_hash from here.
    inputs_hash       Top-level snapshot hash. The IRR trace cross-checks this
                      against the materialized CF series source_hash.
    null_reasons      Field-level null reasons (e.g. for ending_nav, gross_irr).
    """

    fund_id: str
    fund_name: str
    quarter: str
    audit_run_id: str
    snapshot_version: str
    canonical_metrics: dict[str, Any]
    provenance: list[dict[str, Any]]
    inputs_hash: str | None
    null_reasons: dict[str, Any]


def assert_fund_traceable(
    *,
    env_id: str,
    business_id: UUID | str,
    fund_id: UUID | str,
    quarter: str,
) -> TraceableFundSnapshot:
    """Gate every trace request through the canonical inclusion view.

    Raises HTTPException(404) if the fund is not in
    re_fund_portfolio_included_v for the requested (env_id, business_id,
    quarter), or if no released snapshot exists for the period.

    The 404 surface is intentional: from a trace caller's perspective, a
    quarantined fund and a fund without a released snapshot are both
    "not traceable", and the route should not leak the difference.
    """
    business_id_text = str(business_id)
    fund_id_text = str(fund_id)
    env_id_text = str(env_id)

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              v.fund_id::text   AS fund_id,
              v.name            AS fund_name,
              v.quarter         AS quarter,
              v.audit_run_id::text AS audit_run_id,
              v.snapshot_version,
              v.canonical_metrics,
              v.provenance,
              s.inputs_hash,
              v.null_reasons
            FROM re_fund_portfolio_included_v v
            JOIN re_authoritative_fund_state_qtr s
              ON s.audit_run_id = v.audit_run_id
             AND s.fund_id      = v.fund_id
             AND s.quarter      = v.quarter
             AND s.promotion_state = 'released'
            WHERE v.env_id      = %s
              AND v.business_id = %s::uuid
              AND v.fund_id     = %s::uuid
              AND v.quarter     = %s
            LIMIT 1
            """,
            (env_id_text, business_id_text, fund_id_text, quarter),
        )
        row = cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "fund_not_traceable",
                "message": (
                    "Fund is not in the canonical fund-portfolio inclusion view "
                    "for the requested env/business/quarter, or has no released "
                    "snapshot for that period."
                ),
                "env_id": env_id_text,
                "business_id": business_id_text,
                "fund_id": fund_id_text,
                "quarter": quarter,
            },
        )

    return TraceableFundSnapshot(
        fund_id=str(row["fund_id"]),
        fund_name=row["fund_name"],
        quarter=row["quarter"],
        audit_run_id=str(row["audit_run_id"]),
        snapshot_version=row["snapshot_version"],
        canonical_metrics=row.get("canonical_metrics") or {},
        provenance=row.get("provenance") or [],
        inputs_hash=row.get("inputs_hash"),
        null_reasons=row.get("null_reasons") or {},
    )
