"""Coherent Fund Portfolio service contract tests.

Mocks `get_cursor` and asserts the invariants documented in the service module
docstring. The 11 tests below correspond 1:1 to Phase 4 of the plan at
audit/fund_portfolio_coherence/gap_report.md.

Each test pushes a canned result set onto a FakeCursor and exercises a single
contract. The service issues exactly 2 cursor.execute() calls per invocation —
included rows then excluded rows — so each test pushes 2 result sets.
"""

from __future__ import annotations

import json
import os
import re
from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import patch

# Required by app.config before importing the service module.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")


# Inline copy of tests.conftest.FakeCursor. We avoid the project conftest
# because it imports `app.main`, and `app.main` currently transitively imports
# a module with a pre-existing syntax error (backend/app/routes/investment_engine.py:770)
# that has nothing to do with this change. Inlining keeps these tests runnable
# in isolation; a future PR that fixes investment_engine.py will let us switch
# back to the shared fixture.
class FakeCursor:
    def __init__(self):
        self.queries: list[tuple[str, tuple]] = []
        self._results: list[list[dict]] = []
        self._result_idx = 0
        self.rowcount = 1

    def push_result(self, rows: list[dict]):
        self._results.append(rows)

    def execute(self, sql: str, params=None):
        self.queries.append((sql, params))
        return self

    def fetchone(self):
        if self._result_idx < len(self._results):
            rows = self._results[self._result_idx]
            self._result_idx += 1
            if rows:
                return rows[0]
            self.rowcount = 0
            return None
        return None

    def fetchall(self):
        if self._result_idx < len(self._results):
            rows = self._results[self._result_idx]
            self._result_idx += 1
            return rows
        return []


def _make_fake_cursor(cur: FakeCursor):
    @contextmanager
    def _mock():
        yield cur

    return _mock


ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
BUSINESS_ID = "b1b2c3d4-0001-0001-0001-000000000001"
QUARTER = "2026Q2"


def _included_row(
    *,
    fund_id: str,
    name: str,
    nav: str | None = "1000000",
    committed: str | None = "5000000",
    gross_irr: str | None = "0.14",
    net_irr: str | None = "0.12",
    legacy_dscr: str | None = "1.45",
    legacy_ltv: str | None = "0.65",
    snapshot_version: str = "meridian-20260409T120000Z-abcd1234",
    asset_count: int | None = 3,
) -> dict:
    cm: dict = {
        "ending_nav": nav,
        "total_committed": committed,
        "total_called": "3500000",
        "total_distributed": "1200000",
        "gross_irr": gross_irr,
        "net_irr": net_irr,
        "dpi": "0.34",
        "rvpi": "1.2",
        "tvpi": "1.54",
        "asset_count": asset_count,
        "investment_count": 5,
        "scope": {"scope_completeness": "complete"},
    }
    return {
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "quarter": QUARTER,
        "fund_id": fund_id,
        "name": name,
        "vintage_year": 2019,
        "fund_type": "closed_end",
        "strategy": "equity",
        "sub_strategy": None,
        "target_size": "750000000",
        "status": "investing",
        "base_currency": "USD",
        "inception_date": None,
        "audit_run_id": "11111111-1111-1111-1111-111111111111",
        "snapshot_version": snapshot_version,
        "promotion_state": "released",
        "trust_status": "trusted",
        "breakpoint_layer": None,
        "canonical_metrics": cm,
        "null_reasons": {},
        "provenance": [],
        "released_at": None,
        "legacy_weighted_dscr": legacy_dscr,
        "legacy_weighted_ltv": legacy_ltv,
    }


def _excluded_row(
    *,
    fund_id: str,
    name: str,
    status: str = "closed",
    exclusion_reason: str = "quarantined",
    latest_quarter: str | None = None,
    latest_promotion_state: str | None = None,
) -> dict:
    return {
        "env_id": ENV_ID,
        "business_id": BUSINESS_ID,
        "fund_id": fund_id,
        "name": name,
        "status": status,
        "latest_quarter": latest_quarter,
        "latest_audit_run_id": None,
        "latest_promotion_state": latest_promotion_state,
        "latest_null_reasons": {},
        "exclusion_reason": exclusion_reason,
    }


