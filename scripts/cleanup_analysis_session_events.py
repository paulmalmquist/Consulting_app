#!/usr/bin/env python3
"""Prune the Postgres hot window of nv_analysis_session_events (plan PR 6).

Deletes events older than the retention window — but ONLY after confirming they are
mirrored to BigQuery. Never delete-without-mirror: if the BigQuery export is not
configured, this script refuses to delete and exits non-zero (fail closed).

Run:
    python scripts/cleanup_analysis_session_events.py --older-than-days 90 --dry-run
    python scripts/cleanup_analysis_session_events.py --older-than-days 90 --confirm
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
RETENTION_DAYS_DEFAULT = 90


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL") or os.environ.get("PG_POOLER_URL")
    if not url:
        from dotenv import load_dotenv
        load_dotenv(BACKEND_DIR / ".env")
        url = os.environ.get("DATABASE_URL") or os.environ.get("PG_POOLER_URL")
    if not url:
        raise RuntimeError("DATABASE_URL or PG_POOLER_URL is required")
    return url


def _export_configured() -> bool:
    return bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS")) and bool(os.getenv("BQ_PROJECT_ID"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prune old session events AFTER BigQuery export is confirmed.")
    parser.add_argument("--older-than-days", type=int, default=RETENTION_DAYS_DEFAULT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--confirm", action="store_true", help="Actually delete (otherwise dry-run).")
    args = parser.parse_args(argv)

    if not _export_configured():
        print("ERROR: refusing to delete — BigQuery export not configured "
              "(set GOOGLE_APPLICATION_CREDENTIALS and BQ_PROJECT_ID). Never delete without a mirror.",
              file=sys.stderr)
        return 2

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.older_than_days)
    import psycopg
    with psycopg.connect(_database_url(), connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM nv_analysis_session_events WHERE created_at < %s", (cutoff,))
            count = cur.fetchone()[0]
            if args.dry_run or not args.confirm:
                print(f"DRY RUN: {count} events older than {cutoff.isoformat()} would be deleted.")
                return 0
            cur.execute("DELETE FROM nv_analysis_session_events WHERE created_at < %s", (cutoff,))
            conn.commit()
            print(f"DELETED: {count} events older than {cutoff.isoformat()}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
