"""REPE portfolio data MCP tools — exposes fund/deal/asset queries to the AI Gateway."""
from __future__ import annotations

from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import AuditPolicy, ToolDef, registry
from app.mcp.schemas.repe_tools import (
    CreateAssetInput,
    CreateDealInput,
    CreateFundInput,
    GetAssetInput,
    GetEnvironmentSnapshotInput,
    GetFundInput,
    ListAssetsInput,
    ListDealsInput,
    ListFundsInput,
    RankAssetsInput,
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


def _confirmation_summary(action: str, params: dict) -> dict:
    """Return a pending_confirmation response — the tool refuses to execute without confirmed=true."""
    return {
        "pending_confirmation": True,
        "action": action,
        "summary": {k: v for k, v in params.items() if v is not None},
        "message": f"Ready to {action}. Call this tool again with confirmed=true to execute.",
    }


def _create_fund(ctx: McpContext, inp: CreateFundInput) -> dict:
    # Collect all provided values and detect missing required fields
    provided = {k: v for k, v in {
        "name": inp.name,
        "vintage_year": inp.vintage_year,
        "fund_type": inp.fund_type,
        "strategy": inp.strategy,
        "status": inp.status,
        "sub_strategy": inp.sub_strategy,
        "target_size": inp.target_size,
        "term_years": inp.term_years,
        "base_currency": inp.base_currency,
    }.items() if v is not None}
    missing = [f for f in ("name", "vintage_year", "fund_type", "strategy") if provided.get(f) is None]
    if missing and not inp.confirmed:
        field_hints = {
            "name": "Fund name",
            "vintage_year": "Vintage year (e.g. 2024)",
            "fund_type": "Fund type: closed_end, open_end, sma, co_invest",
            "strategy": "Strategy: equity, debt",
        }
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": missing,
            "provided": {k: v for k, v in provided.items() if v is not None},
            "message": f"Missing required fields: {', '.join(field_hints[f] for f in missing)}. "
                       f"Already collected: {', '.join(f'{k}={v}' for k, v in provided.items()) or 'none'}.",
        }
    if not inp.confirmed:
        return _confirmation_summary("create fund", provided)
    if not inp.name:
        raise ValueError("Fund name is required to execute creation")
    if inp.vintage_year is None or inp.fund_type is None or inp.strategy is None:
        raise ValueError("vintage_year, fund_type, and strategy are required to execute creation")
    business_id = _resolve_business_id(inp, ctx)
    payload = {
        "name": inp.name,
        "vintage_year": inp.vintage_year,
        "fund_type": inp.fund_type,
        "strategy": inp.strategy,
        "status": inp.status,
        "sub_strategy": inp.sub_strategy,
        "target_size": inp.target_size,
        "term_years": inp.term_years,
        "base_currency": inp.base_currency,
    }
    fund = repe.create_fund(business_id=business_id, payload=payload)
    return {"fund": _serialize(fund), "created": True}


def _create_deal(ctx: McpContext, inp: CreateDealInput) -> dict:
    provided = {k: v for k, v in {
        "name": inp.name,
        "deal_type": inp.deal_type,
        "stage": inp.stage,
        "sponsor": inp.sponsor,
        "target_close_date": inp.target_close_date,
    }.items() if v is not None}
    missing = [f for f in ("name", "deal_type") if provided.get(f) is None]
    if missing and not inp.confirmed:
        field_hints = {
            "name": "Deal/investment name",
            "deal_type": "Deal type: equity, debt",
        }
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": missing,
            "provided": {k: v for k, v in provided.items() if v is not None},
            "message": f"Missing required fields: {', '.join(field_hints[f] for f in missing)}. "
                       f"Already collected: {', '.join(f'{k}={v}' for k, v in provided.items()) or 'none'}.",
        }
    if not inp.confirmed:
        return _confirmation_summary("create deal", provided)
    if not inp.name:
        raise ValueError("Deal name is required to execute creation")
    if inp.deal_type is None:
        raise ValueError("deal_type is required to execute creation")
    fund_id = _resolve_fund_id(inp, ctx)
    payload = {
        "name": inp.name,
        "deal_type": inp.deal_type,
        "stage": inp.stage,
        "sponsor": inp.sponsor,
        "target_close_date": inp.target_close_date,
    }
    deal = repe.create_deal(fund_id=fund_id, payload=payload)
    return {"deal": _serialize(deal), "created": True}


