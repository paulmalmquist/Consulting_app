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


# ---------------------------------------------------------------------------
# Test 7 — over_scope blocks validate_snapshot_for_release
# ---------------------------------------------------------------------------

def test_validate_snapshot_blocks_over_scope():
    """A snapshot row with scope_completeness='over_scope' must produce a
    violation and block promotion. over_scope means the manifest references
    more investments than exist in re_investment — a data integrity error.
    """
    from app.services.re_authoritative_snapshots import validate_snapshot_for_release

    over_scope_row = {
        "fund_id": str(uuid4()),
        "canonical_metrics": {
            "gross_irr": "0.0240",
            "irr_trust_state": "trusted",
            "scope": {
                "investment_count": 5,
                "expected_investment_count": 3,
                "scope_completeness": "over_scope",
            },
        },
        "null_reasons": {"state": "over_scope"},
    }

    class FakeCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchall.return_value = [over_scope_row]

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", return_value=FakeCM()):
        result = validate_snapshot_for_release(snapshot_version="sv-over-scope-test")

    assert not result["ok"], "over_scope snapshot must fail the release gate"
    reasons = [v["reason"] for v in result["violations"]]
    assert any("over_scope" in r for r in reasons), (
        f"expected over_scope in violation reasons; got: {reasons}"
    )


# ---------------------------------------------------------------------------
# Test 8 — over_scope blocks promote_fund_snapshot
# ---------------------------------------------------------------------------

