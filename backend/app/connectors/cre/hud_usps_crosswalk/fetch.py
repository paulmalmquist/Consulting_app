from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def fetch(_context: ConnectorContext) -> dict:
    return {
        "rows": [
            {"geography_type": "tract", "geoid": "12086000100", "alias_type": "zip", "alias_value": "33131"},
            {"geography_type": "tract", "geoid": "12086000100", "alias_type": "zip", "alias_value": "33132"},
        ],
    }

