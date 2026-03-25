from __future__ import annotations

import os
from typing import Any

import httpx

from app.connectors.opportunity.base import OpportunityConnectorContext, deterministic_probability

POLYMARKET_API_BASE = os.getenv(
    "OPPORTUNITY_POLYMARKET_API_BASE",
    "https://gamma-api.polymarket.com/events",
)


def _fixture_rows(context: OpportunityConnectorContext) -> list[dict[str, Any]]:
    seeds = [
        ("POLY-INFL", "Will CPI inflation end 2026 below 2.5%?"),
        ("POLY-STORM", "Will US hurricane losses exceed 2025 levels in 2026?"),
        ("POLY-HOUSING", "Will US multifamily rents accelerate in Sun Belt markets during 2026?"),
        ("POLY-RATES", "Will the 10Y Treasury finish 2026 below 4.0%?"),
    ]
    rows: list[dict[str, Any]] = []
    for market_id, title in seeds:
        rows.append(
            {
                "id": market_id,
                "title": title,
                "question": title,
                "probability": deterministic_probability(f"{context.as_of_date.isoformat()}:{market_id}", 0.27, 0.74),
                "endDate": f"{context.as_of_date.isoformat()}T12:00:00+00:00",
            }
        )
    return rows


def fetch(context: OpportunityConnectorContext) -> dict[str, Any]:
    if context.mode == "fixture":
        return {"rows": _fixture_rows(context), "provider_mode": "fixture"}

    try:
        response = httpx.get(
            POLYMARKET_API_BASE,
            params={"closed": "false", "limit": 50},
            timeout=10.0,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        rows = payload if isinstance(payload, list) else payload.get("events") or payload.get("data") or []
        if not isinstance(rows, list) or not rows:
            raise ValueError("Polymarket returned no rows")
        return {"rows": rows, "provider_mode": "live"}
    except Exception:
        return {"rows": _fixture_rows(context), "provider_mode": "fixture_fallback"}
