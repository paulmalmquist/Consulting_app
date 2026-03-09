from __future__ import annotations

from datetime import date
from typing import Any

from app.connectors.opportunity.base import OpportunityConnectorContext
from app.connectors.opportunity.kalshi_markets import CONNECTOR as KALSHI_CONNECTOR
from app.connectors.opportunity.polymarket_markets import CONNECTOR as POLYMARKET_CONNECTOR

_CONNECTORS = {
    KALSHI_CONNECTOR.source_key: KALSHI_CONNECTOR,
    POLYMARKET_CONNECTOR.source_key: POLYMARKET_CONNECTOR,
}


def get_connector(source_key: str):
    connector = _CONNECTORS.get(source_key)
    if connector is None:
        raise ValueError(f"Unknown opportunity connector: {source_key}")
    return connector


def list_connector_keys() -> list[str]:
    return sorted(_CONNECTORS.keys())


def load_market_signal_rows(
    *,
    run_id: str,
    mode: str,
    as_of_date: date,
    filters: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    stats: list[dict[str, Any]] = []
    merged_filters = filters or {}
    for connector in _CONNECTORS.values():
        parsed, result = connector.run(
            OpportunityConnectorContext(
                run_id=run_id,
                source_key=connector.source_key,
                mode=mode,
                as_of_date=as_of_date,
                filters=merged_filters,
            )
        )
        rows.extend(parsed)
        stats.append(
            {
                "source_key": result.source_key,
                "rows_read": result.rows_read,
                "rows_written": result.rows_written,
                "duration_ms": result.duration_ms,
            }
        )
    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        deduped[row["signal_key"]] = row
    return list(deduped.values()), stats
