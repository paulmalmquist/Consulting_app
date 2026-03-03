from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def fetch(_context: ConnectorContext) -> dict:
    return {
        "period": "2025-12-31",
        "rows": [
            {"geography_type": "cbsa", "geoid": "33100", "metric_key": "fair_market_rent", "value": 2865, "units": "USD"},
        ],
    }

