"""Scoped promotion regression tests — Stream 1 guardrails.

Five invariants that must hold for every call to promote_fund_snapshot:

  1. Non-mutation: promoting one (fund_id, quarter) row must not touch any
     other row in the same snapshot_version.

  2. Fund-scoped gate: if the target fund passes the release gate but another
     fund in the same snapshot_version would fail it, the promotion must
     succeed (gate does not scan the failing fund).

  3. Unknown row rejection: (snapshot_version, fund_id, quarter) not present
     → ScopedPromotionError raised. No silent no-op.

  4. Audit lineage: the lineage dict returned by promote_fund_snapshot carries
     scope='fund_only', fund_id, quarter, and old_release_snapshot_version.

  5. Mixed-state aggregation: after a per-fund scoped release, portfolio-level
     API responses carry mixed_release_states=True with a per_fund_snapshot_version
     breakdown when funds are on different snapshot_versions. This is the bulwark
     against silently blending old and new snapshot methodologies.

See plan §Stream 1, Steps 1.3 + 1.0 (lineage invariant).
"""
from __future__ import annotations

import os
import sys
import types
from unittest.mock import MagicMock, patch
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
# Helpers
# ---------------------------------------------------------------------------

def _make_fund_row(
    fund_id: str,
    quarter: str,
    promotion_state: str = "verified",
    gross_irr: str = "0.534",
    irr_trust_state: str = "trusted",
    null_reason: str | None = None,
) -> dict:
    return {
        "id": str(uuid4()),
        "promotion_state": promotion_state,
        "trust_status": "trusted",
        "canonical_metrics": {
            "gross_irr": gross_irr,
            "irr_trust_state": irr_trust_state,
        },
        "null_reason": null_reason,
        "audit_run_id": str(uuid4()),
    }


def _cursor_that_tracks(executed_updates: list[dict]):
    """Return a context-manager cursor whose execute() records UPDATE calls."""

    class FakeCursor:
        def __init__(self):
            self._rows: list[dict] = []

        def execute(self, sql: str, params=None):
            if sql.strip().upper().startswith("UPDATE"):
                executed_updates.append({"sql": sql, "params": params})

        def fetchone(self):
            return self._rows[0] if self._rows else None

        def fetchall(self):
            return list(self._rows)

        def set_next_row(self, row):
            self._rows = [row]

        def set_rows(self, rows):
            self._rows = list(rows)

    class FakeCM:
        def __init__(self):
            self.cursor = FakeCursor()

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            pass

    return FakeCM()


# ---------------------------------------------------------------------------
# Test 1 — non-mutation: only the targeted (fund_id, quarter) row is touched
# ---------------------------------------------------------------------------

def test_promote_fund_snapshot_only_touches_targeted_row():
    """Seed 3 verified rows under one snapshot_version; promote one;
    assert that SQL UPDATE calls are scoped to the targeted (fund_id, quarter).

    Core invariant: no other row in the snapshot_version is mutated.
    We verify this by inspecting the WHERE clauses on all UPDATE statements
    produced by promote_fund_snapshot — every UPDATE must carry both
    fund_id=<target> AND quarter=<target>.
    """
    from app.services.re_authoritative_snapshots import promote_fund_snapshot

    snapshot_version = "meridian-20260421T151330Z-325c3fa0"
    target_fund = "a1b2c3d4-0003-0030-0001-000000000001"
    target_quarter = "2026Q2"
    other_fund_a = str(uuid4())
    other_fund_b = str(uuid4())

    target_row = _make_fund_row(target_fund, target_quarter)

    executed_updates: list[dict] = []

    # We need two independent cursor contexts: one for the initial SELECT,
    # one for the prior-release SELECT, and one for the UPDATEs.
    call_count = [0]

    class MultiCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)

        def __enter__(self):
            call_count[0] += 1
            if call_count[0] == 1:
                # First context: SELECT target row
                self.cursor.fetchone.return_value = target_row
            elif call_count[0] == 2:
                # Second context: prior released row lookup
                self.cursor.fetchone.return_value = None
            else:
                # Third+ context: UPDATEs — track them
                def _track_execute(sql, params=None):
                    if sql.strip().upper().startswith("UPDATE"):
                        executed_updates.append({"sql": sql, "params": list(params) if params else []})
                self.cursor.execute.side_effect = _track_execute
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", side_effect=MultiCM):
        promote_fund_snapshot(
            snapshot_version=snapshot_version,
            fund_id=target_fund,
            quarter=target_quarter,
            target_state="released",
            actor="test_actor",
        )

    assert executed_updates, "expected at least one UPDATE statement"

    # Every UPDATE that touches fund state tables must scope to (fund_id, quarter).
    for update in executed_updates:
        sql = update["sql"]
        params = update["params"]
        if "re_authoritative_fund_state_qtr" in sql or \
           "re_authoritative_investment_state_qtr" in sql or \
           "re_authoritative_asset_state_qtr" in sql or \
           "re_authoritative_fund_gross_to_net_qtr" in sql:
            # The WHERE clause must bind fund_id and quarter.
            assert "fund_id" in sql, f"UPDATE missing fund_id scope: {sql[:120]}"
            assert "quarter" in sql, f"UPDATE missing quarter scope: {sql[:120]}"
            # The params must contain the target values, not some other fund.
            params_str = " ".join(str(p) for p in params)
            assert target_fund in params_str, (
                f"UPDATE params do not contain target fund_id {target_fund}: {params_str[:200]}"
            )
            assert target_quarter in params_str, (
                f"UPDATE params do not contain target quarter {target_quarter}: {params_str[:200]}"
            )
            # Neither of the other funds should appear in the params.
            assert other_fund_a not in params_str, "non-target fund_a appeared in UPDATE params"
            assert other_fund_b not in params_str, "non-target fund_b appeared in UPDATE params"


