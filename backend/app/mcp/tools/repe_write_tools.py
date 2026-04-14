"""REPE asset write MCP tools — balanced-books mutation surface.

Exposes six tools for editing Meridian asset financials and managing
entities. All writes enforce balanced-books invariants (NOI and net cash
flow are always computed from ingredients, never set directly).

Tools:
  repe.asset.read_pnl        — read current P&L for an asset/quarter
  repe.asset.preview_change  — preview impact of changes without writing
  repe.asset.set_operating   — apply operating line-item overrides (confirm required)
  repe.fund.rebuild_metrics  — recompute fund IRR after edits (confirm required)
  repe.entity.add_asset      — add a new asset and link to a fund (confirm required)
  repe.entity.deactivate_asset — mark an asset as disposed (confirm required)
"""
from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repe_write_tools import (
    ReadPnlInput,
    PreviewChangeInput,
    SetOperatingInput,
    RebuildMetricsInput,
    AddAssetInput,
    DeactivateAssetInput,
)
from app.services import re_write_engine as eng


# ── Handlers ───────────────────────────────────────────────────────────────────


def _read_pnl(ctx: McpContext, inp: ReadPnlInput) -> dict:
    """Read current P&L for an asset/quarter."""
    return eng.read_asset_pnl(asset_id=inp.asset_id, quarter=inp.quarter)


def _preview_change(ctx: McpContext, inp: PreviewChangeInput) -> dict:
    """Preview P&L impact of proposed changes — read-only, no writes."""
    overrides = {
        k: v for k, v in {
            "revenue": inp.revenue,
            "other_income": inp.other_income,
            "opex": inp.opex,
            "capex": inp.capex,
            "debt_service": inp.debt_service,
            "leasing_costs": inp.leasing_costs,
            "tenant_improvements": inp.tenant_improvements,
            "free_rent": inp.free_rent,
            "occupancy": inp.occupancy,
        }.items()
        if v is not None
    }
    return eng.preview_change(
        asset_id=inp.asset_id,
        quarter=inp.quarter,
        overrides=overrides,
    )


def _set_operating(ctx: McpContext, inp: SetOperatingInput) -> dict:
    """Apply operating line-item overrides for an asset/quarter.

    Pass confirm=true to execute. Without confirm, returns a preview only.
    NOI and cash flow are computed from ingredients — they cannot be set directly.
    """
    overrides = {
        k: v for k, v in {
            "revenue": inp.revenue,
            "other_income": inp.other_income,
            "opex": inp.opex,
            "capex": inp.capex,
            "debt_service": inp.debt_service,
            "leasing_costs": inp.leasing_costs,
            "tenant_improvements": inp.tenant_improvements,
            "free_rent": inp.free_rent,
            "occupancy": inp.occupancy,
        }.items()
        if v is not None
    }
    return eng.set_operating(
        asset_id=inp.asset_id,
        quarter=inp.quarter,
        overrides=overrides,
        reason=inp.reason,
        confirm=inp.confirm,
    )


def _rebuild_metrics(ctx: McpContext, inp: RebuildMetricsInput) -> dict:
    """Recompute bottom-up IRR for all assets in a fund after operating edits.

    Pass confirm=true to execute. Returns refreshed asset count and fund IRR.
    """
    return eng.rebuild_fund_metrics(
        fund_id=inp.fund_id,
        env_id=inp.env_id,
        business_id=inp.business_id,
        as_of_quarter=inp.as_of_quarter,
        confirm=inp.confirm,
    )


def _add_asset(ctx: McpContext, inp: AddAssetInput) -> dict:
    """Add a new asset, create a deal record, and link it to a fund.

    Seeds a zero operating row for the acquisition quarter.
    Use repe.asset.set_operating afterwards to populate line items.
    Pass confirm=true to execute.
    """
    return eng.add_asset(
        env_id=inp.env_id,
        business_id=inp.business_id,
        fund_id=inp.fund_id,
        name=inp.name,
        asset_type=inp.asset_type,
        acquisition_quarter=inp.acquisition_quarter,
        acquisition_cost=inp.acquisition_cost,
        ownership_pct=inp.ownership_pct,
        city=inp.city,
        state_code=inp.state,
        confirm=inp.confirm,
    )