def _create_asset(ctx: McpContext, inp: CreateAssetInput) -> dict:
    provided = {k: v for k, v in {
        "name": inp.name,
        "asset_type": inp.asset_type,
        "property_type": inp.property_type,
        "units": inp.units,
        "market": inp.market,
        "current_noi": inp.current_noi,
        "occupancy": inp.occupancy,
    }.items() if v is not None}
    missing = [f for f in ("name",) if provided.get(f) is None]
    if missing and not inp.confirmed:
        return {
            "pending_confirmation": True,
            "needs_input": True,
            "missing_fields": missing,
            "provided": {k: v for k, v in provided.items() if v is not None},
            "message": f"Asset name is required. Already collected: {', '.join(f'{k}={v}' for k, v in provided.items()) or 'none'}.",
        }
    deal_id = _resolve_deal_id(inp, ctx)
    if deal_id is None:
        # Auto-resolve: if fund_id is available, look up deals under it
        fund_id = _scope_value(inp, ctx, "fund_id")
        if fund_id is None and _scope_entity_type(inp, ctx) == "fund":
            fund_id = _scope_entity_id(inp, ctx)
        if fund_id is not None:
            fund_uuid = _uuid_or_none(fund_id)
            if fund_uuid:
                deals = repe.list_deals(fund_id=fund_uuid)
                if len(deals) == 1:
                    deal_id = UUID(str(deals[0]["deal_id"]))
                elif len(deals) > 1:
                    deal_names = [f"- {d.get('name', 'unnamed')} (id: {d['deal_id']})" for d in deals[:10]]
                    return {
                        "pending_confirmation": True,
                        "needs_input": True,
                        "missing_fields": ["deal_id"],
                        "provided": provided,
                        "message": (
                            "Multiple investments exist under this fund. Which one should this asset belong to?\n"
                            + "\n".join(deal_names)
                        ),
                    }
                else:
                    return {
                        "pending_confirmation": True,
                        "needs_input": True,
                        "missing_fields": ["deal_id"],
                        "provided": provided,
                        "message": "No investments exist under this fund yet. Create an investment first, then add the asset to it.",
                    }
        if deal_id is None:
            raise ValueError("deal_id is required to create an asset — specify a fund or investment")
    if not inp.confirmed:
        return _confirmation_summary("create asset", provided)
    if not inp.name:
        raise ValueError("Asset name is required to execute creation")
    asset = repe.create_asset(deal_id=deal_id, payload={
        "name": inp.name,
        "asset_type": inp.asset_type,
        "property_type": inp.property_type,
        "units": inp.units,
        "market": inp.market,
        "current_noi": inp.current_noi,
        "occupancy": inp.occupancy,
    })
    return {"asset": _serialize(asset), "created": True}


_RANK_ALLOWED_METRICS = frozenset({
    "noi", "nav", "occupancy", "dscr", "ltv", "revenue", "asset_value"
})


