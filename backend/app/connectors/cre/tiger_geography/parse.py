from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def parse(raw: dict, _context: ConnectorContext) -> list[dict]:
    out: list[dict] = []
    for row in raw.get("rows", []):
        out.append(
            {
                **row,
                "vintage": raw["vintage"],
                "metadata_json": {"source_key": "tiger_geography"},
            }
        )
    return out

