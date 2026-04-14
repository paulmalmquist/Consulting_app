"""Data-health + exception surfacing for the PDS Executive page.

Reads pds_pipeline_run + pds_exception and returns aggregated counts for the
Data Health bar plus click-through drill-down rows for the drawer.

HARD RULE 5: any filter that excludes rows must also return suppressed_count
and sample rows so the UI can surface them. This module exposes that data.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db import get_cursor


_SUCCESS_STATUSES: tuple[str, ...] = ("success", "succeeded", "completed")


def get_health_summary(*, env_id: UUID, business_id: UUID) -> dict[str, Any]:
    """Aggregate data-health metrics for the persistent header bar."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS exception_count,
                   COUNT(DISTINCT source_table) AS tables_with_issues
              FROM pds_exception
             WHERE env_id = %s::uuid
               AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        exc = cur.fetchone() or {}
        exception_count = int(exc.get("exception_count") or 0)
        tables_with_issues = int(exc.get("tables_with_issues") or 0)

        cur.execute(
            """
            WITH latest AS (
              SELECT DISTINCT ON (pipeline_name)
                     pipeline_name, status, finished_at, rows_processed, rows_failed
                FROM pds_pipeline_run
               WHERE env_id = %s::uuid
                 AND business_id = %s::uuid
               ORDER BY pipeline_name, started_at DESC
            )
            SELECT pipeline_name, status, finished_at, rows_processed, rows_failed
              FROM latest
            """,
            (str(env_id), str(business_id)),
        )
        latest_runs = cur.fetchall() or []

        cur.execute(
            """
            SELECT source_table, error_type, COUNT(*) AS n
              FROM pds_exception
             WHERE env_id = %s::uuid
               AND business_id = %s::uuid
             GROUP BY source_table, error_type
             ORDER BY n DESC
             LIMIT 25
            """,
            (str(env_id), str(business_id)),
        )
        breakdown = cur.fetchall() or []

        cur.execute(
            """
            SELECT COALESCE(SUM(rows_processed), 0) AS processed,
                   COALESCE(SUM(rows_failed), 0) AS failed
              FROM pds_pipeline_run
             WHERE env_id = %s::uuid
               AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        row_totals = cur.fetchone() or {}
        processed = int(row_totals.get("processed") or 0)
        failed = int(row_totals.get("failed") or 0)

    failed_pipelines = sum(
        1
        for row in latest_runs
        if str(row.get("status") or "").lower() not in _SUCCESS_STATUSES
    )

    total_rows = processed or 0
    valid_pct = (
        ((total_rows - failed) / total_rows) if total_rows else 1.0
    )

    return {
        "valid_pct": round(valid_pct, 4),
        "exception_count": exception_count,
        "tables_with_issues": tables_with_issues,
        "failed_pipeline_count": failed_pipelines,
        "pipeline_runs": [
            {
                "pipeline_name": row.get("pipeline_name"),
                "status": row.get("status"),
                "finished_at": row.get("finished_at"),
                "rows_processed": int(row.get("rows_processed") or 0),
                "rows_failed": int(row.get("rows_failed") or 0),
            }
            for row in latest_runs
        ],
        "by_error_type": [
            {
                "source_table": row.get("source_table"),
                "error_type": row.get("error_type"),
                "count": int(row.get("n") or 0),
            }
            for row in breakdown
        ],
    }


def list_exceptions(
    *,
    env_id: UUID,
    business_id: UUID,
    source_table: str | None = None,
    run_id: UUID | None = None,
    error_type: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    where = ["env_id = %s::uuid", "business_id = %s::uuid"]
    params: list[Any] = [str(env_id), str(business_id)]
    if source_table:
        where.append("source_table = %s")
        params.append(source_table)
    if run_id:
        where.append("run_id = %s::uuid")
        params.append(str(run_id))
    if error_type:
        where.append("error_type = %s")
        params.append(error_type)
    params.append(max(1, min(int(limit), 500)))

    sql = (
        "SELECT exception_id, env_id, business_id, run_id, source_table, "
        "       source_row_id, error_type, sample_row_json, created_at "
        "  FROM pds_exception "
        " WHERE " + " AND ".join(where) + " "
        " ORDER BY created_at DESC "
        " LIMIT %s"
    )
    with get_cursor() as cur:
        cur.execute(sql, tuple(params))
        return cur.fetchall() or []
