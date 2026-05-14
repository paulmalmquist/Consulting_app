"""Trace invariant tests at service tolerance.

These tests prove the end-to-end identity:

    NAV trace: Σ(asset.ending_nav × asset.ownership_pct) over the audit_run_id-scoped
               asset rows == fund snapshot's canonical_metrics.ending_nav, within
               hard tolerance = max($1.00, 1bp × fund_nav).

    IRR trace: xirr() over hash-gated CF rows == fund snapshot's canonical_metrics.gross_irr,
               within hard tolerance = 1 bp. Hash gate MUST pass; lineage_missing
               is a fail, not a pass.

The constraint here is stronger than the unit tests: this is a recomputation
identity, not a contract assertion. If a future change introduces a different
source for ownership_pct, or a divergent xirr path, these tests fail.

Hard tolerance only — matches the service tolerance. Soft tolerance is a
diagnostic tier, not an invariant.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import date
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


from app.finance.irr_engine import xirr  # noqa: E402
from app.services import re_irr_trace, re_nav_trace  # noqa: E402
from app.services.re_trace_gate import TraceableFundSnapshot  # noqa: E402


FUND_ID = "f0000000-0000-0000-0000-000000000001"
AUDIT_RUN_ID = "11111111-1111-1111-1111-111111111111"
INV_A = "d0000000-0000-0000-0000-00000000000a"
INV_B = "d0000000-0000-0000-0000-00000000000b"

# Service tolerances — must match the constants in the trace modules.
NAV_BPS = Decimal("0.0001")
NAV_FLOOR = Decimal("1.00")
IRR_HARD_BPS = Decimal("1")


# ─── NAV invariant ───────────────────────────────────────────────────────────


def test_nav_invariant_full_recompute_within_hard_tolerance():
    """
    Given a fund snapshot ending_nav = 100,000,000 and asset rows whose
    (ending_nav × ownership_pct) sum to exactly 100,000,000.50, prove the
    NAV trace renders status='reconciled' AND that the recomputed sum from
    the SAME audit_run_id-scoped rows matches within hard tolerance.

    The point is full identity from the source: we don't trust the service's
    asset_sum field — we recompute it here from the rows the test pushes,
    and assert the trace's number agrees.
    """
    fund_nav = Decimal("100000000")
    # Three assets — two trivially scaled, one with ownership < 1.
    asset_rows_in: list[dict] = [
        {
            "asset_id": "a1", "investment_id": INV_A, "quarter": "2026Q2",
            "ending_nav": "60000000", "ownership_pct": "1.0",
            "trust_status": "trusted", "null_reasons": {},
            "audit_run_id": AUDIT_RUN_ID, "asset_name": "Asset 1",
            "investment_name": "Inv A",
        },
        {
            "asset_id": "a2", "investment_id": INV_A, "quarter": "2026Q2",
            "ending_nav": "50000000", "ownership_pct": "0.8",
            "trust_status": "trusted", "null_reasons": {},
            "audit_run_id": AUDIT_RUN_ID, "asset_name": "Asset 2",
            "investment_name": "Inv A",
        },
        {
            "asset_id": "a3", "investment_id": INV_B, "quarter": "2026Q2",
            "ending_nav": "50", "ownership_pct": "0.01",
            "trust_status": "trusted", "null_reasons": {},
            "audit_run_id": AUDIT_RUN_ID, "asset_name": "Asset 3",
            "investment_name": "Inv B",
        },
    ]
    # Recompute by hand:
    # 60M*1.0 + 50M*0.8 + 50*0.01 = 60M + 40M + 0.5 = 100,000,000.50
    expected_sum = Decimal("100000000.50")

    snapshot = TraceableFundSnapshot(
        fund_id=FUND_ID, fund_name="F", quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID, snapshot_version="v1",
        canonical_metrics={"ending_nav": str(fund_nav)},
        provenance=[{"cf_series_hash": "h"}], inputs_hash="h", null_reasons={},
    )

    cur = FakeCursor()
    cur.push_result(asset_rows_in)
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(snapshot)

    # 1. The service's reported sum equals our hand-recomputed sum.
    assert Decimal(payload.reconciliation.asset_sum) == expected_sum

    # 2. |fund_nav - recomputed_sum| ≤ hard tolerance.
    delta = (fund_nav - expected_sum).copy_abs()
    hard_tol = max(NAV_FLOOR, fund_nav * NAV_BPS)  # = max(1, 10000) = 10000
    assert delta <= hard_tol, (
        f"NAV invariant breached: |{fund_nav} - {expected_sum}| = {delta} "
        f"> hard tolerance {hard_tol}"
    )

    # 3. The service classified the same situation as soft_fail (because
    #    $0.50 > $1.00 soft threshold? actually 0.50 < $1, so reconciled).
    #    The delta here is $0.50, well under both soft ($1) and hard ($10k).
    assert payload.reconciliation.status == "reconciled"


def test_nav_invariant_hard_fail_when_delta_exceeds_bp_ceiling():
    """A delta of $20k against fund_nav $100M is past the 1bp ceiling.
    Hard tolerance = max($1, 1bp × 100M) = $10k. $20k breach → hard_fail."""
    fund_nav = Decimal("100000000")
    asset_rows_in = [
        {
            "asset_id": "a1", "investment_id": INV_A, "quarter": "2026Q2",
            "ending_nav": "99980000", "ownership_pct": "1.0",
            "trust_status": "trusted", "null_reasons": {},
            "audit_run_id": AUDIT_RUN_ID, "asset_name": "Asset 1",
            "investment_name": "Inv A",
        },
    ]
    snapshot = TraceableFundSnapshot(
        fund_id=FUND_ID, fund_name="F", quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID, snapshot_version="v1",
        canonical_metrics={"ending_nav": str(fund_nav)},
        provenance=[{"cf_series_hash": "h"}], inputs_hash="h", null_reasons={},
    )

    cur = FakeCursor()
    cur.push_result(asset_rows_in)
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(snapshot)

    delta = (fund_nav - Decimal(payload.reconciliation.asset_sum)).copy_abs()
    hard_tol = max(NAV_FLOOR, fund_nav * NAV_BPS)
    assert delta > hard_tol
    assert payload.reconciliation.status == "hard_fail"


def test_nav_invariant_quarter_split_brain_blocks_reconciliation():
    """If any returned asset row's quarter ≠ snapshot.quarter, the trace must
    refuse to reconcile and surface quarter_split_brain — not silently sum
    across quarters."""
    fund_nav = Decimal("100000000")
    asset_rows_in = [
        {
            "asset_id": "a1", "investment_id": INV_A, "quarter": "2026Q2",
            "ending_nav": "60000000", "ownership_pct": "1.0",
            "trust_status": "trusted", "null_reasons": {},
            "audit_run_id": AUDIT_RUN_ID, "asset_name": "Asset 1",
            "investment_name": "Inv A",
        },
        {
            "asset_id": "a2", "investment_id": INV_A, "quarter": "2026Q1",  # mismatch!
            "ending_nav": "40000000", "ownership_pct": "1.0",
            "trust_status": "trusted", "null_reasons": {},
            "audit_run_id": AUDIT_RUN_ID, "asset_name": "Asset 2",
            "investment_name": "Inv A",
        },
    ]
    snapshot = TraceableFundSnapshot(
        fund_id=FUND_ID, fund_name="F", quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID, snapshot_version="v1",
        canonical_metrics={"ending_nav": str(fund_nav)},
        provenance=[{"cf_series_hash": "h"}], inputs_hash="h", null_reasons={},
    )

    cur = FakeCursor()
    cur.push_result(asset_rows_in)
    with patch("app.services.re_nav_trace.get_cursor", _mock_cursor(cur)):
        payload = re_nav_trace.get_nav_trace(snapshot)

    assert payload.reconciliation.status == "unavailable"
    assert payload.null_reason == "quarter_split_brain"
    assert payload.asset_rows == []
    assert payload.provenance.get("quarter_consistency_check") == "failed"


# ─── IRR invariant ───────────────────────────────────────────────────────────


def test_irr_invariant_hash_gate_passes_and_xirr_matches_within_1bp():
    """
    Hash gate MUST pass (cf_series_hash == inputs_hash). Then xirr() over the
    matched rows recomputes to the snapshot's gross_irr within 1 bp.

    This is the snapshot's exact CF series — we built it with known inputs
    and computed the expected xirr ourselves.
    """
    # Cashflows: -1M on 2024-06-30, +1.3M on 2026-06-30. xirr ≈ ?
    cfs = [
        (date(2024, 6, 30), Decimal("-1000000")),
        (date(2026, 6, 30), Decimal("1300000")),
    ]
    expected_irr = xirr(cfs)
    assert expected_irr is not None  # sanity

    cf_hash = "hash-A"
    snapshot = TraceableFundSnapshot(
        fund_id=FUND_ID, fund_name="F", quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID, snapshot_version="v1",
        canonical_metrics={"gross_irr": str(expected_irr), "ending_nav": "1000000"},
        provenance=[{"cf_series_hash": cf_hash}],
        inputs_hash=cf_hash, null_reasons={},
    )

    cur = FakeCursor()
    # Investment-set
    cur.push_result([{"investment_id": INV_A}])
    # CF rows (all with matching source_hash and as_of_quarter)
    cur.push_result([
        {
            "investment_id": INV_A, "quarter": "2024Q2", "as_of_quarter": "2026Q2",
            "quarter_end_date": date(2024, 6, 30), "cash_flow_base": "-1000000",
            "asset_contributions": [], "source_hash": cf_hash, "investment_name": "Inv A",
        },
        {
            "investment_id": INV_A, "quarter": "2026Q2", "as_of_quarter": "2026Q2",
            "quarter_end_date": date(2026, 6, 30), "cash_flow_base": "1300000",
            "asset_contributions": [], "source_hash": cf_hash, "investment_name": "Inv A",
        },
    ])
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(snapshot)

    # Hash gate must report as verified, not lineage_missing.
    assert payload.reconciliation.status not in {"lineage_missing", "unavailable"}
    assert payload.provenance["lineage_status"] == "verified"

    # Service's recomputed_irr matches our local xirr exactly (same engine).
    assert Decimal(payload.reconciliation.recomputed_irr) == expected_irr

    # |snapshot_irr - recomputed_irr| × 10000 ≤ 1 bp
    delta_bps = (Decimal(payload.reconciliation.snapshot_gross_irr) - expected_irr) * Decimal("10000")
    assert delta_bps.copy_abs() <= IRR_HARD_BPS
    assert payload.reconciliation.status in {"reconciled", "soft_fail"}


def test_irr_invariant_lineage_missing_when_hash_gate_fails():
    """Hash gate failure is a fail of the invariant, not a different mode.
    There is no path where status='reconciled' AND the hash gate failed."""
    snapshot = TraceableFundSnapshot(
        fund_id=FUND_ID, fund_name="F", quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID, snapshot_version="v1",
        canonical_metrics={"gross_irr": "0.14", "ending_nav": "1000000"},
        provenance=[], inputs_hash=None, null_reasons={},
    )
    cur = FakeCursor()
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(snapshot)
    assert payload.reconciliation.status == "lineage_missing"
    assert payload.cf_rows == []
    # No SQL was issued (gate failed before any query).
    assert len(cur.queries) == 0


def test_irr_invariant_quarter_split_brain_in_cf_rows_blocks_reconciliation():
    """A matched CF row with as_of_quarter != snapshot.quarter must drop the
    trace into lineage_missing, even if the source_hash matches."""
    cf_hash = "hash-A"
    snapshot = TraceableFundSnapshot(
        fund_id=FUND_ID, fund_name="F", quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID, snapshot_version="v1",
        canonical_metrics={"gross_irr": "0.14", "ending_nav": "1000000"},
        provenance=[{"cf_series_hash": cf_hash}],
        inputs_hash=cf_hash, null_reasons={},
    )
    cur = FakeCursor()
    cur.push_result([{"investment_id": INV_A}])
    # Note: as_of_quarter "2025Q4" — disagrees with snapshot.quarter "2026Q2".
    # In production the SQL filter would prevent this, but the post-check is
    # the defense for any future drift; this test pins that defense.
    cur.push_result([
        {
            "investment_id": INV_A, "quarter": "2024Q2", "as_of_quarter": "2025Q4",
            "quarter_end_date": date(2024, 6, 30), "cash_flow_base": "-1000000",
            "asset_contributions": [], "source_hash": cf_hash, "investment_name": "Inv A",
        },
    ])
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(snapshot)
    assert payload.reconciliation.status == "lineage_missing"
    assert payload.cf_rows == []


def test_irr_invariant_rogue_investment_in_matched_rows_blocks_reconciliation():
    """Defense-in-depth: if a matched row's investment_id is outside the
    released set, the trace must refuse — even if the hash matches and the
    quarter matches. Investment-set membership is part of the gate."""
    cf_hash = "hash-A"
    snapshot = TraceableFundSnapshot(
        fund_id=FUND_ID, fund_name="F", quarter="2026Q2",
        audit_run_id=AUDIT_RUN_ID, snapshot_version="v1",
        canonical_metrics={"gross_irr": "0.14", "ending_nav": "1000000"},
        provenance=[{"cf_series_hash": cf_hash}],
        inputs_hash=cf_hash, null_reasons={},
    )
    cur = FakeCursor()
    cur.push_result([{"investment_id": INV_A}])  # released set = {INV_A}
    cur.push_result([
        {
            "investment_id": INV_B,  # ← rogue, not in the released set
            "quarter": "2024Q2", "as_of_quarter": "2026Q2",
            "quarter_end_date": date(2024, 6, 30), "cash_flow_base": "-1000000",
            "asset_contributions": [], "source_hash": cf_hash, "investment_name": "Inv B",
        },
    ])
    with patch("app.services.re_irr_trace.get_cursor", _mock_cursor(cur)):
        payload = re_irr_trace.get_irr_trace(snapshot)
    assert payload.reconciliation.status == "lineage_missing"
    assert payload.cf_rows == []