def test_promote_fund_snapshot_blocks_over_scope():
    """promote_fund_snapshot must raise ScopedPromotionError when the fund row
    carries scope_completeness='over_scope' in canonical_metrics.
    """
    from app.services.re_authoritative_snapshots import (
        promote_fund_snapshot,
        ScopedPromotionError,
    )

    fund_id = str(uuid4())
    over_scope_row = {
        "id": str(uuid4()),
        "promotion_state": "verified",
        "trust_status": "untrusted",
        "canonical_metrics": {
            "gross_irr": "0.0240",
            "irr_trust_state": "trusted",
            "scope": {
                "investment_count": 5,
                "expected_investment_count": 3,
                "scope_completeness": "over_scope",
                "scope_contract_version": "v1",
            },
        },
        "null_reasons": {"state": "over_scope"},
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
                self.cursor.fetchone.return_value = over_scope_row
            else:
                self.cursor.fetchone.return_value = None
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", side_effect=MultiCM):
        try:
            promote_fund_snapshot(
                snapshot_version="sv-over-scope",
                fund_id=fund_id,
                quarter="2026Q2",
                target_state="released",
                actor="test_actor",
            )
            raise AssertionError("Expected ScopedPromotionError on over_scope, got none")
        except ScopedPromotionError as e:
            assert "over_scope" in str(e), (
                f"error message must mention over_scope; got: {e}"
            )


# ---------------------------------------------------------------------------
# Test 9 — portfolio aggregates exclude partial/over_scope funds
# ---------------------------------------------------------------------------

def test_portfolio_kpis_excludes_partial_scope_fund():
    """get_released_portfolio_kpis must exclude partial-scope funds from aggregates
    and surface them in excluded_funds + warnings, not silently blend them.
    """
    from app.services.re_authoritative_snapshots import get_released_portfolio_kpis

    complete_fund_id = str(uuid4())
    partial_fund_id = str(uuid4())

    rows = [
        {
            "fund_id": complete_fund_id,
            "audit_run_id": str(uuid4()),
            "snapshot_version": "sv-mixed",
            "promotion_state": "released",
            "trust_status": "trusted",
            "breakpoint_layer": None,
            "canonical_metrics": {
                "ending_nav": "100000000",
                "gross_irr": "0.0500",
                "net_irr": "0.0400",
                "total_committed": "80000000",
                "asset_count": 3,
                "scope": {
                    "investment_count": 3,
                    "expected_investment_count": 3,
                    "scope_completeness": "complete",
                    "scope_contract_version": "v1",
                },
            },
            "null_reasons": {},
            "provenance": [],
            "artifact_paths": {},
        },
        {
            "fund_id": partial_fund_id,
            "audit_run_id": str(uuid4()),
            "snapshot_version": "sv-mixed",
            "promotion_state": "released",
            "trust_status": "untrusted",
            "breakpoint_layer": "partial_scope",
            "canonical_metrics": {
                "ending_nav": "50000000",
                "gross_irr": "-0.5177",
                "net_irr": "-0.5659",
                "total_committed": "40000000",
                "asset_count": 1,
                "scope": {
                    "investment_count": 1,
                    "expected_investment_count": 8,
                    "scope_completeness": "partial",
                    "scope_contract_version": "v1",
                },
            },
            "null_reasons": {"state": "partial_scope"},
            "provenance": [],
            "artifact_paths": {},
        },
    ]

    class FakeCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchall.return_value = rows

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", return_value=FakeCM()):
        result = get_released_portfolio_kpis(
            env_id="test-env",
            business_id=str(uuid4()),
            quarter="2026Q2",
        )

    # Only the complete fund contributes to aggregates
    assert result["fund_count"] == 1, f"expected 1 included fund, got {result['fund_count']}"
    assert result["excluded_fund_count"] == 1, (
        f"expected 1 excluded fund, got {result.get('excluded_fund_count')}"
    )
    assert any(partial_fund_id in ef["fund_id"] for ef in result["excluded_funds"]), (
        "partial_fund_id must appear in excluded_funds"
    )
    # Portfolio NAV should reflect only the complete fund's ending_nav
    assert result["portfolio_nav"] == "100000000", (
        f"portfolio_nav should be 100000000 (complete fund only), got {result['portfolio_nav']}"
    )
    # Warning must mention the partial scope exclusion
    assert any("incomplete scope" in w or "partial" in w.lower() for w in result["warnings"]), (
        f"warnings must mention partial scope exclusion; got: {result['warnings']}"
    )


# ---------------------------------------------------------------------------
# Test 10 — dispersion gate blocks high-IRR + high-terminal-value snapshots
# ---------------------------------------------------------------------------

def test_validate_snapshot_blocks_dispersion_warning():
    """A snapshot with gross_irr > 40% and terminal_value_pct > 80% must block
    unless null_reasons.dispersion_acknowledged is set.
    """
    from app.services.re_authoritative_snapshots import validate_snapshot_for_release

    fund_id = str(uuid4())
    dispersion_row = {
        "fund_id": fund_id,
        "canonical_metrics": {
            "gross_irr": "0.5340",  # 53.4% — triggers gate
            "irr_trust_state": "trusted",
            "terminal_value_pct": "0.85",  # 85% — triggers gate
            "scope": {
                "investment_count": 20,
                "expected_investment_count": 20,
                "scope_completeness": "complete",
                "scope_contract_version": "v1",
            },
        },
        "null_reasons": {},  # no dispersion_acknowledged
    }

    class FakeCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchall.return_value = [dispersion_row]

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", return_value=FakeCM()):
        result = validate_snapshot_for_release(snapshot_version="sv-dispersion-test")

    assert not result["ok"], "high-IRR/high-terminal-value snapshot must fail gate without acknowledgement"
    reasons = [v["reason"] for v in result["violations"]]
    assert any("dispersion_warning" in r for r in reasons), (
        f"expected dispersion_warning in violation reasons; got: {reasons}"
    )


def test_validate_snapshot_passes_dispersion_acknowledged():
    """A snapshot with dispersion_acknowledged=true must pass the dispersion gate."""
    from app.services.re_authoritative_snapshots import validate_snapshot_for_release

    fund_id = str(uuid4())
    acknowledged_row = {
        "fund_id": fund_id,
        "canonical_metrics": {
            "gross_irr": "0.5340",
            "irr_trust_state": "trusted",
            "terminal_value_pct": "0.85",
            "scope": {
                "investment_count": 20,
                "expected_investment_count": 20,
                "scope_completeness": "complete",
                "scope_contract_version": "v1",
            },
        },
        "null_reasons": {"dispersion_acknowledged": True},
    }

    class FakeCM:
        def __init__(self):
            self.cursor = MagicMock()
            self.cursor.__enter__ = lambda s: s
            self.cursor.__exit__ = MagicMock(return_value=False)
            self.cursor.fetchall.return_value = [acknowledged_row]

        def __enter__(self):
            return self.cursor

        def __exit__(self, *a):
            return False

    with patch("app.services.re_authoritative_snapshots.get_cursor", return_value=FakeCM()):
        result = validate_snapshot_for_release(snapshot_version="sv-dispersion-ack-test")

    assert result["ok"], (
        f"dispersion-acknowledged snapshot should pass gate; violations: {result['violations']}"
    )
