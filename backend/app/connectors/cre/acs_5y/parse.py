from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, as_period


def parse(raw: dict, _context: ConnectorContext) -> list[dict]:
    period = as_period(raw["period"])
    return [
        {
            **row,
            "period": period,
            "source": "acs_5y",
            "vintage": "2025_5y",
            "provenance": {"dataset": "ACS 5-year", "metro": "33100"},
        }
        for row in raw.get("rows", [])
    ]

