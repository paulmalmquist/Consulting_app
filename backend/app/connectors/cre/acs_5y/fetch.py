from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def fetch(_context: ConnectorContext) -> dict:
    return {
        "period": "2025-12-31",
        "rows": [
            {"geography_type": "tract", "geoid": "12086000100", "metric_key": "median_income", "value": 68250, "units": "USD"},
            {"geography_type": "tract", "geoid": "12086000100", "metric_key": "population", "value": 4120, "units": "people"},
            {"geography_type": "tract", "geoid": "12086000100", "metric_key": "median_rent", "value": 2410, "units": "USD"},
            {"geography_type": "tract", "geoid": "12086000100", "metric_key": "rent_burden_proxy", "value": 0.318, "units": "ratio"},
        ],
    }

