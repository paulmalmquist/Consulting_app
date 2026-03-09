from __future__ import annotations

import os
from typing import Any

import httpx

from app.connectors.opportunity.base import OpportunityConnectorContext, deterministic_probability

KALSHI_API_BASE = os.getenv(
    "OPPORTUNITY_KALSHI_API_BASE",
    "https://trading-api.kalshi.com/trade-api/v2/markets",
)


def _fixture_rows(context: OpportunityConnectorContext) -> list[dict[str, Any]]:
    seeds = [
        ("KAL-RATES", "Will the Fed cut rates by September 2026?"),
        ("KAL-COST", "Will US construction material inflation remain above 4% in 2026?"),
        ("KAL-LABOR", "Will US unemployment finish 2026 above 4.8%?"),
        ("KAL-HOUSING", "Will Sun Belt apartment occupancy rise by year-end 2026?"),
        ("KAL-DISTRESS", "Will US office CMBS delinquencies exceed 8% by 2026 year-end?"),
    ]
    rows: list[dict[str, Any]] = []
    for market_id, title in seeds:
        rows.append(
            {
                "market_id": market_id,
                "title": title,
                "subtitle": "fixture",
                "probability": deterministic_probability(f"{context.as_of_date.isoformat()}:{market_id}"),
                "observed_at": f"{context.as_of_date.isoformat()}T12:00:00+00:00",
            }
        )
    return rows


def fetch(context: OpportunityConnectorContext) -> dict[str, Any]:
    if context.mode == "fixture":
        return {"rows": _fixture_rows(context), "provider_mode": "fixture"}

    try:
        response = httpx.get(
            KALSHI_API_BASE,
            params={"limit": 50, "status": "open"},
            timeout=10.0,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("markets") or payload.get("data") or payload.get("rows") or []
        if not isinstance(rows, list) or not rows:
            raise ValueError("Kalshi returned no rows")
        return {"rows": rows, "provider_mode": "live"}
    except Exception:
        return {"rows": _fixture_rows(context), "provider_mode": "fixture_fallback"}
