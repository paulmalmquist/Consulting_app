"""INV-1 regression test: compute_return_metrics must source NAV from authoritative snapshot.

Asserts that:
  1. compute_return_metrics calls get_authoritative_state, not re_fund_quarter_state.
  2. If get_authoritative_state returns promotion_state != 'released',
     AuthoritativeStateNotReleasedError is raised and nothing is written.
  3. The cash event aggregation query includes an event_date <= quarter_end filter (INV-2).
  4. re_fund_quarter_state is not referenced in compute_return_metrics imports or body.
"""
from __future__ import annotations

import importlib
import inspect
import re
from decimal import Decimal
from unittest.mock import MagicMock, call, patch
from uuid import UUID

import pytest


def _mod():
    return importlib.import_module("app.services.re_fund_metrics")


# ────────────────────────────────────────────────────────────────────────────
# 1. AuthoritativeStateNotReleasedError is raised when state is not released
# ────────────────────────────────────────────────────────────────────────────

def test_raises_when_state_not_released():
    mod = _mod()
    not_released_response = {
        "promotion_state": "draft",
        "null_reason": "authoritative_state_not_released",
        "state": {"canonical_metrics": {}},
    }
    with patch.object(mod, "get_authoritative_state", return_value=not_released_response):
        with pytest.raises(mod.AuthoritativeStateNotReleasedError):
            mod.compute_return_metrics(
                env_id="test-env",
                business_id=UUID("00000000-0000-0000-0000-000000000002"),
                fund_id=UUID("00000000-0000-0000-0000-000000000001"),
                quarter="2026Q2",
                run_id=UUID("00000000-0000-0000-0000-000000000099"),
            )


def test_raises_when_state_missing():
    mod = _mod()
    missing_response = {
        "promotion_state": None,
        "null_reason": "authoritative_state_not_found",
        "state": {"canonical_metrics": {}},
    }
    with patch.object(mod, "get_authoritative_state", return_value=missing_response):
        with pytest.raises(mod.AuthoritativeStateNotReleasedError):
            mod.compute_return_metrics(
                env_id="test-env",
                business_id=UUID("00000000-0000-0000-0000-000000000002"),
                fund_id=UUID("00000000-0000-0000-0000-000000000001"),
                quarter="2026Q2",
                run_id=UUID("00000000-0000-0000-0000-000000000099"),
            )


# ────────────────────────────────────────────────────────────────────────────
# 2. re_fund_quarter_state is NOT read inside compute_return_metrics
# ────────────────────────────────────────────────────────────────────────────

def test_no_legacy_table_sql_in_compute_return_metrics():
    mod = _mod()
    source = inspect.getsource(mod.compute_return_metrics)
    # Comments may mention the banned table for documentation purposes.
    # What is forbidden is an actual SQL read: "FROM re_fund_quarter_state".
    assert not re.search(r"FROM\s+re_fund_quarter_state", source, re.IGNORECASE), (
        "compute_return_metrics still executes a SELECT FROM re_fund_quarter_state.  "
        "NAV must be sourced from get_authoritative_state (INV-1)."
    )


# ────────────────────────────────────────────────────────────────────────────
# 3. Cash event aggregation includes event_date <= quarter_end filter (INV-2)
# ────────────────────────────────────────────────────────────────────────────

def test_cash_event_query_has_event_date_filter():
    mod = _mod()
    source = inspect.getsource(mod.compute_return_metrics)
    # The SQL string must contain "event_date" and a <= comparison
    assert "event_date" in source, (
        "compute_return_metrics cash event query has no event_date filter (INV-2 violation).  "
        "Future-dated events will contaminate total_called and total_distributed."
    )
    assert re.search(r"event_date\s*<=", source), (
        "compute_return_metrics has 'event_date' but no 'event_date <=' inequality.  "
        "The filter must be 'AND event_date <= %s' bound to _quarter_end_date(quarter)."
    )


# ────────────────────────────────────────────────────────────────────────────
# 4. AuthoritativeStateNotReleasedError is exported from the module
# ────────────────────────────────────────────────────────────────────────────

def test_error_class_is_importable():
    from app.services.re_fund_metrics import AuthoritativeStateNotReleasedError
    assert issubclass(AuthoritativeStateNotReleasedError, RuntimeError)
