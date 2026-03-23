from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, as_period


def parse(raw: dict, _context: ConnectorContext) -> list[dict]:
    period = as_period(raw["period"])
    return [
        {
            **row,
            "period": period,
            "source": "noaa_storm_events",
            "vintage": "2025_rolling",
            "provenance": {"dataset": "NOAA storm events", "state": "FL"},
        }
        for row in raw.get("rows", [])
    ]

