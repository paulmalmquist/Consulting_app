"""Backend scoring engine for pipeline radar views."""
from __future__ import annotations

from typing import Any

from app.services import re_pipeline


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _percent(value: Any, fallback: float = 0.0) -> float:
    if value is None:
        return fallback
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return fallback
    if -1 <= numeric <= 1:
        return numeric * 100
    return numeric


def compute_deal_score(deal: dict, market: dict, sponsor: dict) -> dict:
    irr_upside = _percent(deal.get("target_irr"), 12.0)
    asking_cap = _percent(market.get("market_cap_rate"), 5.5)
    cap_rate_compression = _clamp((asking_cap - 4.5) * 10, 0, 100)
    noi_growth_runway = _clamp(50 + (_percent(market.get("employment_growth_pct"), 1.5) * 6), 0, 100)
    sponsor_track_record = _clamp(float(sponsor.get("track_record_score") or 55), 0, 100)

    opportunity = (
        irr_upside * 0.30
        + cap_rate_compression * 0.20
        + noi_growth_runway * 0.25
        + sponsor_track_record * 0.25
    )

    leverage_ratio = 0.0
    headline_price = float(deal.get("headline_price") or 0)
    equity_required = float(deal.get("equity_required") or 0)
    if headline_price > 0:
        leverage_ratio = _clamp((1 - (equity_required / headline_price)) * 100, 0, 100)

    market_vacancy = _percent(market.get("vacancy_rate"), 6.0)
    construction_risk = float(deal.get("construction_risk") or 20)
    geo_risk = float(market.get("geo_risk_score") or 50)
    deal_stage = str(deal.get("status") or "").lower()
    deal_stage_earliness = {
        "sourced": 85,
        "screening": 70,
        "loi": 55,
        "dd": 42,
        "ic": 28,
        "closing": 16,
        "closed": 8,
    }.get(deal_stage, 55)

    risk = (
        _clamp(market_vacancy * 8, 0, 100) * 0.25
        + leverage_ratio * 0.20
        + _clamp(construction_risk, 0, 100) * 0.15
        + _clamp(geo_risk, 0, 100) * 0.25
        + deal_stage_earliness * 0.15
    )
    composite = (0.55 * opportunity) + (0.45 * (100 - risk))

    return {
        "opportunity_score": round(opportunity, 2),
        "risk_score": round(risk, 2),
        "composite_score": round(composite, 2),
        "factors": [
            {"label": "IRR upside", "value": round(irr_upside, 2)},
            {"label": "Cap-rate compression", "value": round(cap_rate_compression, 2)},
            {"label": "NOI runway", "value": round(noi_growth_runway, 2)},
            {"label": "Sponsor track record", "value": round(sponsor_track_record, 2)},
            {"label": "Market vacancy", "value": round(market_vacancy, 2)},
            {"label": "Leverage ratio", "value": round(leverage_ratio, 2)},
            {"label": "Construction risk", "value": round(construction_risk, 2)},
            {"label": "Geo risk", "value": round(geo_risk, 2)},
            {"label": "Stage earliness", "value": round(deal_stage_earliness, 2)},
        ],
    }


def batch_score_deals(
    *,
    env_id: str,
    business_id: str,
    stage_filter: list[str] | None = None,
) -> list[dict]:
    deals = re_pipeline.list_deals(env_id=env_id)
    if stage_filter:
        allowed = {item.lower() for item in stage_filter}
        deals = [deal for deal in deals if str(deal.get("status") or "").lower() in allowed]

    scored: list[dict] = []
    for deal in deals:
        geo = re_pipeline.enrich_deal_with_geo(
            deal_id=str(deal["deal_id"]),
            market_id=None,
        )
        sponsor = {
            "track_record_score": _clamp(45 + (float(deal.get("activity_count") or 0) * 4) + (8 if deal.get("sponsor_name") else 0), 0, 100),
        }
        market = {
            "market_cap_rate": geo.get("market_cap_rate"),
            "population_growth_pct": geo.get("population_growth_pct"),
            "vacancy_rate": geo.get("vacancy_rate"),
            "employment_growth_pct": geo.get("employment_growth_pct"),
            "geo_risk_score": geo.get("geo_risk_score"),
        }
        risk_hint = 80 if str(deal.get("strategy") or "").lower() == "development" else 25
        score = compute_deal_score(
            {**deal, "construction_risk": risk_hint},
            market,
            sponsor,
        )
        scored.append({
            **deal,
            **geo,
            **score,
        })

    scored.sort(key=lambda item: item.get("composite_score", 0), reverse=True)
    return scored
