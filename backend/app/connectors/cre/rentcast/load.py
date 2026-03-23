from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, ensure_source_allowed, upsert_market_facts


def load(records: list[dict], _context: ConnectorContext) -> int:
    ensure_source_allowed("rentcast")
    return upsert_market_facts(records)
