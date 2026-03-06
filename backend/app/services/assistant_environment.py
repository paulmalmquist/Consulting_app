from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from app.services import re_env_portfolio, re_investment, re_model, re_pipeline, repe


def _as_uuid(value: UUID | str | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def _current_quarter() -> str:
    now = datetime.now(UTC)
    quarter = ((now.month - 1) // 3) + 1
    return f"{now.year}Q{quarter}"


def _serialize(obj):
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {key: _serialize(value) for key, value in obj.items()}
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, UUID):
        return str(obj)
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    return obj


def get_environment_snapshot(
    *,
    env_id: UUID | str,
    business_id: UUID | str,
    quarter: str | None = None,
    max_items: int = 25,
) -> dict:
    env_uuid = _as_uuid(env_id)
    business_uuid = _as_uuid(business_id)
    if env_uuid is None or business_uuid is None:
        raise ValueError("env_id and business_id are required")

    quarter_value = quarter or _current_quarter()
    try:
        funds = repe.list_funds(business_id=business_uuid)
    except Exception:
        funds = []

    investments: list[dict] = []
    assets: list[dict] = []
    investment_total = 0
    asset_total = 0

    for fund in funds:
        try:
            if investment_total < max_items or asset_total < max_items:
                fund_investments = re_investment.list_investments(fund_id=UUID(str(fund["fund_id"])))
                investment_total += len(fund_investments)
                if len(investments) < max_items:
                    remaining = max_items - len(investments)
                    investments.extend(fund_investments[:remaining])

                if len(assets) < max_items or asset_total < max_items:
                    for investment in fund_investments:
                        investment_assets = repe.list_assets(deal_id=UUID(str(investment["investment_id"])))
                        asset_total += len(investment_assets)
                        if len(assets) < max_items:
                            remaining_assets = max_items - len(assets)
                            assets.extend(investment_assets[:remaining_assets])
                        if len(assets) >= max_items and asset_total >= max_items:
                            break
        except Exception:
            continue

    try:
        pipeline_items = re_pipeline.list_deals(env_id=str(env_uuid))
    except Exception:
        pipeline_items = []

    try:
        models = re_model.list_models(env_id=env_uuid)
    except Exception:
        models = []

    try:
        key_metrics = re_env_portfolio.get_portfolio_kpis(
            env_id=env_uuid,
            business_id=business_uuid,
            quarter=quarter_value,
        )
    except Exception:
        key_metrics = {}

    return {
        "environment_id": str(env_uuid),
        "business_id": str(business_uuid),
        "quarter": quarter_value,
        "funds": _serialize(funds[:max_items]),
        "fund_count": len(funds),
        "investments": _serialize(investments[:max_items]),
        "investment_count": investment_total,
        "assets": _serialize(assets[:max_items]),
        "asset_count": asset_total,
        "pipeline_items": _serialize(pipeline_items[:max_items]),
        "pipeline_count": len(pipeline_items),
        "models": _serialize(models[:max_items]),
        "model_count": len(models),
        "key_metrics": _serialize(key_metrics),
        "truncated": {
            "funds": len(funds) > max_items,
            "investments": investment_total > max_items,
            "assets": asset_total > max_items,
            "pipeline_items": len(pipeline_items) > max_items,
            "models": len(models) > max_items,
        },
    }
