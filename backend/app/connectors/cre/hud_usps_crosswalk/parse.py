from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def parse(raw: dict, _context: ConnectorContext) -> list[dict]:
    return [
        {
            **row,
            "source": "hud_usps_crosswalk",
            "metadata_json": {"metro": "33100", "dataset": "HUD USPS"},
        }
        for row in raw.get("rows", [])
    ]

