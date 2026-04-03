"""SQL execution layer — runs validated, read-only SQL against Postgres.

Returns structured results with timing, metadata, and row counts.
Designed so a Databricks SQL backend can be plugged in later.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.db import get_cursor

logger = logging.getLogger(__name__)

# Hard ceiling: never return more rows than this regardless of LIMIT in SQL
MAX_ROWS_HARD_LIMIT = 5000
DEFAULT_ROW_LIMIT = 500


@dataclass
class ExecutionResult:
    """Structured result from SQL execution."""
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    truncated: bool  # True if rows were capped
    execution_time_ms: float
    sql: str
    params: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "columns": self.columns,
            "rows": self.rows,
            "row_count": self.row_count,
            "truncated": self.truncated,
            "execution_time_ms": round(self.execution_time_ms, 1),
            "sql": self.sql,
            "params": {k: str(v) for k, v in self.params.items()},
            "metadata": self.metadata,
            "error": self.error,
        }


def _sanitize_value(v: Any) -> Any:
    """Convert DB values to JSON-safe types."""
    if v is None:
        return None
    if isinstance(v, (int, float, bool, str)):
        return v
    # Decimal, UUID, date, datetime → string
    return str(v)


def execute_sql(
    sql: str,
    params: dict[str, Any],
    *,
    row_limit: int = DEFAULT_ROW_LIMIT,
    capture_explain: bool = False,
) -> ExecutionResult:
    """Execute validated read-only SQL and return structured results.

    Args:
        sql: Validated SELECT statement with %(name)s placeholders.
        params: Parameter dict matching the placeholders.
        row_limit: Max rows to return (capped at MAX_ROWS_HARD_LIMIT).
        capture_explain: If True, run EXPLAIN ANALYZE and attach to metadata.

    Returns:
        ExecutionResult with columns, rows, timing, and metadata.
    """
    effective_limit = min(row_limit, MAX_ROWS_HARD_LIMIT)
    metadata: dict[str, Any] = {"row_limit": effective_limit}

    # Capture EXPLAIN plan if requested
    if capture_explain:
        try:
            with get_cursor() as cur:
                cur.execute(f"EXPLAIN (FORMAT TEXT) {sql}", params)
                plan_rows = cur.fetchall()
                metadata["explain_plan"] = [
                    list(r.values())[0] for r in plan_rows
                ]
        except Exception as e:
            metadata["explain_error"] = str(e)

    # Execute the actual query
    start = time.perf_counter()
    try:
        with get_cursor() as cur:
            cur.execute(sql, params)
            raw_rows = cur.fetchmany(effective_limit + 1)  # +1 to detect truncation

            # Get column names from cursor description
            columns = [desc[0] for desc in cur.description] if cur.description else []

        elapsed_ms = (time.perf_counter() - start) * 1000

        truncated = len(raw_rows) > effective_limit
        if truncated:
            raw_rows = raw_rows[:effective_limit]

        # Sanitize values for JSON serialization
        rows = [
            {col: _sanitize_value(row.get(col)) for col in columns}
            for row in raw_rows
        ]

        logger.info(
            "SQL executed: %d rows in %.1fms (truncated=%s)",
            len(rows), elapsed_ms, truncated,
        )

        return ExecutionResult(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            truncated=truncated,
            execution_time_ms=elapsed_ms,
            sql=sql,
            params=params,
            metadata=metadata,
        )

    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.error("SQL execution failed (%.1fms): %s", elapsed_ms, e)
        return ExecutionResult(
            columns=[],
            rows=[],
            row_count=0,
            truncated=False,
            execution_time_ms=elapsed_ms,
            sql=sql,
            params=params,
            metadata=metadata,
            error=str(e),
        )
