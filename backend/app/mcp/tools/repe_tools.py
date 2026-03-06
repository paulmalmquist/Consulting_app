"""REPE portfolio data MCP tools — exposes fund/deal/asset queries to the AI Gateway."""
from __future__ import annotations

from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import AuditPolicy, ToolDef, registry
from app.mcp.schemas.repe_tools import (
    GetAssetInput,
    GetEnvironmentSnapshotInput,
    GetFundInput,
    ListAssetsInput,
    ListDealsInput,
    ListFundsInput,
    ResolvedScopeInput,
    ToolScopeInput,
)
from app.services import repe
from app.services.assistant_environment import get_environment_snapshot


def _serialize(obj):
    """Convert non-serializable types (UUID, date, Decimal) to JSON-safe values."""
    from decimal import Decimal

    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, "isoformat"):
        return str(obj)
    if hasattr(obj, "hex"):
        return str(obj)
    return obj


def _scope_model(inp) -> ResolvedScopeInput | ToolScopeInput | None:
    return getattr(inp, "resolved_scope", None) or getattr(inp, "scope", None)


def _ctx_scope(ctx: McpContext) -> dict:
    return ctx.resolved_scope or {}


def _scope_value(inp, ctx: McpContext, *keys: str):
    scope = _scope_model(inp)
    for key in keys:
        value = getattr(inp, key, None)
        if value is not None:
            return value
        if scope is not None:
            nested_value = getattr(scope, key, None)
            if nested_value is not None:
                return nested_value
        ctx_value = _ctx_scope(ctx).get(key)
        if ctx_value is not None:
            return ctx_value
    return None


def _scope_entity_type(inp, ctx: McpContext) -> str | None:
    scope = _scope_model(inp)
    value = getattr(scope, "entity_type", None) if scope is not None else None
    return value or _ctx_scope(ctx).get("entity_type")


def _scope_entity_id(inp, ctx: McpContext):
    scope = _scope_model(inp)
    value = getattr(scope, "entity_id", None) if scope is not None else None
    return value or _ctx_scope(ctx).get("entity_id")


def _uuid_or_none(value) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def _require_uuid(value, label: str) -> UUID:
    resolved = _uuid_or_none(value)
    if resolved is None:
        raise ValueError(f"{label} is required")
    return resolved


def _resolve_business_id(inp, ctx: McpContext) -> UUID:
    return _require_uuid(_scope_value(inp, ctx, "business_id"), "business_id")


def _resolve_environment_id(inp, ctx: McpContext) -> UUID:
    return _require_uuid(_scope_value(inp, ctx, "environment_id"), "environment_id")


def _resolve_fund_id(inp, ctx: McpContext) -> UUID:
    fund_id = _scope_value(inp, ctx, "fund_id")
    if fund_id is not None:
        return _require_uuid(fund_id, "fund_id")
    if _scope_entity_type(inp, ctx) == "fund":
        return _require_uuid(_scope_entity_id(inp, ctx), "fund_id")
    raise ValueError("fund_id is required")


def _resolve_asset_id(inp, ctx: McpContext) -> UUID:
    asset_id = _scope_value(inp, ctx, "asset_id")
    if asset_id is not None:
        return _require_uuid(asset_id, "asset_id")
    if _scope_entity_type(inp, ctx) == "asset":
        return _require_uuid(_scope_entity_id(inp, ctx), "asset_id")
    raise ValueError("asset_id is required")


def _resolve_deal_id(inp, ctx: McpContext) -> UUID | None:
    deal_id = _scope_value(inp, ctx, "deal_id")
    if deal_id is not None:
        return _require_uuid(deal_id, "deal_id")
    entity_type = _scope_entity_type(inp, ctx)
    if entity_type in {"investment", "deal"}:
        return _require_uuid(_scope_entity_id(inp, ctx), "deal_id")
    return None


def _list_funds(ctx: McpContext, inp: ListFundsInput) -> dict:
    business_id = _resolve_business_id(inp, ctx)
    funds = repe.list_funds(business_id=business_id)
    return {"funds": _serialize(funds), "total": len(funds)}


def _get_fund(ctx: McpContext, inp: GetFundInput) -> dict:
    fund_id = _resolve_fund_id(inp, ctx)
    fund, terms = repe.get_fund(fund_id=fund_id)
    return {"fund": _serialize(fund), "terms": _serialize(terms)}


