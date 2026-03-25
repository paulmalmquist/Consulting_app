from __future__ import annotations

from app.connectors.cre import list_connector_keys
from app.services import re_intelligence


def main() -> None:
    for source_key in list_connector_keys():
        if source_key == "kalshi_markets":
            continue
        re_intelligence.create_ingest_run(
            source_key=source_key,
            scope="metro" if source_key != "noaa_storm_events" else "state",
            filters={"metro": "33100", "state": "FL"},
            force_refresh=True,
        )


if __name__ == "__main__":
    main()

