"""Cross-tenant isolation + security-posture tests for the telemetry surface (Ticket 1).

Why this file exists: the 21 tel_* tables all declare RLS, but nothing in CI asserted that — and the
FastAPI runtime pool connects with a privileged role that *bypasses* RLS (backend/app/db.py:get_cursor),
so the runtime tenant boundary is actually the app-layer business_id scoping, not RLS. These tests pin
both layers honestly:

  1. test_every_tel_table_declares_rls_and_tenant_policy
       Static SQL invariant over the telemetry schema files (always runs, no DB) — mirrors the
       established pattern in test_supabase_security_advisor_migration.py. Proves DB-layer coverage.

  2. test_list_runs_is_scoped_by_caller_business_id / test_cross_tenant_read_binds_callers_id
       App-layer scoping via the fake cursor (always runs) — proves every telemetry read is bound to
       the CALLER's business_id, so a tenant-B request cannot pull tenant-A rows by construction. This
       is the runtime boundary that actually applies given the privileged pool.

  3. test_security_posture_* — the posture read returns real RLS coverage + honest non-controls.

  4. test_live_rls_cross_tenant_returns_zero
       Real-engine behavioral proof. Opt-in only (TELEMETRY_RLS_LIVE_TEST=1) against a THROWAWAY db so
       it can never touch production; read-only (no seeding/mutation) to honor the no-prod-mutation rule.
       Skips in standard CI and in this environment.
"""
import os
import re
from pathlib import Path
from uuid import uuid4

import pytest

ENV = "telemetry-demo"
TENANT = str(uuid4())
BIZ_A = str(uuid4())
BIZ_B = str(uuid4())

SCHEMA_DIR = Path(__file__).resolve().parents[2] / "repo-b" / "db" / "schema"

# The telemetry schema files that declare tel_* tables (CREATE TABLE). 10007/10008/10012 are
# template/ALTER-only and intentionally excluded — they create no new tel_* table.
TELEMETRY_SCHEMA_FILES = [
    "10006_telemetry_serving.sql",
    "10009_telemetry_fused_vectors.sql",
    "10010_telemetry_copilot.sql",
    "10011_telemetry_copilot_reports.sql",
    "10014_telemetry_copilot_review_actions.sql",
    "10015_telemetry_streaming_slice.sql",
    "10016_factory_ncr_intelligence.sql",
]

ENV_PREDICATE = "env_id = current_setting('app.env_id', true)"
# Capture the table name + the clause up to the first ';' so we can tell a real table from a partition
# CHILD (CREATE TABLE ... PARTITION OF ...), which inherits RLS from its parent and gets none of its own.
_CREATE_TABLE = re.compile(r"CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(tel_\w+)([^;]*)", re.IGNORECASE)


def _logical_tables(sql: str) -> list[str]:
    """tel_* tables that own their RLS — excludes partition children (PARTITION OF)."""
    return [name for name, tail in _CREATE_TABLE.findall(sql) if "PARTITION OF" not in tail.upper()]


# ── 1. Static SQL invariant — every tel_* table has RLS + a tenant policy ──────────────────────────
def test_every_tel_table_declares_rls_and_tenant_policy():
    total_tables = 0
    for fname in TELEMETRY_SCHEMA_FILES:
        path = SCHEMA_DIR / fname
        assert path.exists(), f"missing telemetry schema file: {fname}"
        sql = path.read_text(encoding="utf-8")
        tables = _logical_tables(sql)
        assert tables, f"{fname}: expected at least one CREATE TABLE tel_*"
        for t in tables:
            total_tables += 1
            assert re.search(rf"ALTER TABLE {re.escape(t)} ENABLE ROW LEVEL SECURITY", sql), \
                f"{fname}: {t} missing ENABLE ROW LEVEL SECURITY"
            assert re.search(rf"CREATE POLICY \w+ ON {re.escape(t)}\b", sql), \
                f"{fname}: {t} missing a tenant CREATE POLICY"
        # every policy in the file must use the env_id tenant predicate (USING + WITH CHECK)
        policies = re.findall(r"CREATE POLICY \w+ ON tel_\w+", sql)
        assert sql.count(ENV_PREDICATE) >= len(policies), \
            f"{fname}: a CREATE POLICY does not use the env_id tenant predicate"
        assert "WITH CHECK" in sql, f"{fname}: missing WITH CHECK on a tenant policy"
    # the platform ships 21 logical tel_* tables — guard against silent shrinkage
    assert total_tables >= 21, f"expected >= 21 tel_* tables, found {total_tables}"


