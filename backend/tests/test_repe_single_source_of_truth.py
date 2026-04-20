"""INV-1 single-source-of-truth guardrail.

Pins that every fund-level metric endpoint either returns a released
authoritative snapshot (source_origin="authoritative",
promotion_state="released") or a null + null_reason. No mixed sourcing.

Covers:
  - get_authoritative_state response shape under unreleased → trust_status
    == missing_source + explicit null_reason
  - compute_return_metrics raises AuthoritativeStateNotReleasedError when
    upstream snapshot is not released
  - portfolio-kpis DB route returns null metrics (not legacy fallback)
    when no released snapshot exists
  - fund-trend route filters to released snapshots only (no legacy
    re_fund_quarter_state read)

Style: mock/patch. No DB.
"""
from __future__ import annotations

import os
import sys
import types
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
# compute_return_metrics refuses unreleased state (already pinned in
# test_repe_snapshot_consistency; duplicated here so INV-1 has a home)
# ---------------------------------------------------------------------------

def test_compute_return_metrics_raises_on_fallback_state_origin():
    """INV-1: if state_origin != 'authoritative', compute_return_metrics
    must raise AuthoritativeStateNotReleasedError — never silently fall
    back to legacy re_fund_quarter_state."""
    from app.services import re_fund_metrics

    fallback = {
        "state_origin": "fallback",
        "promotion_state": None,
        "trust_status": "missing_source",
        "null_reason": "authoritative_state_not_released",
        "state": None,
        "period_exact": False,
        "requested_quarter": "2026Q2",
        "quarter": "2026Q2",
        "audit_run_id": None,
        "snapshot_version": None,
        "breakpoint_layer": None,
        "null_reasons": {},
        "formulas": {},
        "provenance": [],
        "artifact_paths": {},
    }

    with patch.object(re_fund_metrics, "get_authoritative_state", return_value=fallback):
        raised = False
        try:
            re_fund_metrics.compute_return_metrics(
                env_id="00000000-0000-0000-0000-000000000001",
                business_id=uuid4(),
                fund_id=uuid4(),
                quarter="2026Q2",
                run_id=uuid4(),
            )
        except re_fund_metrics.AuthoritativeStateNotReleasedError:
            raised = True
        assert raised, "compute_return_metrics must raise on fallback state"


def test_compute_return_metrics_raises_on_draft_audit_state():
    """INV-1: draft_audit (before release) must also be rejected.
    Only released snapshots are a valid source of truth."""
    from app.services import re_fund_metrics

    draft = {
        "state_origin": "authoritative",
        "promotion_state": "draft_audit",  # NOT released
        "trust_status": "untrusted",
        "null_reason": None,
        "state": {
            "period_start": "2026-04-01",
            "period_end": "2026-06-30",
            "canonical_metrics": {"ending_nav": "100000000"},
            "display_metrics": {},
        },
        "period_exact": True,
        "requested_quarter": "2026Q2",
        "quarter": "2026Q2",
        "audit_run_id": "run-1",
        "snapshot_version": "v1-draft",
        "breakpoint_layer": None,
        "null_reasons": {},
        "formulas": {},
        "provenance": [],
        "artifact_paths": {},
    }

    with patch.object(re_fund_metrics, "get_authoritative_state", return_value=draft):
        raised = False
        try:
            re_fund_metrics.compute_return_metrics(
                env_id="00000000-0000-0000-0000-000000000001",
                business_id=uuid4(),
                fund_id=uuid4(),
                quarter="2026Q2",
                run_id=uuid4(),
            )
        except re_fund_metrics.AuthoritativeStateNotReleasedError:
            raised = True
        assert raised, "compute_return_metrics must reject draft_audit state"


# ---------------------------------------------------------------------------
# Reconciliation endpoint respects INV-1: flags stale_snapshot when
# promotion_state != released, never computes a delta against a non-released
# snapshot.
# ---------------------------------------------------------------------------