def _rank_assets(ctx: McpContext, inp: RankAssetsInput) -> dict:
    from app.db import get_cursor

    business_id = _resolve_business_id(inp, ctx)
    metric = (inp.metric or "noi").lower()
    if metric not in _RANK_ALLOWED_METRICS:
        metric = "noi"
    sort_dir = "DESC" if inp.sort_dir != "asc" else "ASC"
    limit = max(1, min(inp.limit or 10, 100))

    with get_cursor() as cur:
        # Resolve latest available quarter if none supplied
        if inp.quarter:
            quarter = inp.quarter
        else:
            cur.execute(
                """
                SELECT MAX(qs.quarter) AS q
                FROM re_asset_quarter_state qs
                JOIN repe_asset a ON a.asset_id = qs.asset_id
                JOIN repe_deal  d ON d.deal_id  = a.deal_id
                JOIN repe_fund  f ON f.fund_id  = d.fund_id
                WHERE f.business_id = %s::uuid
                """,
                (str(business_id),),
            )
            row = cur.fetchone()
            quarter = row["q"] if row and row.get("q") else None

        if not quarter:
            return {
                "assets": [],
                "metric": metric,
                "quarter": None,
                "total": 0,
                "message": "No quarter state data found for this portfolio.",
            }

        fund_clause = ""
        params: list = [str(business_id), quarter]
        if inp.fund_id:
            fund_clause = "AND f.fund_id = %s::uuid"
            params.append(str(inp.fund_id))
        params.append(limit)

        # metric column validated against allowlist above — safe to interpolate
        cur.execute(
            f"""
            SELECT
                a.name              AS asset_name,
                a.property_type,
                a.market,
                qs.{metric}         AS metric_value,
                qs.noi,
                qs.occupancy,
                qs.asset_value,
                qs.quarter
            FROM re_asset_quarter_state qs
            JOIN repe_asset a ON a.asset_id = qs.asset_id
            JOIN repe_deal  d ON d.deal_id  = a.deal_id
            JOIN repe_fund  f ON f.fund_id  = d.fund_id
            WHERE f.business_id = %s::uuid
              AND qs.quarter = %s
              {fund_clause}
              AND qs.{metric} IS NOT NULL
            ORDER BY qs.{metric} {sort_dir}
            LIMIT %s
            """,
            params,
        )
        rows = cur.fetchall()

    return {
        "assets": _serialize(rows),
        "metric": metric,
        "sort_dir": inp.sort_dir,
        "quarter": quarter,
        "total": len(rows),
    }


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
            tags=frozenset({"repe", "core"}),
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
            tags=frozenset({"repe", "core"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.list_deals",
            description=(
                "List all deals (also called investments) in a fund. In this platform, 'deal' and 'investment' "
                "are the same entity — use this tool for either term. If fund_id is omitted, uses the current resolved fund scope."
            ),
            module="repe",
            permission="read",
            input_model=ListDealsInput,
            audit_policy=policy,
            handler=_list_deals,
            tags=frozenset({"repe", "core"}),
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
            tags=frozenset({"repe", "core"}),
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
            tags=frozenset({"repe", "core"}),
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
            tags=frozenset({"repe", "core"}),
        )
    )

    registry.register(
        ToolDef(
            name="repe.rank_assets",
            description=(
                "Rank portfolio assets by a chosen metric (noi, nav, occupancy, dscr, ltv, revenue, asset_value). "
                "Returns the top or bottom N assets for the specified or latest available quarter. "
                "Use for prompts like 'best performing assets', 'top assets by NOI', 'worst DSCR'."
            ),
            module="repe",
            permission="read",
            input_model=RankAssetsInput,
            audit_policy=policy,
            handler=_rank_assets,
            tags=frozenset({"repe", "core", "analysis", "ranking"}),
        )
    )

    # ── Write tools ───────────────────────────────────────────────────────
    write_policy = AuditPolicy(redact_keys=[], max_input_bytes_to_log=5000, max_output_bytes_to_log=5000)

    registry.register(
        ToolDef(
            name="repe.create_fund",
            description=(
                "Create a new fund in the current business. Requires name, vintage_year, fund_type, "
                "strategy, and status. Always confirm parameters with the user before calling."
            ),
            module="repe",
            permission="write",
            input_model=CreateFundInput,
            audit_policy=write_policy,
            handler=_create_fund,
            tags=frozenset({"repe", "core", "write"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.create_deal",
            description=(
                "Create a new deal/investment in a fund. Requires name, deal_type, and stage. "
                "fund_id is auto-resolved from scope. Always confirm parameters with the user before calling."
            ),
            module="repe",
            permission="write",
            input_model=CreateDealInput,
            audit_policy=write_policy,
            handler=_create_deal,
            tags=frozenset({"repe", "core", "write"}),
        )
    )
    registry.register(
        ToolDef(
            name="repe.create_asset",
            description=(
                "Create a new asset under a deal/investment. Requires name and asset_type. "
                "deal_id is auto-resolved from scope. Always confirm parameters with the user before calling."
            ),
            module="repe",
            permission="write",
            input_model=CreateAssetInput,
            audit_policy=write_policy,
            handler=_create_asset,
            tags=frozenset({"repe", "core", "write"}),
        )
    )
