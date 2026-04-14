"""Write bottom-up gross IRR into the authoritative snapshot canonical_metrics.

Called by the quarter-close fan-out after `compute_fund_rollup` produces a
FundRollup. Net IRR / carry / gp_share stay null with
null_reason=out_of_scope_requires_waterfall per SYSTEM_RULES_AUTHORITATIVE_STATE.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from app.services.bottom_up_rollup import (
    FundRollup,
    build_canonical_metrics_bottom_up,
    compute_fund_rollup,
)
from app.services.re_authoritative_snapshots import (
    create_snapshot_run,
    persist_authoritative_state,
)

BOTTOM_UP_METHODOLOGY = "bottom_up_cashflow_v1"


def _cf_series_hash(roll: FundRollup) -> str:
    payload = [
        (p.quarter, float(p.amount), p.has_actual, p.has_projection, p.has_exit, p.has_terminal_value)
        for p in roll.series
    ]
    h = hashlib.sha256()
    h.update(json.dumps(payload, sort_keys=True, default=str).encode())
    return h.hexdigest()


def write_fund_bottom_up_snapshot(
    *,
    env_id: str,
    business_id: UUID | str,
    fund_id: UUID | str,
    quarter: str,
    snapshot_version: str | None = None,
    created_by: str = "bottom_up_writer",
    trust_status: str = "trusted",
) -> dict[str, Any]:
    """Compute the fund rollup and persist it into
    re_authoritative_fund_state_qtr.canonical_metrics as a draft_audit row.

    Returns {snapshot_version, audit_run_id, snapshot_id, gross_irr_bottom_up}.
    """
    roll = compute_fund_rollup(
        UUID(str(fund_id)), quarter,
    )
    if snapshot_version is None:
        # Versioned by fund + quarter + series hash so the same inputs produce
        # the same version; new inputs produce a new version.
        series_hash = _cf_series_hash(roll)
        snapshot_version = f"bottom_up::{fund_id}::{quarter}::{series_hash[:12]}"
    else:
        series_hash = _cf_series_hash(roll)

    audit_run_id = create_snapshot_run(
        env_id=env_id,
        business_id=business_id,
        snapshot_version=snapshot_version,
        sample_manifest={
            "methodology": BOTTOM_UP_METHODOLOGY,
            "fund_id": str(fund_id),
            "quarter": quarter,
        },
        artifact_root="",
        created_by=created_by,
        methodology_version=BOTTOM_UP_METHODOLOGY,
    )

    canonical = build_canonical_metrics_bottom_up(roll, cf_series_hash=series_hash)

    # Fail-closed on waterfall metrics.
    null_reasons: dict[str, Any] = {
        "net_irr": "out_of_scope_requires_waterfall",
        "carry": "out_of_scope_requires_waterfall",
        "gp_share": "out_of_scope_requires_waterfall",
    }
    if roll.null_reason:
        null_reasons["gross_irr_bottom_up"] = roll.null_reason

    snapshot_id = persist_authoritative_state(
        entity_type="fund",
        audit_run_id=audit_run_id,
        snapshot_version=snapshot_version,
        env_id=env_id,
        business_id=business_id,
        entity_id=fund_id,
        quarter=quarter,
        trust_status=trust_status,
        breakpoint_layer="bottom_up",
        canonical_metrics=canonical,
        display_metrics={
            "gross_irr_bottom_up_display": (
                f"{float(roll.irr) * 100:.2f}%" if roll.irr is not None else "—"
            ),
        },
        null_reasons=null_reasons,
        formulas={
            "gross_irr_bottom_up": "xirr(sum_over_investments(sum_over_assets(asset_cf × ownership_pct_at_quarter)))",
            "irr_contribution[*].irr_marginal_bps": "(fund_irr_with_asset − fund_irr_without_asset) × 10000",
        },
        provenance=[
            {
                "step": "bottom_up_rollup",
                "methodology": BOTTOM_UP_METHODOLOGY,
                "cf_series_hash": series_hash,
                "investment_count": len(roll.investment_contributions),
                "asset_count": len(roll.asset_contributions),
                "null_investment_count": sum(
                    1 for c in roll.investment_contributions if c["null_reason"]
                ),
            }
        ],
        source_row_refs=[],
        artifact_paths={},
        fund_id=fund_id,
        inputs_hash=series_hash,
    )

    return {
        "snapshot_version": snapshot_version,
        "audit_run_id": str(audit_run_id),
        "snapshot_id": str(snapshot_id),
        "gross_irr_bottom_up": canonical["gross_irr_bottom_up"],
        "has_complete_cf": canonical["has_complete_cf"],
    }
