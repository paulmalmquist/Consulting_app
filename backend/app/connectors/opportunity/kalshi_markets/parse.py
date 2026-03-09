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
        title = (
            row.get("title")
            or row.get("question")
            or row.get("event_title")
            or row.get("subtitle")
            or "Kalshi market"
        )
        market_id = str(row.get("ticker") or row.get("market_id") or row.get("id") or title)
        probability = clamp_probability(
            row.get("probability")
            or row.get("last_price")
            or row.get("yes_price")
            or row.get("last_traded_probability")
        )
        canonical = canonicalize_market(title)
        parsed.append(
            {
                "signal_source": "kalshi_markets",
                "source_market_id": market_id,
                "signal_key": make_signal_key(
                    source_key="kalshi_markets",
                    market_id=market_id,
                    canonical_topic=canonical["canonical_topic"],
                ),
                "signal_name": title,
                "canonical_topic": canonical["canonical_topic"],
                "sector": canonical["sector"],
                "geography": canonical["geography"],
                "signal_direction": infer_direction(probability),
                "probability": probability,
                "confidence": 0.68,
                "observed_at": row.get("observed_at") or row.get("close_time") or row.get("end_date"),
                "metadata_json": {
                    "provider": "Kalshi",
                    "provider_mode": provider_mode,
                    "subtitle": row.get("subtitle"),
                },
                "explanation_json": {
                    "provider_label": "Kalshi",
                    "topic_label": canonical["topic_label"],
                },
            }
        )
    return parsed