def _call(included: list[dict], excluded: list[dict]):
    """Patch the module's get_cursor and return the payload.

    Three SQL queries are issued in order:
      1. SELECT from re_fund_portfolio_included_v
      2. SELECT inputs_hash FROM re_authoritative_fund_state_qtr (per-fund
         lookup for gross_irr_traceable hint — empty result here is fine;
         it just means no fund is hinted as traceable in the unit test)
      3. SELECT from re_fund_portfolio_excluded_v
    """
    from app.services import re_fund_portfolio_coherent

    cur = FakeCursor()
    cur.push_result(included)
    # inputs_hash lookup — only executed when included is non-empty.
    if included:
        cur.push_result([])
    cur.push_result(excluded)
    with patch(
        "app.services.re_fund_portfolio_coherent.get_cursor",
        _make_fake_cursor(cur),
    ):
        return re_fund_portfolio_coherent.get_coherent_fund_portfolio(
            env_id=ENV_ID,
            business_id=BUSINESS_ID,
            quarter=QUARTER,
        )


# ─── 1. Quarantined exclusion ────────────────────────────────────────────────


def test_excludes_quarantined():
    payload = _call(
        included=[
            _included_row(fund_id="a1b2c3d4-0001-0010-0001-000000000001", name="MREF III"),
        ],
        excluded=[
            _excluded_row(
                fund_id="d4560000-0003-0030-0004-000000000001",
                name="[QUARANTINED] Meridian Real Estate Fund III",
                exclusion_reason="quarantined",
            ),
        ],
    )

    fund_names = {fr.name for fr in payload.fund_rows}
    assert "[QUARANTINED] Meridian Real Estate Fund III" not in fund_names
    assert "MREF III" in fund_names

    diag_reasons = {(d.fund_name, d.exclusion_reason) for d in payload.diagnostics}
    assert ("[QUARANTINED] Meridian Real Estate Fund III", "quarantined") in diag_reasons


# ─── 2. Draft-only exclusion ────────────────────────────────────────────────