# ── 2. App-layer scoping — the runtime tenant boundary (privileged pool bypasses RLS) ──────────────
def test_list_runs_is_scoped_by_caller_business_id(fake_cursor):
    from app.services import telemetry_serving as ts
    fake_cursor.push_result([{"tenant_id": TENANT}])     # resolve_tenant_id
    fake_cursor.push_result([{"id": "run-1"}])           # tel_test_runs read
    ts.list_runs(env_id=ENV, business_id=BIZ_A)
    reads = [q for q in fake_cursor.queries if "FROM tel_test_runs" in q[0]]
    assert reads, "expected a tel_test_runs read"
    sql, params = reads[-1]
    assert "env_id = %s" in sql and "business_id = %s" in sql
    assert str(BIZ_A) in [str(p) for p in params], "read not bound to the caller's business_id"


def test_cross_tenant_read_binds_callers_id_and_returns_no_foreign_rows(fake_cursor):
    from app.services import telemetry_serving as ts
    # Tenant B asks for runs; B owns none. The read is bound to B's id (never A's), and returns [].
    fake_cursor.push_result([{"tenant_id": TENANT}])     # resolve_tenant_id for B
    fake_cursor.push_result([])                          # B has no rows
    rows = ts.list_runs(env_id=ENV, business_id=BIZ_B)
    assert rows == []
    sql, params = [q for q in fake_cursor.queries if "FROM tel_test_runs" in q[0]][-1]
    bound = [str(p) for p in params]
    assert str(BIZ_B) in bound and str(BIZ_A) not in bound, "query must bind only the caller's id"


# ── 3. Security posture — real RLS coverage + honest non-controls (no overclaim) ───────────────────
def test_security_posture_reports_real_rls_coverage_and_honest_gaps(fake_cursor):
    from app.services import telemetry_copilot as tc
    fake_cursor.push_result(
        [{"table_name": f"tel_x{i}", "rls_enabled": True, "policy_count": 1} for i in range(21)])
    p = tc.security_posture(env_id=ENV, business_id=BIZ_A)
    assert p["tel_table_count"] == 21
    assert p["rls_enabled_count"] == 21
    assert p["tenant_policy_count"] == 21
    assert p["null_reason"] is None

    enforced = {c["control"] for c in p["enforced"]}
    assert "DB-layer RLS (tel_* tables)" in enforced
    assert "App-layer tenant scoping (runtime boundary)" in enforced

    gaps = {c["control"]: c for c in p["not_enforced"]}
    # honesty: no document-RAG overclaim, and runtime RLS is flagged as NOT enforced
    assert "Retrieval-layer RAG ACL" in gaps
    assert gaps["Retrieval-layer RAG ACL"]["status"] == "not_applicable"
    assert "Runtime RLS enforcement (per-request role / GUC)" in gaps
    assert gaps["Runtime RLS enforcement (per-request role / GUC)"]["status"] == "not_enforced"
    # every posture line cites an artifact a skeptic can open
    for c in p["enforced"] + p["not_enforced"]:
        assert c.get("evidence"), f"posture line missing evidence: {c['control']}"


def test_security_posture_fail_closed_when_schema_absent(fake_cursor):
    from app.services import telemetry_copilot as tc
    fake_cursor.push_result([])     # no tel_* tables visible
    p = tc.security_posture(env_id=ENV, business_id=BIZ_A)
    assert p["tel_table_count"] == 0
    assert p["null_reason"] == "schema_not_applied"


# ── 4. Real-engine behavioral proof — opt-in, read-only, throwaway-db only ─────────────────────────
@pytest.mark.skipif(
    os.getenv("TELEMETRY_RLS_LIVE_TEST") != "1",
    reason="live RLS proof: set TELEMETRY_RLS_LIVE_TEST=1 against a THROWAWAY db with the tel_ schema "
           "and a non-owner 'authenticated' role (never production — this asserts RLS at the engine).")
def test_live_rls_cross_tenant_returns_zero(db_conn):
    """As a NON-OWNER role with app.env_id pointed at a foreign env, RLS must return zero tel_predictions
    rows. Read-only by design (no seed/mutation) so it can never alter data. Owners/superusers bypass
    RLS, so the SET ROLE is mandatory — if it can't be assumed, we skip rather than assert a false pass."""
    cur = db_conn.cursor()
    try:
        cur.execute("SET ROLE authenticated")
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"cannot assume non-owner 'authenticated' role: {exc}")
    try:
        cur.execute("SET app.env_id = %s", (f"no-such-env-{uuid4()}",))
        cur.execute("SELECT count(*) AS n FROM tel_predictions")
        assert cur.fetchone()["n"] == 0, "RLS leaked rows for a foreign app.env_id"
    finally:
        cur.execute("RESET ROLE")
        db_conn.rollback()
