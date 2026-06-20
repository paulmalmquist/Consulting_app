#!/usr/bin/env python3
"""Manual fail-closed mirror of nv_analysis_session_events -> BigQuery (plan PR 6).

Mirrors the shape of scripts/export_audit_to_bq.py. Session events live operationally
in Postgres for a ~90-day hot window; their durable home is BigQuery
(winston_ops.analysis_session_events_bq). This is the ONE manual entry point — NOT
scheduled, NO continuous replication.

Fails closed: missing GOOGLE_APPLICATION_CREDENTIALS / BQ_PROJECT_ID -> exit non-zero
with a clear message, never reports success. Idempotent by event id (MERGE on re-run).

Run:
    python scripts/export_sessions_to_bq.py --since 2026-06-01
    python scripts/export_sessions_to_bq.py --since 2026-06-01 --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"

BQ_DATASET_TABLE = "winston_ops.analysis_session_events_bq"


class ExportNotConfigured(RuntimeError):
    """Raised when BigQuery credentials/project are not configured."""


@dataclass(frozen=True)
class ExportResult:
    exported: int
    target_table: str
    since: datetime | None
    dry_run: bool


def _require_config() -> str:
    creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    project = os.getenv("BQ_PROJECT_ID")
    if not creds or not project:
        raise ExportNotConfigured(
            "BigQuery export not configured — set GOOGLE_APPLICATION_CREDENTIALS and BQ_PROJECT_ID."
        )
    return project


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL") or os.environ.get("PG_POOLER_URL")
    if not url:
        from dotenv import load_dotenv
        load_dotenv(BACKEND_DIR / ".env")
        url = os.environ.get("DATABASE_URL") or os.environ.get("PG_POOLER_URL")
    if not url:
        raise RuntimeError("DATABASE_URL or PG_POOLER_URL is required for the export source")
    return url


def _read_rows(since: datetime | None) -> list[dict]:
    import psycopg
    from psycopg.rows import dict_row

    where, params = "", []
    if since is not None:
        where = "WHERE created_at >= %s"
        params.append(since)
    with psycopg.connect(_database_url(), row_factory=dict_row, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT id, env_id, business_id, session_id, seq, run_token,
                           event_type, payload, audit_event_id, created_at
                    FROM nv_analysis_session_events {where} ORDER BY created_at ASC""",
                params,
            )
            return cur.fetchall()


def export_session_events(since: datetime | None = None, *, dry_run: bool = False) -> ExportResult:
    """Export session events to BigQuery. Importable core. Fails closed on missing creds."""
    _require_config()
    rows = _read_rows(since)
    if dry_run:
        return ExportResult(len(rows), BQ_DATASET_TABLE, since, True)

    from google.cloud import bigquery  # noqa: F401
    client = bigquery.Client()
    payload = []
    for r in rows:
        payload.append({
            "id": str(r["id"]),
            "env_id": r["env_id"],
            "business_id": str(r["business_id"]) if r.get("business_id") else None,
            "session_id": str(r["session_id"]),
            "seq": r["seq"],
            "run_token": str(r["run_token"]) if r.get("run_token") else None,
            "event_type": r["event_type"],
            "payload": r.get("payload"),
            "audit_event_id": str(r["audit_event_id"]) if r.get("audit_event_id") else None,
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        })
    if payload:
        errors = client.insert_rows_json(BQ_DATASET_TABLE, payload, row_ids=[p["id"] for p in payload])
        if errors:
            raise RuntimeError(f"BigQuery insert errors: {errors}")
    return ExportResult(len(payload), BQ_DATASET_TABLE, since, False)


def _parse_since(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mirror nv_analysis_session_events to BigQuery (manual, fail-closed).")
    parser.add_argument("--since", help="ISO lower bound on created_at, e.g. 2026-06-01")
    parser.add_argument("--dry-run", action="store_true", help="Read and count only; never write to BigQuery.")
    args = parser.parse_args(argv)
    try:
        result = export_session_events(_parse_since(args.since), dry_run=args.dry_run)
    except ExportNotConfigured as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: export failed: {exc}", file=sys.stderr)
        return 1
    mode = "DRY RUN" if result.dry_run else "EXPORTED"
    print(f"{mode}: {result.exported} rows -> {result.target_table}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