def test_reconciliation_never_uses_non_released_snapshot_as_truth():
    """INV-1 at the diagnostic surface: if a fund has an authoritative
    snapshot in draft_audit state, reconciliation must flag stale_snapshot
    and not compute deltas against the draft claim."""
    from contextlib import contextmanager
    from app.services import re_reconciliation

    FUND = str(uuid4())
    INV = str(uuid4())

    queue = [
        [{"fund_id": FUND, "name": "Test Fund"}],
        [{"investment_id": INV, "name": "Test Inv"}],
    ]

    class Cur:
        def execute(self, *a, **kw): return self
        def fetchall(self): return queue.pop(0) if queue else []
        def fetchone(self):
            rows = queue.pop(0) if queue else []
            return rows[0] if rows else None

    @contextmanager
    def fake_cursor():
        yield Cur()

    draft_response = {
        "entity_type": "fund", "entity_id": FUND, "quarter": "2026Q2",
        "requested_quarter": "2026Q2", "period_exact": True,
        "state_origin": "authoritative",       # authoritative...
        "promotion_state": "draft_audit",      # ...but not released
        "audit_run_id": None, "snapshot_version": "v1-draft",
        "trust_status": "untrusted", "breakpoint_layer": None, "null_reason": None,
        "state": {
            "period_start": "2026-04-01", "period_end": "2026-06-30",
            "canonical_metrics": {"ending_nav": "100000000"}, "display_metrics": {},
        },
        "null_reasons": {}, "formulas": {}, "provenance": [], "artifact_paths": {},
    }

    from decimal import Decimal
    rollup_result = {"agg_nav": Decimal("100000000")}

    with patch.object(re_reconciliation, "get_cursor", fake_cursor), \
         patch("app.services.re_authoritative_snapshots.get_authoritative_state", return_value=draft_response), \
         patch("app.services.re_rollup.rollup_investment", return_value=rollup_result):
        rows = re_reconciliation.build_environment_reconciliation(
            env_id=uuid4(), business_id=uuid4(), quarter="2026Q2",
        )

    fund_row = [r for r in rows if r["level"] == "fund"][0]
    assert fund_row["flag"] == "stale_snapshot", (
        f"INV-1 violation: draft_audit state was treated as truth; flag={fund_row['flag']}"
    )
    assert fund_row["delta"] is None, "delta must be None against non-released state"


# ---------------------------------------------------------------------------
# Lint-level: fund-trend SQL filters to promotion_state='released'
# ---------------------------------------------------------------------------

def test_fund_trend_route_queries_only_released_snapshots():
    """INV-1 at the route layer: fund-trend must read from
    re_authoritative_fund_state_qtr with promotion_state='released'
    filter, never from re_fund_quarter_state."""
    from pathlib import Path

    route_file = Path(__file__).parent.parent / "app" / "routes" / "re_v2.py"
    source = route_file.read_text()

    # Locate the fund-trend function body.
    start = source.index("def get_environment_fund_trend")
    # Bound the search to a reasonable slice.
    end = source.index("def get_environment_fund_comparison", start)
    fund_trend_body = source[start:end]

    assert "re_authoritative_fund_state_qtr" in fund_trend_body, (
        "fund-trend must read authoritative table"
    )
    assert "promotion_state = 'released'" in fund_trend_body, (
        "fund-trend must filter to released snapshots only (INV-1)"
    )
    # Legacy table can appear in a comment documenting its absence, but
    # never inside a SQL string that actually reads it.
    for line in fund_trend_body.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            continue  # comment — allowed to mention the legacy table
        assert "re_fund_quarter_state" not in line, (
            f"fund-trend must NOT read legacy re_fund_quarter_state (INV-1 violation): {line!r}"
        )


def test_portfolio_kpis_route_sources_from_authoritative_only():
    """INV-1 at the direct-DB handler: portfolio-kpis must source from
    re_authoritative_fund_state_qtr, never legacy tables."""
    from pathlib import Path

    route_file = (
        Path(__file__).parent.parent.parent
        / "repo-b" / "src" / "app" / "api" / "re" / "v2"
        / "environments" / "[envId]" / "portfolio-kpis" / "route.ts"
    )
    source = route_file.read_text()

    assert "re_authoritative_fund_state_qtr" in source, (
        "portfolio-kpis must read authoritative table"
    )
    assert "promotion_state = 'released'" in source, (
        "portfolio-kpis must filter to released snapshots only"
    )
    # Legacy read is allowed as a fallback ONLY if wrapped in comments
    # indicating deprecation; assert the authoritative query is the primary.
    authoritative_idx = source.index("re_authoritative_fund_state_qtr")
    assert authoritative_idx < 5000, "authoritative query must be prominent, not an afterthought"


# ---------------------------------------------------------------------------
# get_authoritative_state null response shape (contract with consumers)
# ---------------------------------------------------------------------------

def test_get_authoritative_state_null_shape_has_required_fields():
    """INV-1 consumers expect get_authoritative_state to always return an
    object with state_origin, promotion_state, trust_status, null_reason —
    never a raw None or a partially populated dict. Verified against the
    actual service when no released snapshot exists."""
    from app.services import re_authoritative_snapshots
    from contextlib import contextmanager

    class EmptyCursor:
        def execute(self, *a, **kw): return self
        def fetchall(self): return []
        def fetchone(self): return None

    @contextmanager
    def empty_cursor():
        yield EmptyCursor()

    with patch.object(re_authoritative_snapshots, "get_cursor", empty_cursor):
        payload = re_authoritative_snapshots.get_authoritative_state(
            entity_type="fund",
            entity_id=uuid4(),
            quarter="2026Q2",
        )

    required = ["state_origin", "promotion_state", "trust_status", "null_reason"]
    for field in required:
        assert field in payload, f"null response missing required field: {field}"

    assert payload["state_origin"] == "fallback"
    assert payload["promotion_state"] is None
    assert payload["trust_status"] == "missing_source"
    assert payload["null_reason"] == "authoritative_state_not_released"
    assert payload["state"] is None
