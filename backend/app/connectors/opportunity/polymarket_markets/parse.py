from __future__ import annotations

from typing import Any

from app.connectors.opportunity.base import (
    OpportunityConnectorContext,
    canonicalize_market,
    clamp_probability,
    infer_direction,
    make_signal_key,
)


def parse(raw: dict[str, Any], _context: OpportunityConnectorContext) -> list[dict[str, Any]]:
    provider_mode = raw.get("provider_mode", "unknown")
    parsed: list[dict[str, Any]] = []
    for row in raw.get("rows", []):
        title = row.get("title") or row.get("question") or row.get("slug") or "Polymarket market"
        market_id = str(row.get("id") or row.get("market_id") or title)
        probability = clamp_probability(
            row.get("probability")
            or row.get("lastPrice")
            or row.get("last_price")
            or row.get("outcomePrice")
        )
        canonical = canonicalize_market(title, default_topic="inflation_cooling")
        parsed.append(
            {
                "signal_source": "polymarket_markets",
                "source_market_id": market_id,
                "signal_key": make_signal_key(
                    source_key="polymarket_markets",
                    market_id=market_id,
                    canonical_topic=canonical["canonical_topic"],
                ),
                "signal_name": title,
                "canonical_topic": canonical["canonical_topic"],
                "sector": canonical["sector"],
                "geography": canonical["geography"],
                "signal_direction": infer_direction(probability),
                "probability": probability,
                "confidence": 0.64,
                "observed_at": row.get("endDate") or row.get("end_date") or row.get("updatedAt"),
                "metadata_json": {
                    "provider": "Polymarket",
                    "provider_mode": provider_mode,
                    "slug": row.get("slug"),
                },
                "explanation_json": {
                    "provider_label": "Polymarket",
                    "topic_label": canonical["topic_label"],
                },
            }
        )
    return parsed
