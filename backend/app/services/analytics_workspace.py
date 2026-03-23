"""Analytics workspace service — query execution, persistence, caching, and visualization hints."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.db import get_cursor
from app.data import get_data_source


# ── Query execution ─────────────────────────────────────────────────


def run_query(
    *,
    business_id: str,
    env_id: str,
    sql: str,
    params: dict[str, Any] | None = None,
    executed_by: str = "system",
    query_id: str | None = None,
) -> dict[str, Any]:
    """Execute a read-only SQL query and log the run."""
    source = get_data_source()
    error_msg = None
    row_count = 0
    columns: list[str] = []
    rows: list[dict[str, Any]] = []
    elapsed_ms = 0

    try:
        result = source.execute_query(sql, list(params.values()) if params else None)
        columns = result.columns
        rows = result.rows
        row_count = result.row_count
        elapsed_ms = result.elapsed_ms
    except Exception as exc:
        error_msg = str(exc)

    # Log the run
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO analytics_query_run
                (query_id, business_id, env_id, sql_executed, params_json,
                 row_count, column_names, elapsed_ms, error_msg, executed_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING run_id
            """,
            [query_id, business_id, env_id, sql,
             json.dumps(params or {}), row_count,
             json.dumps(columns), elapsed_ms, error_msg, executed_by],
        )
        run_row = cur.fetchone()

    return {
        "run_id": run_row["run_id"] if run_row else None,
        "columns": columns,
        "rows": rows[:1000],  # cap at 1000 rows for response size
        "row_count": row_count,
        "elapsed_ms": elapsed_ms,
        "error": error_msg,
        "truncated": row_count > 1000,
    }


# ── Query persistence ───────────────────────────────────────────────


def save_query(
    *,
    business_id: str,
    env_id: str,
    title: str,
    sql_text: str,
    created_by: str,
    nl_prompt: str | None = None,
    visualization_spec: dict[str, Any] | None = None,
    description: str | None = None,
    is_public: bool = False,
) -> dict[str, Any]:
    """Save a query to the workspace."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO analytics_query
                (business_id, env_id, title, description, sql_text,
                 nl_prompt, visualization_spec, is_public, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING query_id, title, created_at
            """,
            [business_id, env_id, title, description, sql_text,
             nl_prompt, json.dumps(visualization_spec or {}),
             is_public, created_by],
        )
        return cur.fetchone()


def get_query(*, query_id: str) -> dict[str, Any] | None:
    """Retrieve a saved query by ID."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT query_id, business_id, env_id, title, description,
                   sql_text, nl_prompt, visualization_spec, parameters,
                   entity_scope, is_public, is_favorited,
                   created_by, created_at, updated_at
            FROM analytics_query
            WHERE query_id = %s
            """,
            [query_id],
        )
        return cur.fetchone()


def list_queries(
    *,
    business_id: str,
    env_id: str,
    created_by: str | None = None,
    collection_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List saved queries with optional filters."""
    conditions = ["aq.business_id = %s", "aq.env_id = %s"]
    params: list[Any] = [business_id, env_id]

    if created_by:
        conditions.append("aq.created_by = %s")
        params.append(created_by)

    if collection_id:
        conditions.append(
            "EXISTS (SELECT 1 FROM analytics_collection_membership acm "
            "WHERE acm.query_id = aq.query_id AND acm.collection_id = %s)"
        )
        params.append(collection_id)

    params.append(limit)
    where = " AND ".join(conditions)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT aq.query_id, aq.title, aq.description, aq.nl_prompt,
                   aq.is_public, aq.is_favorited, aq.created_by,
                   aq.created_at, aq.updated_at
            FROM analytics_query aq
            WHERE {where}
            ORDER BY aq.updated_at DESC
            LIMIT %s
            """,
            params,
        )
        return cur.fetchall()


def delete_query(*, query_id: str) -> bool:
    """Delete a saved query."""
    with get_cursor() as cur:
        cur.execute("DELETE FROM analytics_query WHERE query_id = %s", [query_id])
        return cur.rowcount > 0


