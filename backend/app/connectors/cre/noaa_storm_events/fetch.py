from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def fetch(_context: ConnectorContext) -> dict:
    return {
        "period": "2025-12-31",
        "rows": [
            {"geography_type": "county", "geoid": "12086", "metric_key": "storm_event_count", "value": 7, "units": "count"},
            {"geography_type": "county", "geoid": "12086", "metric_key": "severe_event_index", "value": 0.41, "units": "index"},
        ],
    }