# ---------------------------------------------------------------------------
# Test 2 — fund-scoped gate runs only on the target fund
# ---------------------------------------------------------------------------

def test_promote_fund_snapshot_release_gate_runs_on_single_fund_only():
    """Seed a snapshot where target fund passes the release gate but another
    fund in the same snapshot_version would fail (missing gross_irr).

    Scoped promotion must succeed — the gate must NOT scan or reject based on
    the failing sibling fund.
    """
    from app.services.re_authoritative_snapshots import (
        promote_fund_snapshot,
        ScopedPromotionError,
    )

    target_fund = str(uuid4())
    target_row = _make_fund_row(target_fund, "2026Q2")

    call_count = [0]

    class MultiCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)

        def __enter__(self):
            call_count[0] += 1
            if call_count[0] == 1:
                self.cursor.fetchone.return_value = target_row
            else:
                self.cursor.fetchone.return_value = None
            return self.cursor

        def __exit__(self, *a):
            return False

    try:
        with patch("app.services.re_authoritative_snapshots.get_cursor", side_effect=MultiCM):
            result = promote_fund_snapshot(
                snapshot_version="sv-test",
                fund_id=target_fund,
                quarter="2026Q2",
                target_state="released",
                actor="test_actor",
            )
        # Promotion must succeed — the failing sibling fund was not in scope.
        assert result["target_state"] == "released"
        assert result["fund_id"] == target_fund
    except ScopedPromotionError as e:
        raise AssertionError(
            f"Scoped promotion should not gate on sibling funds. Got: {e}"
        ) from e


# ---------------------------------------------------------------------------
# Test 3 — unknown row raises ScopedPromotionError
# ---------------------------------------------------------------------------

def test_promote_fund_snapshot_rejects_unknown_row():
    """(snapshot_version, fund_id, quarter) not present in the table →
    ScopedPromotionError must be raised. No silent no-op.
    """
    from app.services.re_authoritative_snapshots import (
        promote_fund_snapshot,
        ScopedPromotionError,
    )

    class NotFoundCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchone.return_value = None

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", side_effect=NotFoundCM):
        try:
            promote_fund_snapshot(
                snapshot_version="sv-nonexistent",
                fund_id=str(uuid4()),
                quarter="2026Q2",
                target_state="released",
                actor="test_actor",
            )
            raise AssertionError("Expected ScopedPromotionError but no exception was raised")
        except ScopedPromotionError as e:
            assert "row_not_found" in str(e), (
                f"expected row_not_found in error message; got: {e}"
            )


# ---------------------------------------------------------------------------
# Test 4 — audit lineage row carries scope markers + old snapshot version
# ---------------------------------------------------------------------------

def test_promote_fund_snapshot_audit_row_records_scope():
    """The dict returned by promote_fund_snapshot must carry:
      - scope='fund_only' in the lineage dict
      - fund_id
      - quarter
      - old_release_snapshot_version (the previously-released version, or None)
      - new_scoped_snapshot_version (the one being promoted)

    This is the audit trail that makes per-fund release cadences traceable.
    """
    from app.services.re_authoritative_snapshots import promote_fund_snapshot

    target_fund = str(uuid4())
    old_sv = "old-released-snapshot-version"
    new_sv = "new-scoped-snapshot-version"
    target_row = _make_fund_row(target_fund, "2026Q2")
    prior_row = {"old_snapshot_version": old_sv}

    call_count = [0]

    class MultiCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)

        def __enter__(self):
            call_count[0] += 1
            if call_count[0] == 1:
                self.cursor.fetchone.return_value = target_row
            elif call_count[0] == 2:
                self.cursor.fetchone.return_value = prior_row
            else:
                self.cursor.fetchone.return_value = None
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", side_effect=MultiCM):
        result = promote_fund_snapshot(
            snapshot_version=new_sv,
            fund_id=target_fund,
            quarter="2026Q2",
            target_state="released",
            actor="gate7_execution_2026-04-23",
        )

    assert result["fund_id"] == target_fund
    assert result["quarter"] == "2026Q2"
    assert result["snapshot_version"] == new_sv
    assert result["old_release_snapshot_version"] == old_sv

    lineage = result["lineage"]
    assert lineage["scope"] == "fund_only", (
        f"lineage.scope must be 'fund_only'; got {lineage['scope']!r}"
    )
    assert lineage["fund_id"] == target_fund
    assert lineage["quarter"] == "2026Q2"
    assert lineage["old_release_snapshot_version"] == old_sv
    assert lineage["new_scoped_snapshot_version"] == new_sv