def _deactivate_asset(ctx: McpContext, inp: DeactivateAssetInput) -> dict:
    """Mark an asset as disposed/exited.

    Historical operating data and CF series are preserved.
    Pass confirm=true to execute.
    """
    return eng.deactivate_asset(
        asset_id=inp.asset_id,
        fund_id=inp.fund_id,
        reason=inp.reason,
        confirm=inp.confirm,
    )


# ── Registration ───────────────────────────────────────────────────────────────


def register_repe_write_tools():
    """Register REPE asset write tools."""

    registry.register(ToolDef(
        name="repe.asset.read_pnl",
        description=(
            "Read current operating P&L for a REPE asset in a specific quarter. "
            "Returns revenue, other_income, EGI, opex, NOI, capex, debt_service, "
            "leasing_costs, tenant_improvements, free_rent, net_cash_flow, and occupancy. "
            "NOI = EGI - opex. Net CF = NOI - capex - debt_service - leasing_costs "
            "- tenant_improvements - free_rent."
        ),
        module="bm",
        permission="read",
        input_model=ReadPnlInput,
        handler=_read_pnl,
        tags=frozenset({"repe", "write", "asset", "pnl"}),
    ))

    registry.register(ToolDef(
        name="repe.asset.preview_change",
        description=(
            "Preview the P&L impact of proposed operating changes for a REPE asset/quarter. "
            "Returns before/after P&L and delta for NOI and net cash flow. "
            "Read-only — no writes. Pass only the fields you want to change; "
            "other fields are inherited from the current row."
        ),
        module="bm",
        permission="read",
        input_model=PreviewChangeInput,
        handler=_preview_change,
        tags=frozenset({"repe", "write", "asset", "pnl", "preview"}),
    ))

    registry.register(ToolDef(
        name="repe.asset.set_operating",
        description=(
            "Write operating line items for a REPE asset/quarter. "
            "Enforces balanced books: NOI and net cash flow are computed from ingredients "
            "and cannot be set directly. Pass only the fields to change; others are preserved. "
            "Sets source_type='manual_override'. "
            "Pass confirm=true to execute; without confirm returns preview only. "
            "After editing, call repe.fund.rebuild_metrics to recompute fund-level IRR."
        ),
        module="bm",
        permission="write",
        input_model=SetOperatingInput,
        handler=_set_operating,
        tags=frozenset({"repe", "write", "asset", "pnl", "mutation"}),
    ))

    registry.register(ToolDef(
        name="repe.fund.rebuild_metrics",
        description=(
            "Rebuild bottom-up cash flow series and recompute fund gross IRR after "
            "operating edits. Refreshes re_asset_cf_series_mat for all assets in the fund "
            "and runs the investment/fund rollup. "
            "Pass confirm=true to execute."
        ),
        module="bm",
        permission="write",
        input_model=RebuildMetricsInput,
        handler=_rebuild_metrics,
        tags=frozenset({"repe", "write", "fund", "irr", "metrics"}),
    ))

    registry.register(ToolDef(
        name="repe.entity.add_asset",
        description=(
            "Add a new REPE asset and link it to a fund. "
            "Creates a repe_deal, repe_asset, and repe_fund_entity_link record, "
            "plus a seed re_asset_operating_qtr row for the acquisition quarter. "
            "Use repe.asset.set_operating to populate the operating line items afterwards. "
            "Pass confirm=true to execute."
        ),
        module="bm",
        permission="write",
        input_model=AddAssetInput,
        handler=_add_asset,
        tags=frozenset({"repe", "write", "entity", "asset", "mutation"}),
    ))

    registry.register(ToolDef(
        name="repe.entity.deactivate_asset",
        description=(
            "Mark a REPE asset as disposed/exited. "
            "Historical operating data and cash flow series are preserved. "
            "The asset is removed from the active fund roll. "
            "Call repe.fund.rebuild_metrics afterwards to update fund-level metrics. "
            "Pass confirm=true to execute."
        ),
        module="bm",
        permission="write",
        input_model=DeactivateAssetInput,
        handler=_deactivate_asset,
        tags=frozenset({"repe", "write", "entity", "mutation"}),
    ))
