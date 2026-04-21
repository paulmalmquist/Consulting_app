"""Hierarchical reconciliation endpoint — Part A6 regression test.

Validates the reconciliation service surfaces the correct flags under:
  - clean state (rollup matches fund snapshot)         → within_tolerance
  - ownership mismatch (rollup != snapshot)            → delta_gt_1usd
  - unreleased snapshot (no released authoritative)    → stale_snapshot
  - null metric (authoritative but no ending_nav)      → null_by_design
  - mixed: some funds released, some not               → per-fund flag

Per plan §A6. Pins the parent_expected semantics explicitly:
  investment-level   parent_expected = fund snapshot ending_nav
  fund-level         parent_expected = portfolio aggregation of released funds
  portfolio-level    parent_expected = None (top of chain)

Mock/patch-based, no DB. Patches at service boundaries:
  - get_cursor (for fund + investment topology)
  - get_authoritative_state (fund snapshot lookup)
  - rollup_investment (investment NAV computation)
"""
from __future__ import annotations

import os
import sys
import types
from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

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


# ---------------------------------------------------------------------------
# Cursor harness — scripts the sequence of queries executed by
# build_environment_reconciliation: (1) fund list, (2) per-fund investments
# ---------------------------------------------------------------------------

class ScriptedCursor:
    """Returns queued results in FIFO order from fetchall()."""

    def __init__(self, queued_results: list[list[dict]]):
        self.queue = list(queued_results)
        self.executed: list[tuple[str, tuple]] = []

    def execute(self, sql: str, params=()):
        self.executed.append((sql, params))
        return self

    def fetchall(self):
        return self.queue.pop(0) if self.queue else []

    def fetchone(self):
        rows = self.queue.pop(0) if self.queue else []
        return rows[0] if rows else None


def _cursor_factory(queued_results: list[list[dict]]):
    """Return a get_cursor-compatible context manager yielding a ScriptedCursor."""
    cur = ScriptedCursor(queued_results)

    @contextmanager
    def fake_get_cursor():
        yield cur

    return fake_get_cursor, cur


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------

FUND_A = str(uuid4())
FUND_B = str(uuid4())
INV_A1 = str(uuid4())
INV_A2 = str(uuid4())
INV_B1 = str(uuid4())


def _released_auth(fund_id: str, ending_nav: str, snapshot_version: str = "v1") -> dict:
    return {
        "entity_type": "fund",
        "entity_id": fund_id,
        "quarter": "2026Q2",
        "requested_quarter": "2026Q2",
        "period_exact": True,
        "state_origin": "authoritative",
        "audit_run_id": "run-1",
        "snapshot_version": snapshot_version,
        "promotion_state": "released",
        "trust_status": "trusted",
        "breakpoint_layer": None,
        "null_reason": None,
        "state": {
            "period_start": "2026-04-01",
            "period_end": "2026-06-30",
            "canonical_metrics": {"ending_nav": ending_nav},
            "display_metrics": {},
        },
        "null_reasons": {},
        "formulas": {},
        "provenance": [],
        "artifact_paths": {},
    }


def _unreleased_auth(fund_id: str) -> dict:
    return {
        "entity_type": "fund",
        "entity_id": fund_id,
        "quarter": "2026Q2",
        "requested_quarter": "2026Q2",
        "period_exact": False,
        "state_origin": "fallback",
        "audit_run_id": None,
        "snapshot_version": None,
        "promotion_state": None,
        "trust_status": "missing_source",
        "breakpoint_layer": None,
        "null_reason": "authoritative_state_not_released",
        "state": None,
        "null_reasons": {},
        "formulas": {},
        "provenance": [],
        "artifact_paths": {},
    }


def _rollup(agg_nav: str) -> dict:
    return {"agg_nav": Decimal(agg_nav), "gross_asset_value": Decimal("0"), "debt_balance": Decimal("0")}


# ---------------------------------------------------------------------------
# Clean reconciliation — rollup matches snapshot → within_tolerance
# ---------------------------------------------------------------------------

