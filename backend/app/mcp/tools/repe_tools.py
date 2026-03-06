"""REPE portfolio data MCP tools — exposes fund/deal/asset queries to the AI Gateway."""
from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, AuditPolicy, registry
from app.mcp.schemas.repe_tools import (
    ListFundsInput,
    GetFundInput,
    ListDealsInput,
    ListAssetsInput,
    GetAssetInput,
)
from app.services import repe


def _serialize(obj):
    """Convert non-serializable types (UUID, date, Decimal) to JSON-safe values."""
    from decimal import Decimal
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        return str(obj)
    if hasattr(obj, "hex"):
        return str(obj)
    return obj


def _list_funds(ctx: McpContext, inp: ListFundsInput) -> dict:
    funds = repe.list_funds(business_id=inp.business_id)
    return {"funds": _serialize(funds), "total": len(funds)}


def _get_fund(ctx: McpContext, inp: GetFundInput) -> dict:
    fund, terms = repe.get_fund(fund_id=inp.fund_id)
    return {"fund": _serialize(fund), "terms": _serialize(terms)}


def _list_deals(ctx: McpContext, inp: ListDealsInput) -> dict:
    deals = repe.list_deals(fund_id=inp.fund_id)
    return {"deals": _serialize(deals), "total": len(deals)}


def _list_assets(ctx: McpContext, inp: ListAssetsInput) -> dict:
    assets = repe.list_assets(deal_id=inp.deal_id)
    return {"assets": _serialize(assets), "total": len(assets)}


def _get_asset(ctx: McpContext, inp: GetAssetInput) -> dict:
    asset, details = repe.get_asset(asset_id=inp.asset_id)
    return {"asset": _serialize(asset), "details": _serialize(details)}


def register_repe_tools() -> None:
    policy = AuditPolicy(redact_keys=[], max_input_bytes_to_log=5000, max_output_bytes_to_log=10000)

    registry.register(ToolDef(
        name="repe.list_funds",
        description=(
            "List all funds for a business. Returns fund_id, name, vintage_year, strategy, "
            "status, and target_size for each fund. Use this to answer questions about the "
            "portfolio, such as 'which funds do we have' or 'give me a rundown of our funds'."
        ),
        module="repe",
        permission="read",
        input_model=ListFundsInput,
        audit_policy=policy,
        handler=_list_funds,
    ))
    registry.register(ToolDef(
        name="repe.get_fund",
        description=(
            "Get detailed information about a specific fund including terms "
            "(management fee rate, preferred return, carry rate, waterfall style)."
        ),
        module="repe",
        permission="read",
        input_model=GetFundInput,
        audit_policy=policy,
        handler=_get_fund,
    ))
    registry.register(ToolDef(
        name="repe.list_deals",
        description=(
            "List all deals/investments in a fund. Returns deal_id, name, deal_type, "
            "stage, sponsor for each deal."
        ),
        module="repe",
        permission="read",
        input_model=ListDealsInput,
        audit_policy=policy,
        handler=_list_deals,
    ))
    registry.register(ToolDef(
        name="repe.list_assets",
        description=(
            "List all assets under a specific deal. Returns asset_id, name, asset_type."
        ),
        module="repe",
        permission="read",
        input_model=ListAssetsInput,
        audit_policy=policy,
        handler=_list_assets,
    ))
    registry.register(ToolDef(
        name="repe.get_asset",
        description=(
            "Get detailed information about a specific asset including property details "
            "(units, market, current_noi, occupancy_rate, cap_rate) or CMBS details."
        ),
        module="repe",
        permission="read",
        input_model=GetAssetInput,
        audit_policy=policy,
        handler=_get_asset,
    ))
