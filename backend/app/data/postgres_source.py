"""Postgres data source — wraps the existing psycopg3 connection."""

from __future__ import annotations

import time
from typing import Any

from app.data.source import ColumnInfo, DataSource, QueryResult, TableInfo
from app.db import get_cursor


class PostgresDataSource(DataSource):
    """Default data source using the existing Postgres connection pool."""

    def execute_query(self, sql: str, params: list[Any] | None = None) -> QueryResult:
        started = time.perf_counter()
        with get_cursor() as cur:
            cur.execute(sql, params or [])
            if cur.description is None:
                return QueryResult(columns=[], rows=[], row_count=0)
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            return QueryResult(
                columns=columns,
                rows=[dict(r) if not isinstance(r, dict) else r for r in rows],
                row_count=len(rows),
                elapsed_ms=elapsed_ms,
            )

    def get_tables(self) -> list[TableInfo]:
        with get_cursor() as cur:
            cur.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
            """)
            tables = []
            for row in cur.fetchall():
                table_name = row["table_name"]
                cur.execute("""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = %s
                    ORDER BY ordinal_position
                """, [table_name])
                cols = [
                    ColumnInfo(name=c["column_name"], data_type=c["data_type"])
                    for c in cur.fetchall()
                ]
                tables.append(TableInfo(name=table_name, columns=cols))
            return tables

    def health_check(self) -> bool:
        try:
            with get_cursor() as cur:
                cur.execute("SELECT 1")
                return True
        except Exception:
            return False
