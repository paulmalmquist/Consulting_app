"""INV-5 regression test: _compute_waterfall_carry must fail closed.

Asserts that:
  1. When run_waterfall raises, _compute_waterfall_carry returns None — never a
     numeric fallback.
  2. When _compute_waterfall_carry returns None, _compute_net_xirr returns None.
  3. The policy-carry approximation (20% of gains above 8% hurdle) is NOT present
     anywhere in the exception-handling path of _compute_waterfall_carry.

This test is the structural guard for SYSTEM_RULES_AUTHORITATIVE_STATE Rule 3:
  "Waterfall-dependent metrics must return null + null_reason, never an approximation."
"""
from __future__ import annotations

import importlib
import inspect
from decimal import Decimal
from unittest.mock import MagicMock, patch


def _get_fn():
    """Import the functions under test fresh each time to pick up edits."""
    mod = importlib.import_module("app.services.re_fund_metrics")
    return (
        mod._compute_waterfall_carry,
        mod._compute_net_xirr,
    )


# ────────────────────────────────────────────────────────────────────────────
# 1. fail-closed — LookupError → None
# ────────────────────────────────────────────────────────────────────────────

def test_carry_returns_none_on_lookup_error():
    wf_carry, _ = _get_fn()
    with patch("app.services.re_waterfall_runtime.run_waterfall", side_effect=LookupError("no definition")):
        result = wf_carry(
            fund_id="00000000-0000-0000-0000-000000000001",
            quarter="2026Q2",
            gross_return=Decimal("500000"),
            total_called=Decimal("1000000"),
        )
    assert result is None, f"Expected None, got {result!r}"


def test_carry_returns_none_on_value_error():
    wf_carry, _ = _get_fn()
    with patch("app.services.re_waterfall_runtime.run_waterfall", side_effect=ValueError("waterfall error")):
        result = wf_carry(
            fund_id="00000000-0000-0000-0000-000000000001",
            quarter="2026Q2",
            gross_return=Decimal("500000"),
            total_called=Decimal("1000000"),
        )
    assert result is None, f"Expected None, got {result!r}"


def test_carry_returns_none_on_import_error():
    wf_carry, _ = _get_fn()
    with patch("app.services.re_waterfall_runtime.run_waterfall", side_effect=ImportError):
        result = wf_carry(
            fund_id="00000000-0000-0000-0000-000000000001",
            quarter="2026Q2",
            gross_return=Decimal("500000"),
            total_called=Decimal("1000000"),
        )
    assert result is None, f"Expected None, got {result!r}"


# ────────────────────────────────────────────────────────────────────────────
# 2. policy fallback is GONE from source code
# ────────────────────────────────────────────────────────────────────────────

def test_no_policy_carry_in_fallback_path():
    """The 20%-above-8%-hurdle approximation must not exist in the exception handler."""
    mod = importlib.import_module("app.services.re_fund_metrics")
    source = inspect.getsource(mod._compute_waterfall_carry)
    # Look for the specific policy-carry constant.  0.08 and 0.20 together in
    # the except block is the tell.  The numeric constants should be gone from
    # the function entirely — the except block should only return None.
    assert "0.08" not in source or "0.20" not in source, (
        "_compute_waterfall_carry still contains the policy-carry approximation "
        "(0.08 pref hurdle and 0.20 carry rate).  The fallback must be removed and "
        "the except block must only return None."
    )


# ────────────────────────────────────────────────────────────────────────────
# 3. _compute_net_xirr propagates None when carry is None
# ────────────────────────────────────────────────────────────────────────────

def test_net_xirr_returns_none_when_carry_is_none():
    _, net_xirr = _get_fn()
    mock_cur = MagicMock()
    result = net_xirr(
        cur=mock_cur,
        env_id="test-env",
        business_id="00000000-0000-0000-0000-000000000002",
        fund_id="00000000-0000-0000-0000-000000000001",
        quarter="2026Q2",
        terminal_nav=Decimal("50000000"),
        mgmt_fees=Decimal("1000000"),
        fund_expenses=Decimal("200000"),
        carry=None,
    )
    assert result is None, f"Expected None when carry=None, got {result!r}"
    # The cursor should not have been called (no XIRR computation attempted)
    mock_cur.execute.assert_not_called()


# ────────────────────────────────────────────────────────────────────────────
# 4. successful waterfall path still returns a Decimal
# ────────────────────────────────────────────────────────────────────────────

def test_carry_returns_decimal_on_success():
    wf_carry, _ = _get_fn()
    mock_result = {
        "results": [
            {"tier_code": "carry_tier", "amount": "1234567.89"},
            {"tier_code": "preferred_return", "amount": "5000000.00"},
        ]
    }
    with patch("app.services.re_waterfall_runtime.run_waterfall", return_value=mock_result):
        result = wf_carry(
            fund_id="00000000-0000-0000-0000-000000000001",
            quarter="2026Q2",
            gross_return=Decimal("50000000"),
            total_called=Decimal("100000000"),
        )
    assert isinstance(result, Decimal), f"Expected Decimal on success, got {type(result)}"
    assert result == Decimal("1234567.89"), f"Unexpected carry value: {result}"
