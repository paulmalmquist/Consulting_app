#!/usr/bin/env python
"""Ingest FRED series into the History Rhymes feature store SILVER layer.

DRY-RUN BY DEFAULT and rate-limit guarded (--limit) so a first live attempt never
pulls a huge history by accident. Live behind the provisioned FRED key
(FRED_API_KEY / FRED_API_KEY_FILE). A live failure prints and exits 0 — this is
ops/evidence tooling, never a CI requirement.

Usage:
    python scripts/streaming/feature_store/fred_ingest.py --dry-run --limit 50
    python scripts/streaming/feature_store/fred_ingest.py --write --limit 50
    python scripts/streaming/feature_store/fred_ingest.py --write --series yield_curve_10y2y,hy_credit_spread
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "backend"))

from app.services.hr_feature_store.connectors.fred import client, normalizer  # noqa: E402
from app.services.hr_feature_store.connectors.fred.series_registry import (  # noqa: E402
    CONNECTOR,
    FRED_SERIES,
    registered_canonical_names,
)
from app.services.hr_feature_store.freshness import compute_status  # noqa: E402
from app.services.hr_feature_store.loader import (  # noqa: E402
    update_pipeline_status,
    upsert_silver_readings,
)


def _latest_as_of(rows: list[dict]) -> datetime | None:
    stamps = [r["ts_source"] for r in rows if r.get("ts_source")]
    if not stamps:
        return None
    try:
        return max(datetime.fromisoformat(s.replace("Z", "+00:00")) for s in stamps)
    except ValueError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest FRED series into feature-store silver")
    parser.add_argument("--series", default="", help="csv of canonical names (default: all registered)")
    parser.add_argument("--limit", type=int, default=50, help="max observations per series (rate-limit guard)")
    parser.add_argument("--observation-start", default=None, help="YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true", help="default; build the plan, write nothing")
    parser.add_argument("--write", action="store_true", help="actually UPSERT (default is dry-run)")
    parser.add_argument("--source-quality", default="live", choices=["live", "fixture"])
    args = parser.parse_args()

    names = [s.strip() for s in args.series.split(",") if s.strip()] or registered_canonical_names()
    now = datetime.now(timezone.utc)
    summary: list[dict] = []

    for name in names:
        meta = FRED_SERIES.get(name)
        if meta is None:
            summary.append({"series": name, "status": "unknown_series"})
            continue
        try:
            body = client.fetch_observations(
                meta["series_id"], observation_start=args.observation_start, limit=args.limit,
            )
            rows = normalizer.normalize_observations(name, body, source_quality=args.source_quality)
        except Exception as exc:  # noqa: BLE001 — live failure must not crash the run
            summary.append({"series": name, "status": "fetch_failed", "reason": str(exc)})
            continue

        as_of = _latest_as_of(rows)
        status, lag = compute_status(as_of, now, meta["cadence"])
        item = {"series": name, "series_id": meta["series_id"], "rows": len(rows),
                "freshness": status, "lag_seconds": lag}
        if args.write:
            counts = upsert_silver_readings(rows)
            update_pipeline_status(
                CONNECTOR, name, status,
                expected_cadence=meta["cadence"],
                as_of_ts=as_of.isoformat() if as_of else None,
                lag_seconds=lag,
                reason=None if status == "fresh" else f"lag {lag}s exceeds {meta['cadence']} cadence",
            )
            item["counts"] = counts
        summary.append(item)

    print(json.dumps({"connector": CONNECTOR, "mode": "write" if args.write else "dry-run",
                      "limit": args.limit, "series": summary}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