# ── Query cache ─────────────────────────────────────────────────────


def _cache_key(sql: str, params: dict | None) -> str:
    normalized = sql.strip().lower()
    key_input = normalized + json.dumps(params or {}, sort_keys=True)
    return hashlib.sha256(key_input.encode()).hexdigest()


def get_cached_result(*, business_id: str, sql: str, params: dict | None = None) -> dict[str, Any] | None:
    """Look up a cached query result."""
    key = _cache_key(sql, params)
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE analytics_query_cache
            SET hit_count = hit_count + 1
            WHERE business_id = %s AND cache_key = %s AND expires_at > now()
            RETURNING result_json, row_count, created_at
            """,
            [business_id, key],
        )
        return cur.fetchone()


def set_cached_result(
    *,
    business_id: str,
    sql: str,
    params: dict | None,
    result_json: Any,
    row_count: int,
    ttl_seconds: int = 300,
) -> None:
    """Cache a query result."""
    key = _cache_key(sql, params)
    query_hash = hashlib.sha256(sql.encode()).hexdigest()
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO analytics_query_cache
                (business_id, cache_key, query_hash, result_json, row_count, expires_at)
            VALUES (%s, %s, %s, %s, %s, now() + make_interval(secs => %s))
            ON CONFLICT (business_id, cache_key) DO UPDATE SET
                result_json = EXCLUDED.result_json,
                row_count = EXCLUDED.row_count,
                expires_at = EXCLUDED.expires_at,
                hit_count = 0
            """,
            [business_id, key, query_hash, json.dumps(result_json),
             row_count, ttl_seconds],
        )


# ── Collections ─────────────────────────────────────────────────────


def list_collections(*, business_id: str, env_id: str) -> list[dict[str, Any]]:
    """List query collections."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT collection_id, name, description, parent_id,
                   created_by, created_at
            FROM analytics_collection
            WHERE business_id = %s AND env_id = %s
            ORDER BY name
            """,
            [business_id, env_id],
        )
        return cur.fetchall()


def create_collection(
    *,
    business_id: str,
    env_id: str,
    name: str,
    created_by: str,
    description: str | None = None,
    parent_id: str | None = None,
) -> dict[str, Any]:
    """Create a new query collection."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO analytics_collection
                (business_id, env_id, name, description, parent_id, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING collection_id, name, created_at
            """,
            [business_id, env_id, name, description, parent_id, created_by],
        )
        return cur.fetchone()


# ── Visualization suggestion ────────────────────────────────────────


def suggest_visualization(
    *, columns: list[str], row_count: int
) -> dict[str, Any]:
    """Recommend a chart type based on result shape.

    Simple heuristic — can be replaced with an LLM call later.
    """
    if row_count == 1 and len(columns) <= 4:
        return {"type": "metric_card", "description": "Single-row result → metric card"}

    time_cols = [c for c in columns if any(k in c.lower() for k in ("date", "month", "quarter", "year", "period"))]
    numeric_cols = [c for c in columns if c not in time_cols and c.lower() not in ("name", "id", "type", "status", "key")]

    if time_cols and numeric_cols:
        if row_count <= 30:
            return {
                "type": "trend_line",
                "x_axis": time_cols[0],
                "y_axis": numeric_cols[:3],
                "description": "Time-series data → trend line",
            }
        return {
            "type": "bar_chart",
            "x_axis": time_cols[0],
            "y_axis": numeric_cols[:2],
            "description": "Many time periods → bar chart",
        }

    if len(columns) == 2 and row_count <= 20:
        return {
            "type": "bar_chart",
            "x_axis": columns[0],
            "y_axis": [columns[1]],
            "description": "Two columns, few rows → bar chart",
        }

    return {
        "type": "table",
        "description": f"General result ({row_count} rows, {len(columns)} columns) → table view",
    }
