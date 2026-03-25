from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def parse(raw: dict, _context: ConnectorContext) -> list[dict]:
    return [
        {
            **row,
            "source": "kalshi_markets",
        }
        for row in raw.get("rows", [])
    ]

