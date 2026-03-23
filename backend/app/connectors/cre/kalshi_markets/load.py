from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, ensure_source_allowed


def load(records: list[dict], _context: ConnectorContext) -> int:
    ensure_source_allowed("kalshi_markets")
    return len(records)

