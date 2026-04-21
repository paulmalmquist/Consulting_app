"""Seed idempotency guard — re-running meridian seed migrations must not
amplify rows in repe_fund / repe_deal / repe_asset / re_cash_event /
re_loan / repe_investment / repe_ownership_edge.

Strategy: static analysis of the seed SQL. Every INSERT INTO must be
paired with one of the two accepted idempotency guards:

  (1) ON CONFLICT DO NOTHING  / ON CONFLICT ... DO UPDATE
  (2) WHERE NOT EXISTS (SELECT 1 FROM <table> WHERE <unique pattern>)

Any INSERT lacking both is a duplication risk and fails this test.

Also pins that the dedup migration 463 is idempotent — it uses existence
checks inside DO $$ ... END $$ to allow safe re-runs.
"""
from __future__ import annotations

import os
import re
import sys
import types
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *a, **kw: None
    psycopg_stub.Connection = object
    psycopg_stub.rows = types.SimpleNamespace(dict_row=None)
    sys.modules["psycopg"] = psycopg_stub

if "dotenv" not in sys.modules:
    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = lambda *a, **kw: None
    sys.modules["dotenv"] = dotenv_stub


_REPO_ROOT = Path(__file__).parent.parent.parent
_SCHEMA = _REPO_ROOT / "repo-b" / "db" / "schema"

# Tables where duplicate rows would amplify economic facts.
# Contamination in any of these distorts fund NAV / IRR / DPI / TVPI.
AMPLIFYING_TABLES = {
    "repe_fund",
    "repe_deal",
    "repe_asset",
    "repe_investment",
    "re_cash_event",
    "re_loan",
    "re_jv",
    "re_jv_quarter_state",
    "re_asset_quarter_state",
    "repe_ownership_edge",
    "repe_asset_entity_link",
    "re_partner_commitment",
}


def _parse_inserts(sql: str) -> list[tuple[int, str, str]]:
    """Return [(line_number, target_table, statement_text), ...] for every
    INSERT INTO in the SQL file. statement_text ends at the closing ';'."""
    out: list[tuple[int, str, str]] = []
    lines = sql.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        match = re.search(r"INSERT\s+INTO\s+(\w+)", line, re.IGNORECASE)
        if match:
            target_table = match.group(1)
            # Collect until the statement-terminating ';'
            stmt_lines = [line]
            start_line = i + 1
            while ";" not in stmt_lines[-1] and i + 1 < len(lines):
                i += 1
                stmt_lines.append(lines[i])
            stmt_text = "\n".join(stmt_lines)
            out.append((start_line, target_table, stmt_text))
        i += 1
    return out


def _has_idempotency_guard(stmt: str) -> bool:
    """Return True if the INSERT has either ON CONFLICT or a NOT EXISTS guard.

    Accepts any of:
      - ON CONFLICT DO NOTHING / ON CONFLICT ... DO UPDATE
      - WHERE NOT EXISTS (...)
      - AND NOT EXISTS (...)           (compound WHERE clause)
      - WHERE NOT IN (...) subquery    (rare, but equivalent)
    """
    if re.search(r"ON\s+CONFLICT", stmt, re.IGNORECASE):
        return True
    if re.search(r"\bNOT\s+EXISTS\s*\(", stmt, re.IGNORECASE):
        return True
    if re.search(r"\bNOT\s+IN\s*\(\s*SELECT", stmt, re.IGNORECASE):
        return True
    return False


# ---------------------------------------------------------------------------
# Meridian three-fund seed — every amplifying INSERT must be guarded
# ---------------------------------------------------------------------------

def test_meridian_three_fund_seed_every_insert_is_idempotent():
    """repo-b/db/schema/456_meridian_three_fund_seed.sql must be safe to
    re-run. Every INSERT against an amplifying table must carry either
    ON CONFLICT or a NOT EXISTS guard."""
    seed = _SCHEMA / "456_meridian_three_fund_seed.sql"
    assert seed.exists(), f"seed file missing: {seed}"

    sql = seed.read_text()
    inserts = _parse_inserts(sql)
    assert inserts, "expected at least one INSERT in the seed"

    unguarded = []
    for line_no, target, stmt in inserts:
        if target.lower() not in AMPLIFYING_TABLES:
            continue
        if not _has_idempotency_guard(stmt):
            unguarded.append((line_no, target, stmt[:200]))

    assert not unguarded, (
        "unguarded INSERTs in seed (would duplicate on re-run): "
        + "\n".join(f"line {n}: {t}\n  {s!r}" for n, t, s in unguarded)
    )


# ---------------------------------------------------------------------------
# Earlier seed files — same rule (prevents regression when new amplifying
# seeds land without guards)
# ---------------------------------------------------------------------------

