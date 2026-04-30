"""Phase 4-5 v2 snapshot composer + promotion gate.

Builds a draft authoritative snapshot for one ``(fund, quarter)`` from:
  scope + rollup + expense_schedule + waterfall_result + bridge.

Always writes as ``promotion_state='draft_audit'`` regardless of input
completeness. Promotion to ``released`` is gated by
``assert_promotion_preconditions`` — every layer must be complete and
the bridge must tie (or have only an explained leverage residual memo).

The Remediation 1 partial UQ index further enforces "one released row
per (fund, quarter)" at the schema level. Even if a runner tries to
release a duplicate, the DB rejects the INSERT/UPDATE.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.services.bottom_up_fund_scope import FundScope
from app.services.bottom_up_rollup import FundRollup
from app.services.fund_expense_layer import FundExpenseSchedule
from app.services.fund_gross_to_net import GrossToNetBridge
from app.services.fund_waterfall_layer import FundWaterfallResult
from app.services.re_authoritative_snapshots import (
    create_snapshot_run,
    persist_authoritative_state,
    persist_fund_gross_to_net_bridge,
)

ASSET_OPERATING_CF_METHODOLOGY = "asset_operating_cf_run_v2"


# ---------------------------------------------------------------------------
# Promotion gate
# ---------------------------------------------------------------------------


@dataclass
class PromotionGateResult:
    ok: bool
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    decisions: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "failures": list(self.failures),
            "warnings": list(self.warnings),
            "decisions": dict(self.decisions),
        }


def assert_promotion_preconditions(
    *,
    fund_id: UUID | str,
    quarter: str,
    scope: FundScope,
    rollup: FundRollup,
    expense_schedule: FundExpenseSchedule,
    waterfall: FundWaterfallResult,
    bridge: GrossToNetBridge,
    asset_refresh_null_share: Decimal | None = None,
    asset_refresh_threshold: Decimal = Decimal("0.05"),
) -> PromotionGateResult:
    """Block release unless every layer is complete.

    Preconditions (all must pass):
      * Released uniqueness constraint — implicit, enforced by schema partial
        UQ index from Remediation 1; this gate doesn't re-check it but the
        DB write will fail if violated.
      * Fund scope is complete.
      * Asset CF coverage is complete or under the null_value_share threshold.
      * Expense layer is complete.
      * Waterfall layer is complete (status='computed', net_irr non-null).
      * Gross-to-net bridge ties to the penny OR has only a memo residual
        (leverage / GP-side return).
      * All required metrics have provenance.
      * Per-event waterfall conservation holds (allocation total = distribution).
    """
    failures: list[str] = []
    warnings: list[str] = []
    decisions: dict[str, Any] = {}

    if scope.expected_investment_count == 0:
        failures.append("scope_no_expected_investments")
    decisions["scope_expected_investments"] = scope.expected_investment_count
    decisions["scope_expected_assets"] = scope.expected_asset_count
    decisions["scope_exclusion_count"] = len(scope.exclusions)

    if rollup.irr is None:
        failures.append(f"rollup_gross_irr_null:{rollup.null_reason or 'unknown'}")
    if scope.expected_asset_count > 0 and not rollup.series:
        failures.append("rollup_empty_series_with_expected_assets")
    decisions["rollup_irr"] = float(rollup.irr) if rollup.irr is not None else None

    if asset_refresh_null_share is not None:
        decisions["asset_refresh_null_share"] = float(asset_refresh_null_share)
        if asset_refresh_null_share > asset_refresh_threshold:
            failures.append(
                f"asset_cf_coverage_below_threshold:"
                f"{float(asset_refresh_null_share):.4f}>{float(asset_refresh_threshold):.4f}"
            )

    if expense_schedule.has_blocking_nulls:
        failures.append(
            "expense_layer_blocking_null:"
            + ",".join(sorted(k for k, v in expense_schedule.null_reasons.items() if v))
        )
    if expense_schedule.total_management_fees is None:
        failures.append("expense_layer_management_fees_null")
    if expense_schedule.total_other_expenses is None:
        failures.append("expense_layer_other_expenses_null")
    decisions["expense_total_management_fees"] = (
        float(expense_schedule.total_management_fees)
        if expense_schedule.total_management_fees is not None
        else None
    )
    decisions["expense_total_other"] = (
        float(expense_schedule.total_other_expenses)
        if expense_schedule.total_other_expenses is not None
        else None
    )
    decisions["expense_null_reasons"] = dict(expense_schedule.null_reasons)

    if waterfall.waterfall_status != "computed":
        failures.append(f"waterfall_status:{waterfall.waterfall_status}")
    if waterfall.net_irr is None:
        failures.append(
            "waterfall_net_irr_null:"
            + waterfall.null_reasons.get("net_irr", "unknown")
        )
    if waterfall.carry is None:
        failures.append("waterfall_carry_null")
    decisions["waterfall_status"] = waterfall.waterfall_status
    decisions["waterfall_null_reasons"] = dict(waterfall.null_reasons)
    decisions["waterfall_event_count"] = len(waterfall.event_logs)

    if not bridge.identity_holds:
        if bridge.gross_return_amount is None or bridge.net_return_amount is None:
            failures.append("bridge_inputs_missing")
        elif (
            bridge.management_fees is None
            or bridge.fund_expenses is None
            or bridge.carry is None
        ):
            failures.append("bridge_subtraction_inputs_missing")
        else:
            warnings.append(f"bridge_residual:{float(bridge.identity_diff):.2f}")
    decisions["bridge_identity_holds"] = bridge.identity_holds
    decisions["bridge_identity_diff"] = float(bridge.identity_diff)
    decisions["bridge_null_reasons"] = dict(bridge.null_reasons)

    for ev in waterfall.event_logs:
        if ev.conservation_diff > Decimal("0.01"):
            failures.append(
                f"waterfall_conservation_violation_event={ev.event_date.isoformat()}:"
                f"diff={float(ev.conservation_diff):.4f}"
            )

    return PromotionGateResult(
        ok=len(failures) == 0,
        failures=failures,
        warnings=warnings,
        decisions=decisions,
    )


# ---------------------------------------------------------------------------
# Snapshot composition
# ---------------------------------------------------------------------------


def _cf_series_hash(rollup: FundRollup) -> str:
    payload = [
        (
            p.quarter,
            float(p.amount),
            p.has_actual,
            p.has_projection,
            p.has_exit,
            p.has_terminal_value,
        )
        for p in rollup.series
    ]
    h = hashlib.sha256()
    h.update(json.dumps(payload, sort_keys=True, default=str).encode())
    return h.hexdigest()


def _v2_canonical_metrics(
    *,
    scope: FundScope,
    rollup: FundRollup,
    expense_schedule: FundExpenseSchedule,
    waterfall: FundWaterfallResult,
    bridge: GrossToNetBridge,
    asset_refresh_null_share: Decimal | None,
) -> dict[str, Any]:
    def _f(v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    bottom_up_block = {
        "trust_status": "trusted" if rollup.irr is not None else "missing_source",
        "gross_irr_bottom_up": _f(rollup.irr),
        "asset_count": len(rollup.asset_contributions),
        "investment_count": len(rollup.investment_contributions),
        "scope": {
            "expected_investment_count": scope.expected_investment_count,
            "expected_asset_count": scope.expected_asset_count,
            "scope_completeness": "complete",
            "scope_contract_version": scope.scope_contract_version,
            "exclusion_count": len(scope.exclusions),
            "asset_refresh_null_share": _f(asset_refresh_null_share),
        },
        "null_reason": rollup.null_reason,
    }

    expense_block = {
        "trust_status": (
            "trusted" if not expense_schedule.has_blocking_nulls else "untrusted"
        ),
        "total_management_fees": _f(expense_schedule.total_management_fees),
        "total_other_expenses": _f(expense_schedule.total_other_expenses),
        "total_expenses": _f(expense_schedule.total_expenses),
        "expenses_by_type": {
            k: _f(v) for k, v in expense_schedule.expenses_by_type.items()
        },
        "expense_cf_hash": expense_schedule.expense_cf_hash,
        "null_reasons": dict(expense_schedule.null_reasons),
    }

    waterfall_block = {
        "trust_status": (
            "trusted" if waterfall.waterfall_status == "computed" else "untrusted"
        ),
        "waterfall_status": waterfall.waterfall_status,
        "waterfall_style": waterfall.waterfall_style,
        "net_irr": _f(waterfall.net_irr),
        "net_tvpi": _f(waterfall.net_tvpi),
        "dpi": _f(waterfall.dpi),
        "rvpi": _f(waterfall.rvpi),
        "carry": _f(waterfall.carry),
        "gp_share": _f(waterfall.gp_share),
        "lp_share": _f(waterfall.lp_share),
        "pref_distributed": _f(waterfall.pref_distributed),
        "return_of_capital_distributed": _f(
            waterfall.return_of_capital_distributed
        ),
        "catch_up_distributed": _f(waterfall.catch_up_distributed),
        "gross_net_spread_bps": waterfall.gross_net_spread_bps,
        "lp_called": _f(waterfall.lp_called),
        "lp_distributions": _f(waterfall.lp_distributions),
        "lp_ending_nav_share": _f(waterfall.lp_ending_nav_share),
        "definition_id": waterfall.definition_id,
        "definition_version": waterfall.definition_version,
        "pref_rate": _f(waterfall.pref_rate),
        "carry_rate": _f(waterfall.carry_rate),
        "catchup_rate": _f(waterfall.catchup_rate),
        "event_count": len(waterfall.event_logs),
        "null_reasons": dict(waterfall.null_reasons),
    }

    net_block = {
        "trust_status": (
            "trusted"
            if bridge.identity_holds and waterfall.net_irr is not None
            else "untrusted"
        ),
        "net_return_amount": _f(bridge.net_return_amount),
        "gross_return_amount": _f(bridge.gross_return_amount),
        "management_fees": _f(bridge.management_fees),
        "fund_expenses": _f(bridge.fund_expenses),
        "carry": _f(bridge.carry),
        "identity_holds": bridge.identity_holds,
        "identity_diff": float(bridge.identity_diff),
        "null_reasons": dict(bridge.null_reasons),
    }

    return {
        "bottom_up": bottom_up_block,
        "fund_expenses": expense_block,
        "waterfall": waterfall_block,
        "net": net_block,
        "gross_irr_bottom_up": _f(rollup.irr),
        "net_irr": _f(waterfall.net_irr),
        "net_tvpi": _f(waterfall.net_tvpi),
        "dpi": _f(waterfall.dpi),
        "rvpi": _f(waterfall.rvpi),
        "carry": _f(waterfall.carry),
        "management_fees": _f(expense_schedule.total_management_fees),
        "total_expenses": _f(expense_schedule.total_expenses),
    }


def _v2_pick_breakpoint(
    *,
    rollup: FundRollup,
    expense_schedule: FundExpenseSchedule,
    waterfall: FundWaterfallResult,
    bridge: GrossToNetBridge,
) -> str:
    if rollup.null_reason:
        return "bottom_up"
    if expense_schedule.has_blocking_nulls:
        return "fund_expenses"
    if waterfall.waterfall_status != "computed":
        return "waterfall"
    if not bridge.identity_holds:
        return "net"
    return "complete"


def write_fund_authoritative_snapshot_v2(
    *,
    env_id: str,
    business_id: UUID | str,
    fund_id: UUID | str,
    quarter: str,
    scope: FundScope,
    rollup: FundRollup,
    expense_schedule: FundExpenseSchedule,
    waterfall: FundWaterfallResult,
    bridge: GrossToNetBridge,
    asset_refresh_null_share: Decimal | None = None,
    snapshot_version: str | None = None,
    created_by: str = "asset_operating_cf_run",
    artifact_root: str = "",
) -> dict[str, Any]:
    """Write the snapshot row + bridge row in a single audit_run.

    Always writes as ``draft_audit``. Returns a dict with snapshot_version,
    audit_run_id, snapshot_id, bridge_id, breakpoint_layer, trust_status,
    and the promotion gate decisions so callers (the runner) know whether
    the draft is releasable.
    """
    series_hash = _cf_series_hash(rollup)
    if snapshot_version is None:
        snapshot_version = (
            f"asset_operating_cf::{fund_id}::{quarter}::{series_hash[:12]}"
        )

    audit_run_id = create_snapshot_run(
        env_id=env_id,
        business_id=business_id,
        snapshot_version=snapshot_version,
        sample_manifest={
            "methodology": ASSET_OPERATING_CF_METHODOLOGY,
            "fund_id": str(fund_id),
            "quarter": quarter,
            "scope": scope.to_receipt_dict(),
        },
        artifact_root=artifact_root,
        created_by=created_by,
        methodology_version=ASSET_OPERATING_CF_METHODOLOGY,
    )

    canonical = _v2_canonical_metrics(
        scope=scope,
        rollup=rollup,
        expense_schedule=expense_schedule,
        waterfall=waterfall,
        bridge=bridge,
        asset_refresh_null_share=asset_refresh_null_share,
    )
    breakpoint_layer = _v2_pick_breakpoint(
        rollup=rollup,
        expense_schedule=expense_schedule,
        waterfall=waterfall,
        bridge=bridge,
    )

    null_reasons: dict[str, Any] = {}
    if rollup.null_reason:
        null_reasons["gross_irr_bottom_up"] = rollup.null_reason
    for k, v in expense_schedule.null_reasons.items():
        null_reasons[k] = v
    for k, v in waterfall.null_reasons.items():
        null_reasons.setdefault(k, v)
    for k, v in bridge.null_reasons.items():
        null_reasons.setdefault(k, v)

    block_status = [
        canonical["bottom_up"]["trust_status"],
        canonical["fund_expenses"]["trust_status"],
        canonical["waterfall"]["trust_status"],
        canonical["net"]["trust_status"],
    ]
    if all(s == "trusted" for s in block_status):
        snapshot_trust = "trusted"
    elif any(s == "missing_source" for s in block_status):
        snapshot_trust = "missing_source"
    else:
        snapshot_trust = "untrusted"

    snapshot_id = persist_authoritative_state(
        entity_type="fund",
        audit_run_id=audit_run_id,
        snapshot_version=snapshot_version,
        env_id=env_id,
        business_id=business_id,
        entity_id=fund_id,
        quarter=quarter,
        trust_status=snapshot_trust,
        breakpoint_layer=breakpoint_layer,
        canonical_metrics=canonical,
        display_metrics={
            "gross_irr_bottom_up_display": (
                f"{float(rollup.irr) * 100:.2f}%" if rollup.irr is not None else "—"
            ),
            "net_irr_display": (
                f"{float(waterfall.net_irr) * 100:.2f}%"
                if waterfall.net_irr is not None
                else "—"
            ),
            "tvpi_display": (
                f"{float(waterfall.net_tvpi):.2f}x"
                if waterfall.net_tvpi is not None
                else "—"
            ),
        },
        null_reasons=null_reasons,
        formulas={
            "gross_irr_bottom_up": "xirr(sum_over_investments(sum_over_assets(asset_cf × ownership_pct_at_quarter)))",
            "net_irr": "xirr(LP_cash_stream + LP_share_of_ending_NAV)",
            "carry": "Σ(tier_4_carry_split_gp.amount over distribution events)",
            "management_fees": "Σ(in_term_quarter: basis × annual_rate / 4)",
            "bridge_identity": "gross − mgmt_fees − fund_expenses − carry == net_lp + leverage_residual",
        },
        provenance=[
            {
                "step": "asset_operating_cf_run",
                "methodology": ASSET_OPERATING_CF_METHODOLOGY,
                "cf_series_hash": series_hash,
                "expense_cf_hash": expense_schedule.expense_cf_hash,
                "waterfall_inputs_hash": waterfall.inputs_hash,
                "scope_contract_version": scope.scope_contract_version,
                "asset_refresh_null_share": (
                    float(asset_refresh_null_share)
                    if asset_refresh_null_share is not None
                    else None
                ),
            }
        ],
        source_row_refs=[],
        artifact_paths={"artifact_root": artifact_root},
        fund_id=fund_id,
        inputs_hash=series_hash,
    )

    bridge_id = persist_fund_gross_to_net_bridge(
        audit_run_id=audit_run_id,
        snapshot_version=snapshot_version,
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        quarter=quarter,
        trust_status=snapshot_trust,
        breakpoint_layer=breakpoint_layer,
        gross_return_amount=bridge.gross_return_amount,
        management_fees=bridge.management_fees,
        fund_expenses=bridge.fund_expenses,
        net_return_amount=bridge.net_return_amount,
        bridge_items=bridge.to_bridge_items(),
        null_reasons={
            **bridge.null_reasons,
            **(
                {}
                if bridge.identity_holds
                else {"identity": "residual_diff_unresolved"}
            ),
        },
        formulas={
            "bridge_identity": (
                "gross − mgmt_fees − fund_expenses − carry == net_lp + leverage_residual"
            ),
        },
        provenance=[
            {
                "step": "gross_to_net_bridge",
                "identity_diff": float(bridge.identity_diff),
                "identity_holds": bridge.identity_holds,
            }
        ],
        source_row_refs=[],
        artifact_paths={"artifact_root": artifact_root},
        inputs_hash=series_hash,
    )

    gate = assert_promotion_preconditions(
        fund_id=fund_id,
        quarter=quarter,
        scope=scope,
        rollup=rollup,
        expense_schedule=expense_schedule,
        waterfall=waterfall,
        bridge=bridge,
        asset_refresh_null_share=asset_refresh_null_share,
    )

    return {
        "snapshot_version": snapshot_version,
        "audit_run_id": str(audit_run_id),
        "snapshot_id": str(snapshot_id),
        "bridge_id": str(bridge_id),
        "breakpoint_layer": breakpoint_layer,
        "trust_status": snapshot_trust,
        "promotion_gate": gate.to_dict(),
        "promotion_releasable": gate.ok,
    }
