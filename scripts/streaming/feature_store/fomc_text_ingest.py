#!/usr/bin/env python
"""Ingest public FOMC statement text into the feature-store SILVER layer.

TEXT ONLY — no embeddings, no LLM, no classification. DRY-RUN BY DEFAULT and
rate-limit guarded (--limit). Disabled by default (FS_FOMC_TEXT_ENABLED=true to
fetch live) so the default invocation is network-free. A live failure prints a
clear reason and exits 0.

Usage:
    python scripts/streaming/feature_store/fomc_text_ingest.py --dry-run --limit 5
    FS_FOMC_TEXT_ENABLED=true python scripts/streaming/feature_store/fomc_text_ingest.py --write --limit 5
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend"))

from app.services.hr_feature_store.connectors.fomc_text.config import FomcTextSettings  # noqa: E402
from app.services.hr_feature_store.connectors.fomc_text.ingest import run_ingest  # noqa: E402
from app.services.hr_feature_store.connectors.fomc_text.series_registry import (  # noqa: E402
    CONNECTOR,
    registered_series_keys,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest FOMC statement text into feature-store silver")
    parser.add_argument("--series", default="", help="csv of series keys (default: all registered)")
    parser.add_argument("--limit", type=int, default=5, help="max documents per series (rate-limit guard)")
    parser.add_argument("--dry-run", action="store_true", help="default; build the plan, write nothing")
    parser.add_argument("--write", action="store_true", help="actually UPSERT (default is dry-run)")
    parser.add_argument("--source-quality", default="live", choices=["live", "fixture"])
    args = parser.parse_args()

    names = [s.strip() for s in args.series.split(",") if s.strip()] or registered_series_keys()
    settings = FomcTextSettings.from_env()
    if not settings.enabled:
        print(json.dumps({
            "connector": CONNECTOR, "mode": "write" if args.write else "dry-run",
            "status": "disabled", "reason": "set FS_FOMC_TEXT_ENABLED=true to fetch live",
            "series": names,
        }, indent=2))
        return 0

    out = run_ingest(series=names, limit=args.limit, write=args.write, source_quality=args.source_quality)
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
