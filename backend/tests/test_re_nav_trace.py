"""NAV trace contract tests.

Mocks get_cursor at the re_nav_trace module level. Each test pushes one query
result (the asset rows) because the gate snapshot is built directly in the
test, bypassing re_trace_gate's DB query.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")


class FakeCursor:
    def __init__(self):
        self.queries: list[tuple[str, tuple]] = []
        self._results: list[list[dict]] = []
        self._result_idx = 0

    def push_result(self, rows: list[dict]):
        self._results.append(rows)

    def execute(self, sql: str, params=None):
        self.queries.append((sql, params))
        return self

    def fetchone(self):
        if self._result_idx < len(self._results):
            rows = self._results[self._result_idx]
            self._result_idx += 1
            return rows[0] if rows else None
        return None

    def fetchall(self):
        if self._result_idx < len(self._results):
            rows = self._results[self._result_idx]
            self._result_idx += 1
            return rows
        return []


def _mock_cursor(cur: FakeCursor):
    @contextmanager
    def _mock():
        yield cur

    return _mock


from app.services import re_nav_trace
from app.services.re_trace_gate import TraceableFundSnapshot


FUND_ID = "f0000000-0000-0000-0000-000000000001"
AUDIT_RUN_ID = "11111111-1111-1111-1111-111111111111"


def _snapshot(*, fund_nav: str | None = "1000000", null_reasons=None) -> TraceableFundSnapshot:
    return TraceableFundSnapshot(
        fund_id=FUND_ID,
        fund_name="Meridian RE Fund III",
        quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID,
        snapshot_version="meridian-20260409T120000Z-abcd1234",
        canonical_metrics={"ending_nav": fund_nav, "gross_irr": "0.14"},
        provenance=[{"cf_series_hash": "abc"}],
        inputs_hash="abc",
        null_reasons=null_reasons or {},
    )


def _asset_row(
    *,
    asset_id: str,
    ending_nav: str | None,
    ownership_pct: str | None = "1.0",
    investment_id: str | None = "d0000000-0000-0000-0000-000000000001",
    asset_name: str = "Asset A",
    investment_name: str | None = "Inv 1",
    null_reasons=None,
) -> dict:
    return {
        "asset_id": asset_id,
        "investment_id": investment_id,
        "ending_nav": ending_nav,
        "ownership_pct": ownership_pct,
        "trust_status": "trusted",
        "null_reasons": null_reasons or {},
        "audit_run_id": AUDIT_RUN_ID,
        "asset_name": asset_name,
        "investment_name": investment_name,
    }


# ─── 1. Asset rows are scoped by audit_run_id ────────────────────────────────

def test_asset_rows_scoped_to_audit_run():
    cur = FakeCursor()
    cur.push_result([
        _asset_row(asset_id="a1", ending_nav="600000"),
        _asset_row(asset_id="a2", ending_nav="400000"),
    ])
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(_snapshot())

    assert all(r.audit_run_id == AUDIT_RUN_ID for r in payload.asset_rows)
    # Verify the SQL used the gate's audit_run_id
    sql, params = cur.queries[0]
    assert "audit_run_id = %s" in sql
    assert params[0] == AUDIT_RUN_ID


# ─── 2. Reconciliation passes within hard tolerance ──────────────────────────

def test_nav_reconciles_within_hard_tolerance():
    cur = FakeCursor()
    # 600000 × 1.0 + 400000 × 1.0 = 1,000,000 = fund_nav exactly
    cur.push_result([
        _asset_row(asset_id="a1", ending_nav="600000"),
        _asset_row(asset_id="a2", ending_nav="400000"),
    ])
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(_snapshot(fund_nav="1000000"))

    assert payload.reconciliation.status == "reconciled"
    assert Decimal(payload.reconciliation.delta) == Decimal("0")
    assert payload.reconciliation.soft_pass is True
    assert payload.reconciliation.hard_pass is True


# ─── 3. Hard fail surfaces as "hard_fail" ────────────────────────────────────

def test_nav_hard_fail_when_delta_exceeds_tolerance():
    cur = FakeCursor()
    # 500000 vs fund_nav 1000000 → delta = 500000, way past 1bp of 1M = 100
    cur.push_result([_asset_row(asset_id="a1", ending_nav="500000")])
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(_snapshot(fund_nav="1000000"))

    assert payload.reconciliation.status == "hard_fail"
    assert payload.reconciliation.hard_pass is False


# ─── 4. Asset with null ending_nav still appears as a row ────────────────────

def test_null_asset_excluded_from_sum_not_from_rows():
    cur = FakeCursor()
    cur.push_result([
        _asset_row(asset_id="a1", ending_nav="600000"),
        _asset_row(asset_id="a2", ending_nav=None, null_reasons={"ending_nav": "missing_source"}),
        _asset_row(asset_id="a3", ending_nav="400000"),
    ])
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(_snapshot(fund_nav="1000000"))

    assert len(payload.asset_rows) == 3
    null_row = next(r for r in payload.asset_rows if r.asset_id == "a2")
    assert null_row.ending_nav is None
    assert null_row.fund_attributed_nav is None
    # Sum stays at 1,000,000 — the null is excluded
    assert Decimal(payload.reconciliation.asset_sum) == Decimal("1000000")
    assert payload.reconciliation.status == "reconciled"


# ─── 5. fund_nav null returns Unavailable ────────────────────────────────────

def test_fund_nav_null_returns_unavailable():
    cur = FakeCursor()
    cur.push_result([_asset_row(asset_id="a1", ending_nav="600000")])
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(
            _snapshot(fund_nav=None, null_reasons={"ending_nav": "out_of_scope_requires_waterfall"})
        )

    assert payload.fund_nav is None
    assert payload.reconciliation.status == "unavailable"
    assert payload.null_reason == "out_of_scope_requires_waterfall"


# ─── 6. Provenance documents the source contract ────────────────────────────

def test_provenance_documents_source():
    cur = FakeCursor()
    cur.push_result([_asset_row(asset_id="a1", ending_nav="1000000")])
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(_snapshot())

    assert payload.provenance["source_table"] == "re_authoritative_asset_state_qtr"
    assert "audit_run_id" in payload.provenance["scope"]
    assert payload.provenance["asset_count"] == 1
    assert payload.provenance["contributing_asset_count"] == 1


# ─── 7. Soft fail tier ───────────────────────────────────────────────────────

def test_nav_soft_fail_when_delta_between_soft_and_hard():
    """Fund NAV 100M → hard tolerance = max($1, 1bp×100M) = $10,000.
    A delta of $5,000 is past soft ($1) but inside hard ($10k) → soft_fail."""
    cur = FakeCursor()
    # asset_sum = 99,995,000; fund_nav = 100,000,000; delta = 5,000
    cur.push_result([_asset_row(asset_id="a1", ending_nav="99995000")])
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(_snapshot(fund_nav="100000000"))

    assert payload.reconciliation.status == "soft_fail"
    assert payload.reconciliation.soft_pass is False
    assert payload.reconciliation.hard_pass is True
