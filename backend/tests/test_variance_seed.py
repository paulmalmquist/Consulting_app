"""Tests for re_asset_variance_qtr seed data.

These are unit/structural tests that verify the seed SQL is well-formed and
the variance data would satisfy the contracts expected by finance.noi_variance.
Integration tests (marked 'integration') require a live DB with seeds applied.

Run unit tests with: pytest tests/test_variance_seed.py -v
Run integration tests with: pytest tests/test_variance_seed.py -v -m integration
"""
from __future__ import annotations

import os
import re

import pytest


# ── Seed file structural tests (no DB required) ───────────────────────

SEED_FILE = os.path.join(
    os.path.dirname(__file__),
    "../../repo-b/db/schema/442_re_variance_seed.sql",
)


def _read_seed() -> str:
    with open(SEED_FILE) as f:
        return f.read()


def test_seed_file_exists():
    assert os.path.isfile(SEED_FILE), f"Seed file not found: {SEED_FILE}"


def test_seed_file_inserts_re_run():
    sql = _read_seed()
    assert "INSERT INTO re_run" in sql


def test_seed_file_inserts_variance_qtr():
    sql = _read_seed()
    assert "INSERT INTO re_asset_variance_qtr" in sql


def test_seed_file_has_noi_line_code():
    sql = _read_seed()
    assert "'NOI'" in sql


def test_seed_file_has_required_line_codes():
    sql = _read_seed()
    for line_code in ("GROSS_REVENUE", "VACANCY_LOSS", "EGI", "OPERATING_EXPENSE", "NOI"):
        assert f"'{line_code}'" in sql, f"Missing line_code '{line_code}' in seed file"


def test_seed_file_is_idempotent():
    sql = _read_seed()
    # Must have ON CONFLICT DO NOTHING for re_run inserts
    assert "ON CONFLICT DO NOTHING" in sql


def test_seed_file_has_idempotent_guard():
    sql = _read_seed()
    # Must check for existing data before inserting to avoid duplicates on re-run
    assert "IF EXISTS" in sql or "RETURN" in sql


def test_seed_file_references_re_asset_quarter_state():
    sql = _read_seed()
    # Variance actuals are derived from existing quarter-state rows
    assert "re_asset_quarter_state" in sql


def test_seed_file_has_business_id_resolution():
    sql = _read_seed()
    # Must resolve business_id dynamically from the business table
    assert "SELECT business_id" in sql or "v_biz_id" in sql


def test_seed_covers_all_six_quarters():
    sql = _read_seed()
    for quarter in ("2024Q3", "2024Q4", "2025Q1", "2025Q2", "2025Q3", "2025Q4"):
        assert quarter in sql, f"Quarter {quarter} not present in variance seed"


# ── Integration tests (require DB) ────────────────────────────────────

@pytest.mark.integration
def test_variance_rows_exist(db_conn):
    """After seed: re_asset_variance_qtr must have rows."""
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS cnt FROM re_asset_variance_qtr")
        count = cur.fetchone()["cnt"]
    assert count > 0, "re_asset_variance_qtr must have rows after 442_re_variance_seed runs"


@pytest.mark.integration
def test_variance_has_noi_line_code(db_conn):
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM re_asset_variance_qtr WHERE line_code = 'NOI'"
        )
        count = cur.fetchone()["cnt"]
    assert count > 0, "Must have NOI line code rows in re_asset_variance_qtr"


@pytest.mark.integration
def test_variance_covers_multiple_assets(db_conn):
    """Variance must cover >1 asset (not just Meridian Office Tower)."""
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(DISTINCT asset_id) AS cnt FROM re_asset_variance_qtr"
        )
        count = cur.fetchone()["cnt"]
    assert count > 1, "Variance data should cover multiple assets"


@pytest.mark.integration
def test_variance_has_expected_line_codes(db_conn):
    expected = {"GROSS_REVENUE", "VACANCY_LOSS", "EGI", "OPERATING_EXPENSE", "NOI"}
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT line_code FROM re_asset_variance_qtr"
        )
        actual = {row["line_code"] for row in cur.fetchall()}
    missing = expected - actual
    assert not missing, f"Missing line codes in re_asset_variance_qtr: {missing}"


@pytest.mark.integration
def test_variance_amounts_are_nonzero(db_conn):
    """Plan and actual amounts must not all be zero."""
    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM re_asset_variance_qtr
            WHERE ABS(actual_amount) > 0 AND ABS(plan_amount) > 0
            """
        )
        count = cur.fetchone()["cnt"]
    assert count > 0, "Variance rows must have non-zero actual and plan amounts"


@pytest.mark.integration
def test_re_run_records_exist(db_conn):
    """Each variance batch must have a corresponding re_run record."""
    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(DISTINCT v.run_id) AS cnt
            FROM re_asset_variance_qtr v
            JOIN re_run r ON r.id = v.run_id
            """
        )
        count = cur.fetchone()["cnt"]
    assert count > 0, "re_run records must exist for all variance run_ids"
