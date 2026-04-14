"""Sub-Phase 2B — data health summary + suppressed data visibility."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.services.pds_executive import data_health


ENV = uuid4()
BIZ = uuid4()


def test_summary_math_counts_exceptions_and_failed_pipelines(fake_cursor):
    # Exception totals: 12 rows across 3 source tables
    fake_cursor.push_result([{"exception_count": 12, "tables_with_issues": 3}])
    # Latest run per pipeline
    fake_cursor.push_result(
        [
            {
                "pipeline_name": "budget_ingest",
                "status": "success",
                "finished_at": datetime.now(tz=timezone.utc),
                "rows_processed": 1000,
                "rows_failed": 5,
            },
            {
                "pipeline_name": "timecard_ingest",
                "status": "failed",
                "finished_at": datetime.now(tz=timezone.utc),
                "rows_processed": 200,
                "rows_failed": 200,
            },
        ]
    )
    # by_error_type breakdown
    fake_cursor.push_result(
        [
            {"source_table": "pds_projects", "error_type": "NOT_NULL", "n": 6},
            {"source_table": "pds_timecards", "error_type": "FK", "n": 6},
        ]
    )
    # row totals
    fake_cursor.push_result([{"processed": 1200, "failed": 205}])

    summary = data_health.get_health_summary(env_id=ENV, business_id=BIZ)
    assert summary["exception_count"] == 12
    assert summary["tables_with_issues"] == 3
    assert summary["failed_pipeline_count"] == 1  # only timecard_ingest
    assert summary["valid_pct"] == round((1200 - 205) / 1200, 4)
    assert len(summary["by_error_type"]) == 2


def test_summary_handles_zero_rows(fake_cursor):
    fake_cursor.push_result([{"exception_count": 0, "tables_with_issues": 0}])
    fake_cursor.push_result([])
    fake_cursor.push_result([])
    fake_cursor.push_result([{"processed": 0, "failed": 0}])
    summary = data_health.get_health_summary(env_id=ENV, business_id=BIZ)
    assert summary["valid_pct"] == 1.0
    assert summary["exception_count"] == 0
    assert summary["failed_pipeline_count"] == 0


def test_list_exceptions_applies_filters(fake_cursor):
    fake_cursor.push_result(
        [
            {
                "exception_id": uuid4(),
                "env_id": ENV,
                "business_id": BIZ,
                "run_id": uuid4(),
                "source_table": "pds_projects",
                "source_row_id": uuid4(),
                "error_type": "NOT_NULL",
                "sample_row_json": {"name": "P1"},
                "created_at": datetime.now(tz=timezone.utc),
            }
        ]
    )
    rows = data_health.list_exceptions(
        env_id=ENV,
        business_id=BIZ,
        source_table="pds_projects",
        error_type="NOT_NULL",
    )
    assert rows and rows[0]["source_table"] == "pds_projects"

    # Last recorded query should include both filters
    sql, params = fake_cursor.queries[-1]
    assert "source_table = %s" in sql
    assert "error_type = %s" in sql
