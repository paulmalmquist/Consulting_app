from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, as_period


def parse(raw: dict, context: ConnectorContext) -> list[dict]:
    cbsa = context.filters.get("metro", "33100")
    return [
        {
            **row,
            "period": as_period(row["period"]) if isinstance(row.get("period"), str) else row.get("period", as_period(raw["period"])),
            "source": row.get("source", "rentcast"),
            "vintage": row.get("vintage", raw.get("period", "")),
            "provenance": {"dataset": "RentCast", "cbsa": cbsa},
        }
        for row in raw.get("rows", [])
    ]