def test_clean_reconciliation_all_within_tolerance():
    """Two funds, each with one investment. Rollup NAV == snapshot NAV.
    All flags should be within_tolerance. Portfolio expected = sum of
    released fund NAVs."""
    from app.services import re_reconciliation

    queued_results = [
        # Fund list
        [{"fund_id": FUND_A, "name": "Alpha Fund"}, {"fund_id": FUND_B, "name": "Beta Fund"}],
        # Investments for fund A
        [{"investment_id": INV_A1, "name": "Alpha Inv 1"}],
        # Investments for fund B
        [{"investment_id": INV_B1, "name": "Beta Inv 1"}],
        # re_investment_quarter_state nav lookup (batched across all investments)
        [
            {"investment_id": INV_A1, "nav": Decimal("100000000")},
            {"investment_id": INV_B1, "nav": Decimal("50000000")},
        ],
    ]
    fake_get_cursor, _ = _cursor_factory(queued_results)

    auth_map = {
        FUND_A: _released_auth(FUND_A, "100000000", "v-alpha"),
        FUND_B: _released_auth(FUND_B, "50000000", "v-beta"),
    }

    with patch.object(re_reconciliation, "get_cursor", fake_get_cursor), \
         patch("app.services.re_authoritative_snapshots.get_authoritative_state", side_effect=lambda **kw: auth_map[kw["entity_id"]]):
        rows = re_reconciliation.build_environment_reconciliation(
            env_id=uuid4(), business_id=uuid4(), quarter="2026Q2",
        )

    assert len(rows) == 2 + 2 + 1, f"expected 2 inv + 2 fund + 1 portfolio = 5 rows; got {len(rows)}"

    # Investment rows — within tolerance since each fund's sole investment
    # exactly ties to the fund snapshot.
    inv_rows = [r for r in rows if r["level"] == "investment"]
    assert all(r["flag"] == "within_tolerance" for r in inv_rows), (
        f"investment flags: {[r['flag'] for r in inv_rows]}"
    )

    # Fund rows — rollup matches snapshot, so within_tolerance.
    fund_rows = [r for r in rows if r["level"] == "fund"]
    assert len(fund_rows) == 2
    for r in fund_rows:
        assert r["flag"] == "within_tolerance", f"fund {r['entity_name']} flagged {r['flag']}"
        assert r["source_origin"] == "authoritative"
        assert r["promotion_state"] == "released"
        assert r["snapshot_version"] in ("v-alpha", "v-beta")

    # Portfolio row — rollup sum $150M == portfolio_expected $150M.
    portfolio = [r for r in rows if r["level"] == "portfolio"][0]
    assert portfolio["flag"] == "within_tolerance"
    assert portfolio["raw_value"] == "150000000"
    assert portfolio["parent_contribution"] == "150000000"


# ---------------------------------------------------------------------------
# Ownership mismatch — rollup $100M but snapshot claims $90M → delta_gt_1usd
# ---------------------------------------------------------------------------

def test_ownership_mismatch_surfaces_as_delta_gt_1usd():
    """Fund snapshot claims ending_nav=$90M but the sum of investment
    rollups is $100M. Delta = $10M. Flag = delta_gt_1usd.

    This is the Patch A / ownership regression detector: if the rollup
    stops applying ownership once (or applies it twice), this flag fires."""
    from app.services import re_reconciliation

    queued_results = [
        [{"fund_id": FUND_A, "name": "Alpha Fund"}],
        [{"investment_id": INV_A1, "name": "Alpha Inv 1"}, {"investment_id": INV_A2, "name": "Alpha Inv 2"}],
        # re_investment_quarter_state nav lookup
        [
            {"investment_id": INV_A1, "nav": Decimal("60000000")},
            {"investment_id": INV_A2, "nav": Decimal("40000000")},
        ],
    ]
    fake_get_cursor, _ = _cursor_factory(queued_results)

    auth_map = {FUND_A: _released_auth(FUND_A, "90000000")}

    with patch.object(re_reconciliation, "get_cursor", fake_get_cursor), \
         patch("app.services.re_authoritative_snapshots.get_authoritative_state", side_effect=lambda **kw: auth_map[kw["entity_id"]]):
        rows = re_reconciliation.build_environment_reconciliation(
            env_id=uuid4(), business_id=uuid4(), quarter="2026Q2",
        )

    fund_row = [r for r in rows if r["level"] == "fund"][0]
    assert fund_row["flag"] == "delta_gt_1usd", f"expected delta_gt_1usd; got {fund_row['flag']}"
    assert fund_row["parent_contribution"] == "90000000"  # snapshot claim
    assert fund_row["raw_value"] == "100000000"           # rollup result
    assert Decimal(fund_row["delta"]) == Decimal("10000000")


# ---------------------------------------------------------------------------
# Unreleased snapshot → stale_snapshot
# ---------------------------------------------------------------------------

def test_unreleased_snapshot_flags_stale():
    """Fund has no released authoritative snapshot (state_origin=fallback).
    Fund row flag = stale_snapshot; investment rows also stale_snapshot
    since parent_expected is None. Portfolio expected excludes this fund."""
    from app.services import re_reconciliation

    queued_results = [
        [{"fund_id": FUND_A, "name": "Alpha Fund"}],
        [{"investment_id": INV_A1, "name": "Alpha Inv 1"}],
        [{"investment_id": INV_A1, "nav": Decimal("60000000")}],
    ]
    fake_get_cursor, _ = _cursor_factory(queued_results)

    auth_map = {FUND_A: _unreleased_auth(FUND_A)}

    with patch.object(re_reconciliation, "get_cursor", fake_get_cursor), \
         patch("app.services.re_authoritative_snapshots.get_authoritative_state", side_effect=lambda **kw: auth_map[kw["entity_id"]]):
        rows = re_reconciliation.build_environment_reconciliation(
            env_id=uuid4(), business_id=uuid4(), quarter="2026Q2",
        )

    fund_row = [r for r in rows if r["level"] == "fund"][0]
    assert fund_row["flag"] == "stale_snapshot"
    assert fund_row["source_origin"] == "fallback"
    assert fund_row["promotion_state"] is None
    assert fund_row["snapshot_version"] is None

    inv_row = [r for r in rows if r["level"] == "investment"][0]
    assert inv_row["flag"] == "stale_snapshot"
    assert inv_row["parent_expected"] is None

    # Portfolio expected = 0 since no released fund NAV to sum.
    portfolio = [r for r in rows if r["level"] == "portfolio"][0]
    assert Decimal(portfolio["parent_contribution"]) == Decimal("0")


