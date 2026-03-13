"""Level 3 — Data reachability: verify SQL ground truth queries return data.

Requires a live database connection.  Skipped unless DATABASE_URL points to
a real Postgres instance.  Run with: pytest -m live
"""
from __future__ import annotations

import os
import pytest

from .sql_reference import SQL_REFERENCES, SQLReference

# Skip entire module if no real DB
_DB_URL = os.environ.get("DATABASE_URL", "")
_IS_LIVE = _DB_URL and "localhost" not in _DB_URL and "test:test" not in _DB_URL

pytestmark = pytest.mark.live


def _get_connection():
    """Get a psycopg3 connection from the pool."""
    import psycopg
    return psycopg.connect(_DB_URL, row_factory=psycopg.rows.dict_row)


@pytest.fixture(scope="module")
def db_conn():
    if not _IS_LIVE:
        pytest.skip("No live database — set DATABASE_URL to a real Postgres instance")
    conn = _get_connection()
    yield conn
    conn.close()


class TestDataReachability:
    """For each SQL reference, execute the query and verify data exists."""

    @pytest.mark.parametrize(
        "sql_ref",
        SQL_REFERENCES,
        ids=[ref.id for ref in SQL_REFERENCES],
    )
    def test_query_returns_data(self, db_conn, sql_ref: SQLReference):
        with db_conn.cursor() as cur:
            cur.execute(sql_ref.sql, sql_ref.params)
            rows = cur.fetchall()

        assert len(rows) >= sql_ref.expected_min_rows, (
            f"{sql_ref.id}: expected >= {sql_ref.expected_min_rows} rows, "
            f"got {len(rows)} from {sql_ref.source_table}"
        )

    @pytest.mark.parametrize(
        "sql_ref",
        SQL_REFERENCES,
        ids=[ref.id for ref in SQL_REFERENCES],
    )
    def test_expected_columns_present(self, db_conn, sql_ref: SQLReference):
        with db_conn.cursor() as cur:
            cur.execute(sql_ref.sql, sql_ref.params)
            rows = cur.fetchall()

        if not rows:
            pytest.skip(f"{sql_ref.id}: no rows returned — cannot check columns")

        actual_columns = set(rows[0].keys())
        for expected_col in sql_ref.expected_columns:
            assert expected_col in actual_columns, (
                f"{sql_ref.id}: expected column '{expected_col}' "
                f"not found in {sorted(actual_columns)}"
            )

    @pytest.mark.parametrize(
        "sql_ref",
        [ref for ref in SQL_REFERENCES if ref.entity_level == "asset"],
        ids=[ref.id for ref in SQL_REFERENCES if ref.entity_level == "asset"],
    )
    def test_asset_data_not_null(self, db_conn, sql_ref: SQLReference):
        """Key metric columns should not all be NULL."""
        with db_conn.cursor() as cur:
            cur.execute(sql_ref.sql, sql_ref.params)
            rows = cur.fetchall()

        if not rows:
            pytest.skip(f"{sql_ref.id}: no rows")

        # Check that at least one row has non-null values in metric columns
        metric_cols = [c for c in sql_ref.expected_columns if c not in ("quarter", "period_month", "asset_name", "deal_name", "fund_name", "market", "line_code", "stage")]
        if not metric_cols:
            return

        has_data = any(
            any(row.get(col) is not None for col in metric_cols)
            for row in rows
        )
        assert has_data, (
            f"{sql_ref.id}: all metric columns are NULL in {metric_cols}"
        )
