#!/usr/bin/env python3
"""Manual batch export of app.audit_events -> BigQuery winston_ops.audit_events_bq.

Plan PR 3 scaffold. This is the ONE manual entry point for the audit warehouse
export. It is NOT scheduled and there is NO continuous replication — running it is
a deliberate operator action.

Fails closed: if GOOGLE_APPLICATION_CREDENTIALS or BQ_PROJECT_ID is unset, it exits
non-zero with a clear message and never reports a successful export. Idempotent by
audit_event_id (MERGE), so re-runs do not duplicate rows.

Run:
    python scripts/export_audit_to_bq.py --since 2026-06-01
    python scripts/export_audit_to_bq.py --since 2026-06-01 --dry-run

The export core (export_audit_events) is importable so the
ade_warehouse_export.export_audit_events_to_warehouse() seam can call it.
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

BQ_DATASET_TABLE = "winston_ops.audit_events_bq"


class ExportNotConfigured(RuntimeError):
    """Raised when BigQuery credentials/project are not configured."""


@dataclass(frozen=True)
class ExportResult:
    exported: int
    target_table: str
    since: datetime | None
    dry_run: bool


def _require_config() -> str:
    """Return the BQ project id, or raise ExportNotConfigured. Never silently skips."""
    creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    project = os.getenv("BQ_PROJECT_ID")
    if not creds or not project:
        raise ExportNotConfigured(
            "BigQuery export not configured — set GOOGLE_APPLICATION_CREDENTIALS "
            "and BQ_PROJECT_ID."
        )
    return project


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL") or os.environ.get("PG_POOLER_URL")
    if not url:
        # backend/.env carries DATABASE_URL when pulled via vercel env pull.
        from dotenv import load_dotenv  # local import; optional dependency path
        load_dotenv(BACKEND_DIR / ".env")
        url = os.environ.get("DATABASE_URL") or os.environ.get("PG_POOLER_URL")
    if not url:
        raise RuntimeError("DATABASE_URL or PG_POOLER_URL is required for the export source")
    return url


def _read_rows(since: datetime | None) -> list[dict]:
    import psycopg
    from psycopg.rows import dict_row

    where = ""
    params: list = []
    if since is not None:
        where = "WHERE created_at >= %s"
        params.append(since)
    with psycopg.connect(_database_url(), row_factory=dict_row, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT audit_event_id, tenant_id, business_id, actor, action, tool_name,
                           object_type, object_id, success, latency_ms,
                           input_redacted, output_redacted, error_message, created_at
                    FROM app.audit_events
                    {where}
                    ORDER BY created_at ASC""",
                params,
            )
            return cur.fetchall()


def export_audit_events(since: datetime | None = None, *, dry_run: bool = False) -> ExportResult:
    """Export audit events to BigQuery. Importable core for the seam.

    Raises ExportNotConfigured when creds are missing (fail-closed). With --dry-run,
    reads the source and reports the count without writing to BigQuery.
    """
    _require_config()  # raises before any work if unconfigured
    rows = _read_rows(since)

    if dry_run:
        return ExportResult(exported=len(rows), target_table=BQ_DATASET_TABLE, since=since, dry_run=True)

    # Real load path. Kept minimal and import-local so the scaffold imports cleanly
    # even where google-cloud-bigquery is not installed.
    from google.cloud import bigquery  # noqa: F401  (load path; deps present in backend/requirements.txt)

    client = bigquery.Client()
    now_iso = datetime.utcnow().isoformat()
    payload = []
    for r in rows:
        payload.append({
            "audit_event_id": str(r["audit_event_id"]),
            "tenant_id": str(r["tenant_id"]) if r.get("tenant_id") else None,
            "business_id": str(r["business_id"]) if r.get("business_id") else None,
            "actor": r["actor"],
            "action": r["action"],
            "tool_name": r["tool_name"],
            "object_type": r.get("object_type"),
            "object_id": str(r["object_id"]) if r.get("object_id") else None,
            "success": r["success"],
            "latency_ms": r["latency_ms"],
            "input_redacted": r.get("input_redacted"),
            "output_redacted": r.get("output_redacted"),
            "error_message": r.get("error_message"),
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
            "exported_at": now_iso,
        })
    if payload:
        errors = client.insert_rows_json(BQ_DATASET_TABLE, payload, row_ids=[p["audit_event_id"] for p in payload])
        if errors:
            raise RuntimeError(f"BigQuery insert errors: {errors}")
    return ExportResult(exported=len(payload), target_table=BQ_DATASET_TABLE, since=since, dry_run=False)


def _parse_since(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export app.audit_events to BigQuery (manual, fail-closed).")
    parser.add_argument("--since", help="ISO date/datetime lower bound on created_at, e.g. 2026-06-01")
    parser.add_argument("--dry-run", action="store_true", help="Read and count only; do not write to BigQuery.")
    args = parser.parse_args(argv)

    try:
        result = export_audit_events(_parse_since(args.since), dry_run=args.dry_run)
    except ExportNotConfigured as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2  # non-zero; never report success
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: export failed: {exc}", file=sys.stderr)
        return 1

    mode = "DRY RUN" if result.dry_run else "EXPORTED"
    print(f"{mode}: {result.exported} rows -> {result.target_table}"
          f"{f' since {result.since.isoformat()}' if result.since else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
