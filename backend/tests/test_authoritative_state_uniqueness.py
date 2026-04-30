"""Regression tests for the released-snapshot uniqueness invariant.

These tests connect to the real database via DATABASE_URL and verify:

  1. The four authoritative tables each have a partial unique index on
     (entity_id, quarter) WHERE promotion_state = 'released'.
  2. INSERT of a duplicate released row fails with UniqueViolation.
  3. UPDATE draft_audit -> released fails with UniqueViolation when a
     canonical released row already exists.
  4. The trigger allows released -> superseded ONLY when superseded_at AND
     superseded_by are both set, and forbids superseded_by = OLD.id.
  5. Superseded rows cannot be re-promoted (terminal state).

Skipped if DATABASE_URL is not set (CI without DB credentials).
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def db_conn():
    """Yield a psycopg connection. Skip the suite if DB is unavailable."""
    try:
        import psycopg  # type: ignore[import-not-found]
        from dotenv import load_dotenv  # type: ignore[import-not-found]
    except ImportError:
        pytest.skip("psycopg / python-dotenv not installed")

    load_dotenv(ROOT / "backend" / ".env")
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        pytest.skip("DATABASE_URL not set")

    try:
        conn = psycopg.connect(dsn)
    except psycopg.OperationalError as exc:
        pytest.skip(f"DATABASE_URL unavailable: {exc}")
    yield conn
    conn.close()


@pytest.fixture
def rollback(db_conn):
    """Each test gets a fresh transaction that is always rolled back."""
    yield
    db_conn.rollback()


def test_partial_unique_indexes_exist_on_all_four_tables(db_conn):
    """Each table must have a partial unique index restricting one
    released row per (entity_id, quarter)."""
    expected = {
        "re_authoritative_fund_state_qtr": "fund_id",
        "re_authoritative_asset_state_qtr": "asset_id",
        "re_authoritative_investment_state_qtr": "investment_id",
        "re_authoritative_fund_gross_to_net_qtr": "fund_id",
    }
    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT tablename, indexname, indexdef
            FROM pg_indexes
            WHERE indexname LIKE 'idx_re_authoritative%one_release%'
            """
        )
        rows = cur.fetchall()

    found_tables = {r[0] for r in rows}
    assert found_tables == set(expected.keys()), (
        f"missing indexes on: {set(expected.keys()) - found_tables}"
    )
    for tablename, _idx, indexdef in rows:
        ent_col = expected[tablename]
        assert "UNIQUE" in indexdef.upper()
        assert ent_col in indexdef
        assert "quarter" in indexdef
        assert "promotion_state = 'released'" in indexdef


def test_insert_duplicate_released_fund_row_fails(db_conn, rollback):
    """A direct INSERT of a second released row for the same (fund, quarter)
    must hit the partial unique index and fail."""
    import psycopg

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT fund_id, business_id, env_id, quarter, audit_run_id
            FROM re_authoritative_fund_state_qtr
            WHERE promotion_state = 'released'
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            pytest.skip("no released rows in DB to collide with")
        fund_id, business_id, env_id, quarter, _ = row

        cur.execute(
            """
            INSERT INTO re_authoritative_snapshot_run
              (audit_run_id, snapshot_version, env_id, business_id,
               methodology_version, sample_manifest, artifact_root,
               run_status, findings_summary, created_by)
            VALUES
              (gen_random_uuid(),
               'uq-gate-test-' || extract(epoch from now())::text,
               %s, %s, 'test', '{}'::jsonb, '/tmp/test',
               'draft_audit', '{}'::jsonb, 'uq-gate-test')
            RETURNING audit_run_id
            """,
            (env_id, business_id),
        )
        run_id = cur.fetchone()[0]

        with pytest.raises(psycopg.errors.UniqueViolation):
            cur.execute(
                """
                INSERT INTO re_authoritative_fund_state_qtr
                  (audit_run_id, snapshot_version, promotion_state,
                   env_id, business_id, fund_id, quarter,
                   period_start, period_end, trust_status,
                   canonical_metrics, display_metrics, null_reasons,
                   formulas, provenance, source_row_refs, artifact_paths,
                   inputs_hash)
                VALUES (%s, 'uq-gate-test-direct-release', 'released',
                   %s, %s, %s, %s,
                   '2026-04-01'::date, '2026-06-30'::date, 'trusted',
                   '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
                   '{}'::jsonb, 'uq-gate-test-hash')
                """,
                (run_id, env_id, business_id, fund_id, quarter),
            )


