from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, ensure_source_allowed, upsert_geographies


def load(records: list[dict], _context: ConnectorContext) -> int:
    ensure_source_allowed("tiger_geography")
    return upsert_geographies(records)

