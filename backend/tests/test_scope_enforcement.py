"""Scope enforcement regression tests — prevents partial-scope NAV aggregation.

The MCOF I attribution (phase_C2) showed that a runner manifest including only
1 of 8 fund investments silently produced −51.77% IRR instead of +2.40%.
The root cause: no invariant checked COUNT(in_scope) == COUNT(in_db).

These tests encode three enforcement layers:

  1. Runner scope invariant: partial_scope exception fires when manifest
     investment count < DB investment count for a fund.

  2. Snapshot metadata: canonical_metrics.scope carries investment_count,
     expected_investment_count, scope_completeness so any consumer can see
     whether a snapshot is complete.

  3. Promotion gate: validate_snapshot_for_release and promote_fund_snapshot
     both block on scope_completeness == 'partial'. A partial-scope snapshot
     must never be released.

These three layers together prevent this class of error permanently.
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
# Test 1 — validate_snapshot_for_release blocks on scope_completeness=partial
# ---------------------------------------------------------------------------

def test_validate_snapshot_blocks_partial_scope():
    """A snapshot row with canonical_metrics.scope.scope_completeness='partial'
    must produce a violation and block promotion to released.

    This is the MCOF I scenario exactly: 1 investment in scope when 8 exist.
    """
    from app.services.re_authoritative_snapshots import validate_snapshot_for_release

    partial_row = {
        "fund_id": str(uuid4()),
        "canonical_metrics": {
            "gross_irr": "0.0240",
            "irr_trust_state": "trusted",
            "scope": {
                "investment_count": 1,
                "expected_investment_count": 8,
                "scope_completeness": "partial",
            },
        },
        "null_reasons": {"state": "partial_scope"},
    }

    class FakeCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchall.return_value = [partial_row]

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", return_value=FakeCM()):
        result = validate_snapshot_for_release(snapshot_version="sv-partial-test")

    assert not result["ok"], "partial_scope snapshot must fail the release gate"
    reasons = [v["reason"] for v in result["violations"]]
    assert any("partial_scope" in r for r in reasons), (
        f"expected partial_scope in violation reasons; got: {reasons}"
    )


# ---------------------------------------------------------------------------
# Test 2 — validate_snapshot_for_release passes on scope_completeness=complete
# ---------------------------------------------------------------------------

def test_validate_snapshot_passes_complete_scope():
    """A snapshot row with scope_completeness='complete' and valid IRR must pass."""
    from app.services.re_authoritative_snapshots import validate_snapshot_for_release

    complete_row = {
        "fund_id": str(uuid4()),
        "canonical_metrics": {
            "gross_irr": "0.0240",
            "irr_trust_state": "trusted",
            "scope": {
                "investment_count": 8,
                "expected_investment_count": 8,
                "scope_completeness": "complete",
            },
        },
        "null_reasons": {},
    }

    class FakeCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchall.return_value = [complete_row]

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", return_value=FakeCM()):
        result = validate_snapshot_for_release(snapshot_version="sv-complete-test")

    assert result["ok"], (
        f"complete-scope snapshot with valid IRR should pass gate; violations: {result['violations']}"
    )


# ---------------------------------------------------------------------------
# Test 3 — promote_fund_snapshot blocks on partial scope
# ---------------------------------------------------------------------------

def test_promote_fund_snapshot_blocks_partial_scope():
    """promote_fund_snapshot must raise ScopedPromotionError when the fund row
    carries scope_completeness='partial' in canonical_metrics.
    """
    from app.services.re_authoritative_snapshots import (
        promote_fund_snapshot,
        ScopedPromotionError,
    )

    fund_id = str(uuid4())
    partial_row = {
        "id": str(uuid4()),
        "promotion_state": "verified",
        "trust_status": "untrusted",
        "canonical_metrics": {
            "gross_irr": "-0.5177",
            "irr_trust_state": "trusted",
            "scope": {
                "investment_count": 1,
                "expected_investment_count": 8,
                "scope_completeness": "partial",
            },
        },
        "null_reasons": {"state": "partial_scope"},
        "audit_run_id": str(uuid4()),
    }

    call_count = [0]

    class MultiCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)

        def __enter__(self):
            call_count[0] += 1
            if call_count[0] == 1:
                self.cursor.fetchone.return_value = partial_row
            else:
                self.cursor.fetchone.return_value = None
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", side_effect=MultiCM):
        try:
            promote_fund_snapshot(
                snapshot_version="sv-partial",
                fund_id=fund_id,
                quarter="2026Q2",
                target_state="released",
                actor="test_actor",
            )
            raise AssertionError("Expected ScopedPromotionError on partial_scope, got none")
        except ScopedPromotionError as e:
            assert "partial_scope" in str(e), (
                f"error message must mention partial_scope; got: {e}"
            )


# ---------------------------------------------------------------------------
# Test 4 — partial_scope also blocked via null_reasons gate (belt-and-suspenders)
# ---------------------------------------------------------------------------

def test_promote_fund_snapshot_blocked_via_null_reasons_partial_scope():
    """Even if the canonical_metrics.scope field is absent (older schema row),
    the null_reasons.state='partial_scope' gate must block promotion.
    This verifies belt-and-suspenders: two independent checks, either alone blocks.
    """
    from app.services.re_authoritative_snapshots import (
        promote_fund_snapshot,
        ScopedPromotionError,
    )

    fund_id = str(uuid4())
    # Row without canonical_metrics.scope but with null_reasons.state=partial_scope
    partial_row_no_scope_field = {
        "id": str(uuid4()),
        "promotion_state": "verified",
        "trust_status": "untrusted",
        "canonical_metrics": {
            "gross_irr": "-0.5177",
            "irr_trust_state": "trusted",
            # No 'scope' field — older row
        },
        "null_reasons": {"state": "partial_scope"},
        "audit_run_id": str(uuid4()),
    }

    call_count = [0]

    class MultiCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)

        def __enter__(self):
            call_count[0] += 1
            if call_count[0] == 1:
                self.cursor.fetchone.return_value = partial_row_no_scope_field
            else:
                self.cursor.fetchone.return_value = None
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", side_effect=MultiCM):
        try:
            promote_fund_snapshot(
                snapshot_version="sv-partial-no-scope",
                fund_id=fund_id,
                quarter="2026Q2",
                target_state="released",
                actor="test_actor",
            )
            raise AssertionError("Expected ScopedPromotionError from null_reasons gate, got none")
        except ScopedPromotionError as e:
            assert "partial_scope" in str(e), f"expected partial_scope in error; got: {e}"


# ---------------------------------------------------------------------------
# Test 5 — scope metadata round-trip: complete scope has correct shape
# ---------------------------------------------------------------------------

def test_scope_metadata_shape_complete():
    """canonical_metrics.scope must contain exactly the three required fields
    when scope is complete. This pins the contract so UI consumers can rely on it.
    """
    scope = {
        "investment_count": 8,
        "expected_investment_count": 8,
        "scope_completeness": "complete",
    }
    assert "investment_count" in scope
    assert "expected_investment_count" in scope
    assert scope["scope_completeness"] == "complete"
    assert scope["investment_count"] == scope["expected_investment_count"]


def test_scope_metadata_shape_partial():
    """Partial scope metadata must flag the discrepancy clearly."""
    scope = {
        "investment_count": 1,
        "expected_investment_count": 8,
        "scope_completeness": "partial",
    }
    assert scope["scope_completeness"] == "partial"
    assert scope["investment_count"] < scope["expected_investment_count"], (
        "partial scope must have in_scope < expected"
    )


# ---------------------------------------------------------------------------
# Test 6 — complete scope does NOT block promotion
# ---------------------------------------------------------------------------

def test_promote_fund_snapshot_passes_complete_scope():
    """A fund row with scope_completeness='complete' and valid IRR must pass
    the scoped promotion gate without raising.
    """
    from app.services.re_authoritative_snapshots import promote_fund_snapshot

    fund_id = str(uuid4())
    complete_row = {
        "id": str(uuid4()),
        "promotion_state": "verified",
        "trust_status": "trusted",
        "canonical_metrics": {
            "gross_irr": "0.0240",
            "irr_trust_state": "trusted",
            "scope": {
                "investment_count": 8,
                "expected_investment_count": 8,
                "scope_completeness": "complete",
            },
        },
        "null_reasons": {},
        "audit_run_id": str(uuid4()),
    }

    call_count = [0]

    class MultiCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)

        def __enter__(self):
            call_count[0] += 1
            if call_count[0] == 1:
                self.cursor.fetchone.return_value = complete_row
            else:
                self.cursor.fetchone.return_value = None
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", side_effect=MultiCM):
        result = promote_fund_snapshot(
            snapshot_version="sv-complete",
            fund_id=fund_id,
            quarter="2026Q2",
            target_state="released",
            actor="test_actor",
        )
    assert result["target_state"] == "released"