def test_promote_draft_to_released_fails_when_canonical_exists(db_conn, rollback):
    """Inserting a draft for an already-released (fund, quarter) is allowed
    (the partial idx is restricted to released), but PROMOTING it to
    released must fail."""
    import psycopg

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT fund_id, business_id, env_id, quarter
            FROM re_authoritative_fund_state_qtr
            WHERE promotion_state = 'released'
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            pytest.skip("no released rows in DB")
        fund_id, business_id, env_id, quarter = row

        cur.execute(
            """
            INSERT INTO re_authoritative_snapshot_run
              (audit_run_id, snapshot_version, env_id, business_id,
               methodology_version, sample_manifest, artifact_root,
               run_status, findings_summary, created_by)
            VALUES
              (gen_random_uuid(),
               'uq-promote-test-' || extract(epoch from now())::text,
               %s, %s, 'test', '{}'::jsonb, '/tmp/test',
               'draft_audit', '{}'::jsonb, 'uq-promote-test')
            RETURNING audit_run_id
            """,
            (env_id, business_id),
        )
        run_id = cur.fetchone()[0]

        cur.execute(
            """
            INSERT INTO re_authoritative_fund_state_qtr
              (audit_run_id, snapshot_version, promotion_state,
               env_id, business_id, fund_id, quarter,
               period_start, period_end, trust_status,
               canonical_metrics, display_metrics, null_reasons,
               formulas, provenance, source_row_refs, artifact_paths,
               inputs_hash)
            VALUES (%s, 'uq-promote-test-draft', 'draft_audit',
               %s, %s, %s, %s,
               '2026-04-01'::date, '2026-06-30'::date, 'trusted',
               '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
               '{}'::jsonb, 'uq-promote-test-hash')
            RETURNING id
            """,
            (run_id, env_id, business_id, fund_id, quarter),
        )
        draft_id = cur.fetchone()[0]

        with pytest.raises(psycopg.errors.UniqueViolation):
            cur.execute(
                """
                UPDATE re_authoritative_fund_state_qtr
                SET promotion_state = 'released',
                    released_at = NOW(),
                    released_by = 'uq-promote-test'
                WHERE id = %s
                """,
                (draft_id,),
            )


def test_supersede_requires_both_superseded_at_and_by(db_conn, rollback):
    """The trigger forbids released -> superseded unless both
    superseded_at AND superseded_by are set."""
    import psycopg

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM re_authoritative_fund_state_qtr
            WHERE promotion_state = 'released'
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            pytest.skip("no released rows in DB")
        canonical_id = row[0]

        with pytest.raises(psycopg.errors.RaiseException) as exc_info:
            cur.execute(
                """
                UPDATE re_authoritative_fund_state_qtr
                SET promotion_state = 'superseded',
                    superseded_at = NOW()
                    -- superseded_by intentionally omitted
                WHERE id = %s
                """,
                (canonical_id,),
            )
        assert "superseded_at AND superseded_by" in str(exc_info.value)


def test_self_supersede_forbidden(db_conn, rollback):
    """A row cannot point its superseded_by at itself."""
    import psycopg

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM re_authoritative_fund_state_qtr
            WHERE promotion_state = 'released'
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            pytest.skip("no released rows in DB")
        canonical_id = row[0]

        with pytest.raises(psycopg.errors.RaiseException) as exc_info:
            cur.execute(
                """
                UPDATE re_authoritative_fund_state_qtr
                SET promotion_state = 'superseded',
                    superseded_at = NOW(),
                    superseded_by = id
                WHERE id = %s
                """,
                (canonical_id,),
            )
        assert "supersede itself" in str(exc_info.value)


def test_superseded_is_terminal(db_conn, rollback):
    """Once superseded, a row cannot transition back to anything else."""
    import psycopg

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM re_authoritative_fund_state_qtr
            WHERE promotion_state = 'superseded'
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            pytest.skip("no superseded rows in DB to test terminal-state guard")
        sup_id = row[0]

        for target in ("released", "verified", "draft_audit"):
            with pytest.raises(psycopg.errors.RaiseException) as exc_info:
                cur.execute(
                    """
                    UPDATE re_authoritative_fund_state_qtr
                    SET promotion_state = %s
                    WHERE id = %s
                    """,
                    (target, sup_id),
                )
            assert "Superseded" in str(exc_info.value) and "terminal" in str(exc_info.value)
            db_conn.rollback()


def test_no_duplicate_released_rows_currently_in_db(db_conn):
    """Belt-and-suspenders: the cleanup must have left zero duplicates."""
    with db_conn.cursor() as cur:
        for table, ent_col in [
            ("re_authoritative_fund_state_qtr", "fund_id"),
            ("re_authoritative_asset_state_qtr", "asset_id"),
            ("re_authoritative_investment_state_qtr", "investment_id"),
            ("re_authoritative_fund_gross_to_net_qtr", "fund_id"),
        ]:
            cur.execute(
                f"""
                SELECT {ent_col}, quarter, COUNT(*)
                FROM {table}
                WHERE promotion_state = 'released'
                GROUP BY 1, 2
                HAVING COUNT(*) > 1
                """
            )
            duplicates = cur.fetchall()
            assert duplicates == [], (
                f"{table} has duplicate released rows: {duplicates}"
            )