# ---------------------------------------------------------------------------
# Test 5 — mixed-state aggregation: portfolio API carries mixed_release_states flag
# ---------------------------------------------------------------------------

def test_scoped_promotion_does_not_affect_aggregates_silently():
    """After a per-fund scoped release, portfolio-level aggregations must
    carry mixed_release_states=True and a per_fund_snapshot_version breakdown
    when funds are on different snapshot_versions.

    This test validates the contract at the get_released_portfolio_kpis layer —
    the function that feeds every portfolio-level API response. If this test
    fails, a consumer could silently blend NAV and IRR from funds computed
    under different methodologies without any warning.

    Scenario: fund-A is on new_sv (just scoped-promoted), fund-B is still on
    old_sv (the prior all-funds release). The aggregation must flag the mix.
    """
    from app.services.re_authoritative_snapshots import get_released_portfolio_kpis

    env_id = str(uuid4())
    business_id = str(uuid4())
    fund_a = str(uuid4())
    fund_b = str(uuid4())
    old_sv = "inv5-rebuild-20260411-full-scope"
    new_sv = "meridian-20260421T151330Z-325c3fa0"

    fund_a_row = {
        "fund_id": fund_a,
        "audit_run_id": str(uuid4()),
        "snapshot_version": new_sv,
        "promotion_state": "released",
        "trust_status": "trusted",
        "breakpoint_layer": None,
        "canonical_metrics": {
            "ending_nav": "1239546916.92",
            "gross_irr": "0.5340",
            "net_irr": "0.5099",
            "total_committed": "695000000",
            "asset_count": 20,
        },
        "null_reasons": {},
        "provenance": [],
        "artifact_paths": {},
    }
    fund_b_row = {
        "fund_id": fund_b,
        "audit_run_id": str(uuid4()),
        "snapshot_version": old_sv,
        "promotion_state": "released",
        "trust_status": "trusted",
        "breakpoint_layer": None,
        "canonical_metrics": {
            "ending_nav": "42852173.50",
            "gross_irr": "0.0547",
            "net_irr": None,
            "total_committed": "500000000",
            "asset_count": 5,
        },
        "null_reasons": {},
        "provenance": [],
        "artifact_paths": {},
    }

    class FakeCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchall.return_value = [fund_a_row, fund_b_row]

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", return_value=FakeCM()):
        kpis = get_released_portfolio_kpis(
            env_id=env_id,
            business_id=business_id,
            quarter="2026Q2",
        )

    # Core invariant: mixed release state MUST be flagged.
    assert kpis.get("mixed_release_states") is True, (
        "mixed_release_states must be True when funds span different snapshot_versions; "
        f"got: {kpis.get('mixed_release_states')!r}"
    )

    # Per-fund breakdown must be present so consumers can surface the mix.
    pfv = kpis.get("per_fund_snapshot_version") or {}
    assert pfv.get(fund_a) == new_sv, (
        f"fund-A snapshot_version must be {new_sv}; got {pfv.get(fund_a)!r}"
    )
    assert pfv.get(fund_b) == old_sv, (
        f"fund-B snapshot_version must be {old_sv}; got {pfv.get(fund_b)!r}"
    )

    # The top-level snapshot_version must be None (cannot collapse to a single version).
    assert kpis.get("snapshot_version") is None, (
        "snapshot_version must be None when multiple versions are present; "
        f"got: {kpis.get('snapshot_version')!r}"
    )

    # A warning must be present so no API consumer is silently unaware.
    assert kpis.get("warnings"), "expected at least one warning about mixed snapshot_versions"
    assert any("mixed" in w.lower() or "multiple snapshot" in w.lower() for w in kpis["warnings"]), (
        f"warning should mention mixed/multiple snapshot versions; got: {kpis['warnings']}"
    )

    # Homogeneous case — same snapshot_version for both funds → no flag.
    fund_b_same_sv = dict(fund_b_row)
    fund_b_same_sv["snapshot_version"] = new_sv

    class FakeCM2:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchall.return_value = [fund_a_row, fund_b_same_sv]

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", return_value=FakeCM2()):
        kpis_homogeneous = get_released_portfolio_kpis(
            env_id=env_id,
            business_id=business_id,
            quarter="2026Q2",
        )

    assert kpis_homogeneous.get("mixed_release_states") is False, (
        "mixed_release_states must be False when all funds share the same snapshot_version"
    )
    assert kpis_homogeneous.get("snapshot_version") == new_sv, (
        "snapshot_version must be the single shared version in homogeneous case"
    )
    assert not kpis_homogeneous.get("warnings"), (
        "no warnings expected in homogeneous case"
    )
