from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, as_period


def parse(raw: dict, _context: ConnectorContext) -> list[dict]:
    period = as_period(raw["period"])
    return [
        {
            **row,
            "period": period,
            "source": "bls_labor",
            "vintage": "2025-12",
            "provenance": {"dataset": "BLS", "cbsa": "33100"},
        }
        for row in raw.get("rows", [])
    ]

