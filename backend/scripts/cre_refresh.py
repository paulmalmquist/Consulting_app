from __future__ import annotations

import sys

from app.services import re_intelligence


def main() -> None:
    source_key = sys.argv[1] if len(sys.argv) > 1 else "acs_5y"
    re_intelligence.create_ingest_run(
        source_key=source_key,
        scope="metro" if source_key != "noaa_storm_events" else "state",
        filters={"metro": "33100", "state": "FL"},
        force_refresh=True,
    )


if __name__ == "__main__":
    main()

