from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, as_period


def parse(raw: dict, context: ConnectorContext) -> list[dict]:
    cbsa = context.filters.get("metro", "33100")
    return [
        {**row, "period": as_period(row["period"]) if isinstance(row.get("period"), str) else row.get("period"),
         "provenance": {"dataset": "Census BPS", "cbsa": cbsa}}
        for row in raw.get("rows", [])
    ]
