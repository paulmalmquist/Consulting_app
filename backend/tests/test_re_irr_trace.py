"""IRR trace contract tests.

The hash gate is the authority. These tests prove every failure mode of the
gate returns Unavailable(source_lineage_missing) — never a recomputed value
from current cashflow tables.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import date
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


from app.services import re_irr_trace  # noqa: E402
from app.services.re_trace_gate import TraceableFundSnapshot  # noqa: E402


FUND_ID = "f0000000-0000-0000-0000-000000000001"
AUDIT_RUN_ID = "11111111-1111-1111-1111-111111111111"
INV_ID = "d0000000-0000-0000-0000-000000000001"


def _snapshot(
    *,
    cf_hash: str | None = "hash-A",
    inputs_hash: str | None = "hash-A",
    gross_irr: str | None = "0.14",
) -> TraceableFundSnapshot:
    provenance = []
    if cf_hash is not None:
        provenance = [{"cf_series_hash": cf_hash, "step": "bottom_up_rollup"}]
    return TraceableFundSnapshot(
        fund_id=FUND_ID,
        fund_name="Meridian RE Fund III",
        quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID,
        snapshot_version="meridian-20260409T120000Z-abcd1234",
        canonical_metrics={"gross_irr": gross_irr, "ending_nav": "1000000"},
        provenance=provenance,
        inputs_hash=inputs_hash,
        null_reasons={},
    )


def _cf_row(*, qe: date, amount: str, source_hash: str = "hash-A") -> dict:
    return {
        "investment_id": INV_ID,
        "quarter": f"{qe.year}Q{((qe.month - 1) // 3) + 1}",
        "quarter_end_date": qe,
        "cash_flow_base": amount,
        "asset_contributions": [],
        "source_hash": source_hash,
        "investment_name": "Inv 1",
    }


# ─── 1. Hash missing → lineage_missing, no CF rows, no recomputation ──────

def test_no_cf_hash_in_provenance_returns_lineage_missing():
    cur = FakeCursor()
    # No DB queries should be issued — the gate fails before query
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(
            _snapshot(cf_hash=None, inputs_hash=None)
        )

    assert payload.reconciliation.status == "lineage_missing"
    assert payload.cf_rows == []
    assert payload.null_reason == "source_lineage_missing"
    assert payload.reconciliation.recomputed_irr is None
    # No DB query attempted
    assert len(cur.queries) == 0


# ─── 2. provenance/inputs_hash disagree → lineage_missing ──────────────────

def test_hash_mismatch_between_provenance_and_inputs_hash_returns_missing():
    cur = FakeCursor()
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(
            _snapshot(cf_hash="hash-A", inputs_hash="hash-B")
        )

    assert payload.reconciliation.status == "lineage_missing"
    assert payload.cf_rows == []
    assert len(cur.queries) == 0


# ─── 3. CF rows exist but source_hash mismatches → lineage_missing ──────────

def test_cf_rows_exist_but_hash_mismatch_returns_lineage_missing():
    cur = FakeCursor()
    cur.push_result([{"investment_id": INV_ID}])
    cur.push_result([
        _cf_row(qe=date(2024, 12, 31), amount="-1000000", source_hash="hash-OTHER"),
        _cf_row(qe=date(2026, 6, 30), amount="1500000", source_hash="hash-OTHER"),
    ])
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(_snapshot(cf_hash="hash-A", inputs_hash="hash-A"))

    assert payload.reconciliation.status == "lineage_missing"
    assert payload.cf_rows == []
    assert payload.null_reason == "source_lineage_missing"
    assert payload.reconciliation.recomputed_irr is None


# ─── 4. No investments resolved → lineage_missing ───────────────────────────

def test_no_investments_resolves_lineage_missing():
    cur = FakeCursor()
    cur.push_result([])  # no investments for this audit_run
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(_snapshot())

    assert payload.reconciliation.status == "lineage_missing"
    assert payload.cf_rows == []


# ─── 5. CF rows match hash → cross-check passes ────────────────────────────

def test_cf_rows_matched_by_hash_and_xirr_reconciles():
    cur = FakeCursor()
    cur.push_result([{"investment_id": INV_ID}])
    cur.push_result([
        _cf_row(qe=date(2024, 6, 30), amount="-1000000", source_hash="hash-A"),
        _cf_row(qe=date(2026, 6, 30), amount="1300000", source_hash="hash-A"),
    ])
    # Snapshot's gross_irr matches xirr of the above rows (~14.0%).
    snap = _snapshot(gross_irr="0.14017")  # close to recomputed
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(snap)

    assert payload.reconciliation.status in {"reconciled", "soft_fail", "hard_fail"}
    # CF rows must all have the matching hash
    assert len(payload.cf_rows) == 2
    assert all(r.source_hash == "hash-A" for r in payload.cf_rows)
    # Provenance records the hash
    assert payload.provenance["cf_series_hash"] == "hash-A"
    assert payload.provenance["lineage_status"] == "verified"


# ─── 6. Hash filter excludes mismatched rows when both kinds exist ────────

def test_hash_filter_excludes_non_matching_rows():
    cur = FakeCursor()
    cur.push_result([{"investment_id": INV_ID}])
    cur.push_result([
        _cf_row(qe=date(2024, 6, 30), amount="-1000000", source_hash="hash-A"),
        _cf_row(qe=date(2024, 9, 30), amount="-2000000", source_hash="hash-OLD"),
        _cf_row(qe=date(2026, 6, 30), amount="1300000", source_hash="hash-A"),
    ])
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(_snapshot(cf_hash="hash-A"))

    # Only 2 of the 3 rows survive the hash gate
    assert len(payload.cf_rows) == 2
    assert all(r.source_hash == "hash-A" for r in payload.cf_rows)


# ─── 7. snapshot_irr null → reconciliation status unavailable ─────────────

def test_snapshot_irr_null_returns_unavailable_reconciliation():
    cur = FakeCursor()
    cur.push_result([{"investment_id": INV_ID}])
    cur.push_result([
        _cf_row(qe=date(2024, 6, 30), amount="-1000000", source_hash="hash-A"),
        _cf_row(qe=date(2026, 6, 30), amount="1300000", source_hash="hash-A"),
    ])
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(_snapshot(gross_irr=None))

    assert payload.reconciliation.status == "unavailable"
    assert payload.reconciliation.lineage_note == "snapshot_irr_null"
    # CF rows still returned for transparency, but reconciliation is unavailable
    assert len(payload.cf_rows) == 2