# ---------------------------------------------------------------------------
# Parent-expected semantics — explicit per-level assertions
# ---------------------------------------------------------------------------

def test_parent_expected_semantics_per_level():
    """Pin the contract: investment→fund snapshot, fund→portfolio sum,
    portfolio→None. If the reconciliation service ever changes these
    semantics without updating consumers, this test catches it."""
    from app.services import re_reconciliation

    queued_results = [
        [{"fund_id": FUND_A, "name": "Alpha Fund"}, {"fund_id": FUND_B, "name": "Beta Fund"}],
        [{"investment_id": INV_A1, "name": "Alpha Inv 1"}],
        [{"investment_id": INV_B1, "name": "Beta Inv 1"}],
        [
            {"investment_id": INV_A1, "nav": Decimal("100000000")},
            {"investment_id": INV_B1, "nav": Decimal("50000000")},
        ],
    ]
    fake_get_cursor, _ = _cursor_factory(queued_results)

    auth_map = {
        FUND_A: _released_auth(FUND_A, "100000000"),
        FUND_B: _released_auth(FUND_B, "50000000"),
    }

    with patch.object(re_reconciliation, "get_cursor", fake_get_cursor), \
         patch("app.services.re_authoritative_snapshots.get_authoritative_state", side_effect=lambda **kw: auth_map[kw["entity_id"]]):
        rows = re_reconciliation.build_environment_reconciliation(
            env_id=uuid4(), business_id=uuid4(), quarter="2026Q2",
        )

    # Investment rows: parent_expected = their fund's snapshot ending_nav
    inv_a = next(r for r in rows if r["entity_id"] == INV_A1)
    assert Decimal(inv_a["parent_expected"]) == Decimal("100000000")

    inv_b = next(r for r in rows if r["entity_id"] == INV_B1)
    assert Decimal(inv_b["parent_expected"]) == Decimal("50000000")

    # Fund rows: parent_expected = portfolio aggregation ($150M)
    fund_a = next(r for r in rows if r["level"] == "fund" and r["entity_id"] == FUND_A)
    assert Decimal(fund_a["parent_expected"]) == Decimal("150000000")

    # Portfolio row: parent_expected = None (top of chain)
    portfolio = next(r for r in rows if r["level"] == "portfolio")
    assert portfolio["parent_expected"] is None


# ---------------------------------------------------------------------------
# Fund-level rows carry audit-trail fields (plan §A6 requirement)
# ---------------------------------------------------------------------------

def test_fund_rows_carry_snapshot_version_and_source_origin():
    """Plan §A6 requires source_origin and snapshot_version on fund rows
    so stale-snapshot vs. logic-error is unambiguous."""
    from app.services import re_reconciliation

    queued_results = [
        [{"fund_id": FUND_A, "name": "Alpha Fund"}],
        [{"investment_id": INV_A1, "name": "Alpha Inv 1"}],
        [{"investment_id": INV_A1, "nav": Decimal("100000000")}],
    ]
    fake_get_cursor, _ = _cursor_factory(queued_results)

    auth_map = {FUND_A: _released_auth(FUND_A, "100000000", snapshot_version="meridian-20260419-eb7e1153")}

    with patch.object(re_reconciliation, "get_cursor", fake_get_cursor), \
         patch("app.services.re_authoritative_snapshots.get_authoritative_state", side_effect=lambda **kw: auth_map[kw["entity_id"]]):
        rows = re_reconciliation.build_environment_reconciliation(
            env_id=uuid4(), business_id=uuid4(), quarter="2026Q2",
        )

    fund_row = [r for r in rows if r["level"] == "fund"][0]
    assert fund_row["source_origin"] == "authoritative"
    assert fund_row["snapshot_version"] == "meridian-20260419-eb7e1153"
    assert fund_row["promotion_state"] == "released"


# ---------------------------------------------------------------------------
# Flag helper unit tests
# ---------------------------------------------------------------------------

def test_flag_delta_tolerance_thresholds():
    """Verify _flag_delta classifies correctly around tolerance boundaries."""
    from app.services.re_reconciliation import _flag_delta

    # Within $1 absolute → within_tolerance
    assert _flag_delta(Decimal("0.50"), Decimal("1000000")) == "within_tolerance"
    # Within 0.1% relative → within_tolerance
    assert _flag_delta(Decimal("500"), Decimal("1000000")) == "within_tolerance"  # 0.05%
    # Above both → delta_gt_1usd
    assert _flag_delta(Decimal("10000"), Decimal("1000000")) == "delta_gt_1usd"
    # Null delta or base → null_by_design
    assert _flag_delta(None, Decimal("1000000")) == "null_by_design"
    assert _flag_delta(Decimal("100"), None) == "null_by_design"
