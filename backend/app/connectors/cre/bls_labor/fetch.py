from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def fetch(_context: ConnectorContext) -> dict:
    return {
        "period": "2025-12-31",
        "rows": [
            {"geography_type": "cbsa", "geoid": "33100", "metric_key": "unemployment_rate", "value": 0.038, "units": "pct"},
            {"geography_type": "cbsa", "geoid": "33100", "metric_key": "employment_level", "value": 2825400, "units": "people"},
        ],
    }