def _list_deals(ctx: McpContext, inp: ListDealsInput) -> dict:
    fund_id = _resolve_fund_id(inp, ctx)
    deals = repe.list_deals(fund_id=fund_id)
    return {"deals": _serialize(deals), "total": len(deals)}


def _list_assets(ctx: McpContext, inp: ListAssetsInput) -> dict:
    deal_id = _resolve_deal_id(inp, ctx)
    if deal_id is not None:
        assets = repe.list_assets(deal_id=deal_id)
        return {"assets": _serialize(assets), "total": len(assets)}

    fund_id = _scope_value(inp, ctx, "fund_id")
    if fund_id is None and _scope_entity_type(inp, ctx) == "fund":
        fund_id = _scope_entity_id(inp, ctx)
    fund_uuid = _uuid_or_none(fund_id)
    if fund_uuid is None:
        raise ValueError("deal_id or fund_id is required")

    deals = repe.list_deals(fund_id=fund_uuid)
    assets: list[dict] = []
    for deal in deals:
        for asset in repe.list_assets(deal_id=UUID(str(deal["deal_id"]))):
            assets.append(
                {
                    **asset,
                    "deal_id": deal["deal_id"],
                    "deal_name": deal.get("name"),
                    "fund_id": fund_uuid,
                }
            )
    return {"assets": _serialize(assets), "total": len(assets)}


def _get_asset(ctx: McpContext, inp: GetAssetInput) -> dict:
    asset_id = _resolve_asset_id(inp, ctx)
    asset, details = repe.get_asset(asset_id=asset_id)
    return {"asset": _serialize(asset), "details": _serialize(details)}


def _get_environment_snapshot(ctx: McpContext, inp: GetEnvironmentSnapshotInput) -> dict:
    env_id = _resolve_environment_id(inp, ctx)
    business_id = _resolve_business_id(inp, ctx)
    snapshot = get_environment_snapshot(
        env_id=env_id,
        business_id=business_id,
        quarter=inp.quarter,
        max_items=inp.max_items,
    )
    return _serialize(snapshot)


def register_repe_tools() -> None:
    policy = AuditPolicy(redact_keys=[], max_input_bytes_to_log=5000, max_output_bytes_to_log=10000)

    registry.register(
        ToolDef(
            name="repe.list_funds",
            description=(
                "List funds for the current business. No parameters required — "
                "business_id is auto-resolved from context. "
                "Do NOT pass fund_id values as business_id. "
                "Use this for questions like 'which funds do we have'."
            ),
            module="repe",
            permission="read",
            input_model=ListFundsInput,
            audit_policy=policy,
            handler=_list_funds,
        )
    )
    registry.register(
        ToolDef(
            name="repe.get_fund",
            description=(
                "Get detailed information about a fund. If fund_id is omitted, uses the current resolved fund scope."
            ),
            module="repe",
            permission="read",
            input_model=GetFundInput,
            audit_policy=policy,
            handler=_get_fund,
        )
    )
    registry.register(
        ToolDef(
            name="repe.list_deals",
            description=(
                "List all deals or investments in a fund. If fund_id is omitted, uses the current resolved fund scope."
            ),
            module="repe",
            permission="read",
            input_model=ListDealsInput,
            audit_policy=policy,
            handler=_list_deals,
        )
    )
    registry.register(
        ToolDef(
            name="repe.list_assets",
            description=(
                "List assets under a deal or across the current fund scope. "
                "Use this for prompts like 'show assets in this fund'."
            ),
            module="repe",
            permission="read",
            input_model=ListAssetsInput,
            audit_policy=policy,
            handler=_list_assets,
        )
    )
    registry.register(
        ToolDef(
            name="repe.get_asset",
            description=(
                "Get detailed information about an asset. If asset_id is omitted, uses the current resolved asset scope."
            ),
            module="repe",
            permission="read",
            input_model=GetAssetInput,
            audit_policy=policy,
            handler=_get_asset,
        )
    )
    registry.register(
        ToolDef(
            name="repe.get_environment_snapshot",
            description=(
                "Retrieve the current environment snapshot including funds, investments, assets, pipeline items, "
                "models, and key metrics. Use this first for environment-wide questions when the UI does not "
                "already show the answer."
            ),
            module="repe",
            permission="read",
            input_model=GetEnvironmentSnapshotInput,
            audit_policy=policy,
            handler=_get_environment_snapshot,
        )
    )
