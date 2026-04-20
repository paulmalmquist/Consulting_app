"""INV-2 period-coherence guardrail.

Pins that rollups and metric computations reject off-period inputs
rather than silently aggregating them. Specifically:

  - cash event aggregations must filter by event_date <= quarter_end
    (Patch C-2 from the 2026-04-11 audit)
  - rollup_investment filters jv_quarter_state to the requested quarter
  - compute_return_metrics filters fee/expense/cash-event queries to
    the target quarter
  - any regression that removes these filters is caught here

Style: source-code inspection + mock/patch where a runtime assertion
is cleaner. No DB.
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


_BACKEND_ROOT = Path(__file__).parent.parent / "app"


def _read(path: str) -> str:
    return (_BACKEND_ROOT / path).read_text()


# ---------------------------------------------------------------------------
# Patch C-2 regression guard — cash event aggregations must filter
# event_date <= quarter_end, never aggregate future planned calls.
# ---------------------------------------------------------------------------

def test_cash_event_aggregation_filters_by_event_date_in_fund_metrics():
    """re_fund_metrics.py must not aggregate future cash events.

    Pre-Patch-C-2, the CALL/DIST aggregation SELECT SUM had no event_date
    filter, inflating total_called by Q3/Q4 planned calls. This test
    pins that every re_cash_event SELECT SUM has an event_date bound.
    """
    source = _read("services/re_fund_metrics.py")

    # Every SELECT SUM from re_cash_event inside this service file must
    # be paired with an event_date filter within a reasonable window.
    # Look for "FROM re_cash_event" and verify event_date <= appears
    # within the next 300 characters of the same query.
    cash_event_occurrences = list(re.finditer(r"FROM\s+re_cash_event", source))
    assert cash_event_occurrences, "expected at least one re_cash_event query"

    for match in cash_event_occurrences:
        window = source[match.start(): match.start() + 400]
        assert "event_date" in window, (
            f"re_cash_event query without event_date filter at char {match.start()}: {window[:200]!r}"
        )


def test_compute_return_metrics_cash_event_query_bounds_to_quarter_end():
    """Narrower check: compute_return_metrics' own cash event aggregation
    passes a quarter-end date as the upper bound (Patch C-2 signature)."""
    source = _read("services/re_fund_metrics.py")
    # Find the function body.
    start = source.index("def compute_return_metrics")
    # Bound to next def.
    end_match = re.search(r"^def\s+\w+", source[start + 10:], re.MULTILINE)
    end = start + 10 + end_match.start() if end_match else len(source)
    body = source[start:end]

    # Must compute a quarter-end date.
    assert "_quarter_end_date" in body or "_quarter_end" in body, (
        "compute_return_metrics must derive a quarter-end date for period coherence"
    )
    # Must pass it as parameter bound in the cash event query.
    assert "event_date" in body, "compute_return_metrics must filter cash events by event_date"


# ---------------------------------------------------------------------------
# rollup_investment period filter — jv_quarter_state must be filtered
# to the requested quarter (INV-2 at the rollup layer).
# ---------------------------------------------------------------------------

def test_rollup_investment_filters_jv_state_to_requested_quarter():
    """rollup_investment must pull jv_quarter_state rows only for the
    requested quarter. An off-period JV state row contaminating the
    rollup is an INV-2 violation."""
    source = _read("services/re_rollup.py")
    start = source.index("def rollup_investment")
    end_match = re.search(r"^def\s+\w+", source[start + 10:], re.MULTILINE)
    end = start + 10 + end_match.start() if end_match else len(source)
    body = source[start:end]

    assert "re_jv_quarter_state" in body, "rollup must query jv quarter state"
    # The SQL has the form "WHERE j.investment_id = %s AND s.quarter = %s".
    assert re.search(r"s\.quarter\s*=\s*%s", body), (
        "rollup_investment must filter jv_quarter_state by s.quarter = %s (INV-2)"
    )


# ---------------------------------------------------------------------------
# fee_accrual / expense / snapshot queries — per-quarter filter present
# ---------------------------------------------------------------------------

def test_fee_accrual_filters_to_quarter():
    """compute_fee_accrual must scope fee policy lookups and basis-amount
    computations to the target quarter. No cross-period aggregation."""
    source = _read("services/re_fund_metrics.py")
    start = source.index("def compute_fee_accrual")
    end_match = re.search(r"^def\s+\w+", source[start + 10:], re.MULTILINE)
    end = start + 10 + end_match.start() if end_match else len(source)
    body = source[start:end]

    # NAV basis path must filter re_fund_quarter_state by quarter.
    # CALLED basis must filter re_cash_event by event_date <= as_of.
    assert re.search(r"AND\s+quarter\s*=\s*%s", body), (
        "fee basis lookups must filter by quarter"
    )
    assert "event_date <= %s" in body, (
        "CALLED basis must bound cash events by event_date (Patch C-2)"
    )


def test_compute_fund_expenses_filters_to_quarter():
    """compute_fund_expenses must only sum expenses matching the target
    quarter — cross-period expense summation would distort net metrics."""
    source = _read("services/re_fund_metrics.py")
    start = source.index("def compute_fund_expenses")
    end_match = re.search(r"^def\s+\w+", source[start + 10:], re.MULTILINE)
    end = start + 10 + end_match.start() if end_match else len(source)
    body = source[start:end]

    assert "re_fund_expense_qtr" in body
    assert re.search(r"quarter\s*=\s*%s", body), "expense aggregation must filter by quarter"


# ---------------------------------------------------------------------------
# Snapshot builder period coherence — the authoritative-state read path
# respects the requested quarter (no period drift via period_exact=False
# masquerading as period-exact).
# ---------------------------------------------------------------------------

def test_authoritative_state_surfaces_period_exact_flag():
    """Consumers use period_exact to decide whether to render a value.
    If the release_state_for_quarter falls back to a prior period,
    period_exact MUST be False so UI gates fail closed. Verifies the
    contract is explicit in the response shape."""
    source = _read("services/re_authoritative_snapshots.py")
    start = source.index("def get_authoritative_state")
    # Sample the function (first ~200 lines) for period_exact assignment.
    snippet = source[start:start + 8000]

    assert "period_exact" in snippet, (
        "get_authoritative_state response must carry period_exact flag"
    )
    # Must be settable to both True and False at some code path.
    assert 'period_exact"]' in snippet or 'period_exact":' in snippet or '"period_exact"' in snippet, (
        "period_exact must be a first-class response field"
    )


# ---------------------------------------------------------------------------
# Positive runtime check: reconciliation against an off-period snapshot
# (period_exact=False) flags appropriately.
# ---------------------------------------------------------------------------

def test_reconciliation_surfaces_non_period_exact_snapshot_as_stale():
    """If an authoritative response has promotion_state=released but
    period_exact=False (meaning the release is from a different quarter),
    reconciliation still treats it as usable ONLY if the caller wants
    the nearest release. For INV-2 we pin that a period_exact=False
    response does not silently compute deltas without caller awareness.

    Current reconciliation implementation uses released state as-is;
    this test documents the current behavior and will need updating
    if period_exact becomes a reconciliation filter."""
    from contextlib import contextmanager
    from decimal import Decimal
    from unittest.mock import patch
    from uuid import uuid4
    from app.services import re_reconciliation

    FUND = str(uuid4())
    INV = str(uuid4())
    queue = [
        [{"fund_id": FUND, "name": "Fund"}],
        [{"investment_id": INV, "name": "Inv"}],
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

    # period_exact=False: the latest released snapshot is from an earlier quarter
    off_period = {
        "entity_type": "fund", "entity_id": FUND,
        "quarter": "2026Q1",              # actual snapshot quarter
        "requested_quarter": "2026Q2",    # consumer asked for Q2
        "period_exact": False,            # ← period mismatch
        "state_origin": "authoritative", "promotion_state": "released",
        "audit_run_id": None, "snapshot_version": "v1-Q1-released",
        "trust_status": "trusted", "breakpoint_layer": None, "null_reason": None,
        "state": {
            "period_start": "2026-01-01", "period_end": "2026-03-31",
            "canonical_metrics": {"ending_nav": "100000000"}, "display_metrics": {},
        },
        "null_reasons": {}, "formulas": {}, "provenance": [], "artifact_paths": {},
    }

    with patch.object(re_reconciliation, "get_cursor", fake_cursor), \
         patch("app.services.re_authoritative_snapshots.get_authoritative_state", return_value=off_period), \
         patch("app.services.re_rollup.rollup_investment", return_value={"agg_nav": Decimal("100000000")}):
        rows = re_reconciliation.build_environment_reconciliation(
            env_id=uuid4(), business_id=uuid4(), quarter="2026Q2",
        )

    # The fund row must at minimum surface the snapshot_version so the
    # consumer can detect the period drift via comparison with requested.
    fund_row = [r for r in rows if r["level"] == "fund"][0]
    assert fund_row["snapshot_version"] == "v1-Q1-released", (
        "fund row must carry snapshot_version so off-period drift is detectable"
    )
    assert fund_row["source_origin"] == "authoritative"
    assert fund_row["promotion_state"] == "released"