def test_excludes_draft_only():
    payload = _call(
        included=[_included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A")],
        excluded=[
            _excluded_row(
                fund_id="bbbb2222-0000-0000-0000-000000000002",
                name="B (draft)",
                status="active",
                exclusion_reason="draft_only",
                latest_quarter="2026Q2",
                latest_promotion_state="draft_audit",
            ),
        ],
    )

    assert all(fr.fund_id != "bbbb2222-0000-0000-0000-000000000002" for fr in payload.fund_rows)
    draft = next(d for d in payload.diagnostics if d.fund_id == "bbbb2222-0000-0000-0000-000000000002")
    assert draft.exclusion_reason == "draft_only"
    assert draft.latest_promotion_state == "draft_audit"


# ─── 3. Archived exclusion ──────────────────────────────────────────────────


def test_excludes_archived():
    payload = _call(
        included=[_included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A")],
        excluded=[
            _excluded_row(
                fund_id="cccc3333-0000-0000-0000-000000000003",
                name="C (archived)",
                status="archived",
                exclusion_reason="archived",
            ),
        ],
    )

    archived = next(d for d in payload.diagnostics if d.fund_id == "cccc3333-0000-0000-0000-000000000003")
    assert archived.exclusion_reason == "archived"
    assert archived.status == "archived"


# ─── 4. fund_count == len(fund_rows) ────────────────────────────────────────


def test_fund_count_matches_rows():
    payload = _call(
        included=[
            _included_row(fund_id="a1b2c3d4-0001-0010-0001-000000000001", name="MREF III"),
            _included_row(fund_id="a1b2c3d4-0002-0020-0001-000000000001", name="MCOF I"),
            _included_row(fund_id="a1b2c3d4-0003-0030-0001-000000000001", name="IGF VII"),
        ],
        excluded=[],
    )

    assert payload.portfolio_summary.fund_count == 3
    assert len(payload.fund_rows) == 3
    assert payload.portfolio_summary.fund_count == len(payload.fund_rows)


# ─── 5. NAV reconciles within tolerance ─────────────────────────────────────


def test_nav_reconciles():
    payload = _call(
        included=[
            _included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A", nav="1000000.00"),
            _included_row(fund_id="bbbb2222-0000-0000-0000-000000000002", name="B", nav="2500000.00"),
            _included_row(fund_id="cccc3333-0000-0000-0000-000000000003", name="C", nav="3000000.00"),
        ],
        excluded=[],
    )

    rec = payload.portfolio_summary.nav_reconciliation
    assert rec.status == "reconciled"
    delta = Decimal(rec.rounding_delta)
    tolerance = Decimal(rec.tolerance)
    assert abs(delta) <= tolerance
    assert Decimal(rec.displayed_fund_nav_sum) == Decimal("6500000.00")
    assert Decimal(rec.portfolio_nav) == Decimal("6500000.00")


# ─── 6. Missing commitments render unavailable, never $0 ────────────────────


def test_missing_commitments_unavailable_not_zero():
    payload = _call(
        included=[
            _included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A", committed="5000000"),
            _included_row(fund_id="bbbb2222-0000-0000-0000-000000000002", name="B (no commitments)", committed=None),
        ],
        excluded=[],
    )

    # Per-row: B's total_committed is None — must not be coerced to "0"
    b_row = next(fr for fr in payload.fund_rows if fr.name == "B (no commitments)")
    assert b_row.total_committed is None

    # Header total_commitments excludes B's contribution (warning surfaced)
    assert payload.portfolio_summary.total_commitments == "5000000"
    assert any("missing total_committed" in w for w in payload.portfolio_summary.warnings)


# ─── 7. Unreleased / draft snapshots do not affect rollups ──────────────────


def test_unreleased_does_not_affect_rollups():
    """Unreleased rows arrive via the diagnostics view, never via included.

    The service accepts only what the view returns. This test asserts that
    feeding only released rows (the view's contract) yields the expected
    aggregates, and adding excluded rows does NOT change them.
    """
    payload_no_excluded = _call(
        included=[
            _included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A", nav="1000000", gross_irr="0.10"),
            _included_row(fund_id="bbbb2222-0000-0000-0000-000000000002", name="B", nav="3000000", gross_irr="0.20"),
        ],
        excluded=[],
    )
    payload_with_excluded = _call(
        included=[
            _included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A", nav="1000000", gross_irr="0.10"),
            _included_row(fund_id="bbbb2222-0000-0000-0000-000000000002", name="B", nav="3000000", gross_irr="0.20"),
        ],
        excluded=[
            _excluded_row(
                fund_id="dddd4444-0000-0000-0000-000000000004",
                name="D (draft)",
                exclusion_reason="draft_only",
                latest_promotion_state="draft_audit",
            ),
        ],
    )

    assert payload_no_excluded.portfolio_summary.portfolio_nav == \
        payload_with_excluded.portfolio_summary.portfolio_nav
    assert payload_no_excluded.portfolio_summary.gross_irr == \
        payload_with_excluded.portfolio_summary.gross_irr
    assert payload_no_excluded.portfolio_summary.fund_count == \
        payload_with_excluded.portfolio_summary.fund_count == 2

    # NAV-weighted gross IRR with NAV=(1M, 3M) and IRR=(10%, 20%) = 17.5%
    assert Decimal(payload_no_excluded.portfolio_summary.gross_irr).quantize(Decimal("0.0001")) == \
        Decimal("0.1750")


# ─── 8. View set equals service set (drift catcher) ─────────────────────────


def test_view_set_equals_service_set():
    """Defense-in-depth: the fund_ids the service returns in fund_rows must
    exactly equal the fund_ids the view returns. If a future refactor adds
    Python-side filtering on top of the view, this assertion fails loudly.
    """
    canned_included = [
        _included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A"),
        _included_row(fund_id="bbbb2222-0000-0000-0000-000000000002", name="B"),
        _included_row(fund_id="cccc3333-0000-0000-0000-000000000003", name="C"),
    ]
    payload = _call(included=canned_included, excluded=[])

    view_ids = {row["fund_id"] for row in canned_included}
    service_ids = {fr.fund_id for fr in payload.fund_rows}
    assert view_ids == service_ids


# ─── 9. weighted_dscr provenance ────────────────────────────────────────────


def test_weighted_dscr_provenance():
    # Case 1: legacy row present → provenance is "legacy_quarter_state",
    # null_reason is None
    payload = _call(
        included=[_included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A", legacy_dscr="1.45")],
        excluded=[],
    )
    fr = payload.fund_rows[0]
    assert fr.weighted_dscr["provenance"] == "legacy_quarter_state"
    assert fr.weighted_dscr["null_reason"] is None
    assert fr.weighted_dscr["value"] is not None

    # Case 2: legacy row missing → null_reason set, value None
    payload2 = _call(
        included=[_included_row(fund_id="bbbb2222-0000-0000-0000-000000000002", name="B", legacy_dscr=None)],
        excluded=[],
    )
    fr2 = payload2.fund_rows[0]
    assert fr2.weighted_dscr["value"] is None
    assert fr2.weighted_dscr["null_reason"] == "not_in_canonical_metrics_no_legacy_row"
    assert fr2.weighted_dscr["provenance"] == "legacy_quarter_state"

    # Case 3: provenance bubbles to portfolio_summary
    assert payload.portfolio_summary.weighted_dscr["provenance"] == "legacy_quarter_state"


# ─── 10. Diagnostics env-scoped (cross-env leakage prevention) ──────────────


def test_diagnostics_env_scoped():
    """The view filters by env_id via app.env_business_bindings. The service
    additionally asserts every returned fund_row.env_id == requested env_id.
    A view that returns a fund from env B for env A is a contract violation;
    the service must raise.
    """
    from app.services import re_fund_portfolio_coherent

    # Construct an included-row whose env_id deliberately disagrees with the
    # requested env_id. This simulates a future view bug.
    rogue_row = _included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A")
    rogue_row["env_id"] = "DIFFERENT-ENV-ID"

    cur = FakeCursor()
    cur.push_result([rogue_row])
    cur.push_result([])  # inputs_hash lookup (issued before env-scope check)
    cur.push_result([])

    with patch(
        "app.services.re_fund_portfolio_coherent.get_cursor",
        _make_fake_cursor(cur),
    ):
        try:
            re_fund_portfolio_coherent.get_coherent_fund_portfolio(
                env_id=ENV_ID,
                business_id=BUSINESS_ID,
                quarter=QUARTER,
            )
        except RuntimeError as exc:
            assert "env-scope contract violation" in str(exc)
            return
        raise AssertionError("Expected env-scope contract violation to raise")


# ─── 11. IRR method label locked ────────────────────────────────────────────


def test_irr_method_label_locked():
    payload = _call(
        included=[
            _included_row(fund_id="aaaa1111-0000-0000-0000-000000000001", name="A"),
            _included_row(fund_id="bbbb2222-0000-0000-0000-000000000002", name="B"),
        ],
        excluded=[],
    )

    # Provenance label is exactly the literal string.
    assert payload.provenance.irr_method == "nav_weighted_average"
    assert payload.provenance.irr_method_n_funds == 2

    # The substring "portfolio_irr" appears nowhere in the serialized payload.
    # (Code, comments, and JSON output are all checked: the dataclass contents
    # are the only things that round-trip to JSON.)
    from app.services import re_fund_portfolio_coherent

    blob = json.dumps(re_fund_portfolio_coherent.payload_to_dict(payload))
    assert not re.search(r"portfolio_irr", blob), (
        "payload contains the string 'portfolio_irr'; "
        "the locked label is 'nav_weighted_average'."
    )
