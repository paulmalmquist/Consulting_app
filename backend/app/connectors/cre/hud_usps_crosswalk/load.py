from __future__ import annotations

from app.connectors.cre.base import ConnectorContext, ensure_source_allowed, upsert_geography_aliases


def load(records: list[dict], _context: ConnectorContext) -> int:
    ensure_source_allowed("hud_usps_crosswalk")
    return upsert_geography_aliases(records)

