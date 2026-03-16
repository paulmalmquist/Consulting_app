from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, as_period


def parse(raw: dict, _context: ConnectorContext) -> list[dict]:
    return [
        {**row, "period": as_period(row["period"]) if isinstance(row.get("period"), str) else row.get("period"),
         "provenance": {"dataset": "FRED"}}
        for row in raw.get("rows", [])
    ]