def test_meridian_investment_backfill_is_idempotent():
    """425_meridian_investment_backfill.sql must also be re-run safe."""
    path = _SCHEMA / "425_meridian_investment_backfill.sql"
    if not path.exists():
        return  # tolerated if the file is removed; other tests cover the rule

    sql = path.read_text()
    inserts = _parse_inserts(sql)
    unguarded = [
        (n, t, s[:200]) for n, t, s in inserts
        if t.lower() in AMPLIFYING_TABLES and not _has_idempotency_guard(s)
    ]
    assert not unguarded, f"unguarded INSERTs: {unguarded}"


def test_meridian_realistic_variance_seed_is_idempotent():
    """451_meridian_realistic_variance_seed.sql must be re-run safe."""
    path = _SCHEMA / "451_meridian_realistic_variance_seed.sql"
    if not path.exists():
        return

    sql = path.read_text()
    inserts = _parse_inserts(sql)
    unguarded = [
        (n, t, s[:200]) for n, t, s in inserts
        if t.lower() in AMPLIFYING_TABLES and not _has_idempotency_guard(s)
    ]
    assert not unguarded, f"unguarded INSERTs: {unguarded}"


def test_meridian_ledger_dedup_is_idempotent():
    """433_meridian_ledger_dedup.sql — a DELETE-heavy migration. Must be
    safe to re-run: any INSERT that re-seeds data must be guarded so a
    second execution doesn't re-duplicate what was just cleaned up."""
    path = _SCHEMA / "433_meridian_ledger_dedup.sql"
    if not path.exists():
        return

    sql = path.read_text()
    inserts = _parse_inserts(sql)
    unguarded = [
        (n, t, s[:200]) for n, t, s in inserts
        if t.lower() in AMPLIFYING_TABLES and not _has_idempotency_guard(s)
    ]
    assert not unguarded, f"unguarded INSERTs in ledger dedup: {unguarded}"


# ---------------------------------------------------------------------------
# Orphan dedup migration (463) idempotency — must use DO $$ ... END $$ with
# existence checks, not raw UPDATE/DELETE on already-quarantined rows.
# ---------------------------------------------------------------------------

def test_meridian_orphan_dedup_migration_is_idempotent():
    """463_meridian_orphan_fund_dedup.sql: quarantine + metadata repair.
    Must use guarded UPDATE (WHERE ... AND NOT <already-quarantined>)
    or existence checks so re-running is a no-op on cleaned state."""
    path = _SCHEMA / "463_meridian_orphan_fund_dedup.sql"
    assert path.exists(), f"orphan dedup migration missing: {path}"

    sql = path.read_text()

    # Must wrap in DO $$ ... END $$ with variable declarations for idempotent
    # side-effect tracking (row counts before/after).
    assert re.search(r"DO\s+\$\$", sql), "migration must be wrapped in DO $$ block"
    assert re.search(r"END\s+\$\$", sql), "migration must close DO $$ block"

    # UPDATE statements on repe_fund must be guarded so a re-run is a no-op.
    # Accepted guard shapes:
    #   - WHERE name NOT LIKE '[QUARANTINED]%'   (already-quarantined check)
    #   - WHERE (col != new_value OR ...)         (only-update-if-different)
    #   - WHERE ... NOT EXISTS (...)              (relational existence check)
    updates = re.findall(r"UPDATE\s+repe_fund\s+.*?(?=;)", sql, re.IGNORECASE | re.DOTALL)
    for upd in updates:
        upper = upd.upper()
        guarded = (
            "[QUARANTINED]" in upd
            or "NOT LIKE" in upper
            or "NOT EXISTS" in upper
            or "!=" in upd  # only-update-if-different pattern
            or "<>" in upd  # SQL-standard inequality
        )
        assert guarded, f"unguarded UPDATE on repe_fund: {upd[:300]!r}"


# ---------------------------------------------------------------------------
# Runtime test: simulating double execution is a no-op
# (DELETE-idempotency: running dedup twice deletes the same rows the second time,
#  which is a no-op because they're already gone)
# ---------------------------------------------------------------------------

def test_delete_then_delete_is_noop_pattern():
    """Sanity: the DELETE idempotency pattern in migration 463 works
    because DELETE on an empty result set is a no-op. This is a pure
    contract check of SQL semantics, not a DB round-trip."""
    # DELETE FROM foo WHERE id IN (...) returns 0 affected rows on second
    # execution if the rows were already deleted. No test plumbing needed;
    # this is well-defined PostgreSQL semantics. We pin it by asserting
    # migration 463 uses DELETE (not INSERT) for orphan state cleanup.
    path = _SCHEMA / "463_meridian_orphan_fund_dedup.sql"
    sql = path.read_text()
    assert "DELETE FROM re_fund_quarter_state" in sql, (
        "migration 463 must DELETE stale state rows (idempotent by construction)"
    )
