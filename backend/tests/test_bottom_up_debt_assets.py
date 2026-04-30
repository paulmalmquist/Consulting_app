"""Tests for debt / credit asset behavior in build_asset_cf_series.

Credit funds (CMBS bridge loans, mezz, pref equity, etc.) RECEIVE
borrower debt service via revenue. They do not pay debt service themselves.
Their terminal value is outstanding principal balance, not NOI / cap-rate.

These tests pin down the routing rules added by the credit-asset patch:

  1. ``_is_debt_asset`` matches when ``deal_type='debt'`` OR
     ``asset_type IN ('cmbs','mezz','pref_equity','loan','bridge_loan')``.
  2. The operating-CF loop ignores ``debt_service`` for debt assets.
  3. The terminal-value resolver returns outstanding principal
     (defaulting to cost_basis) for debt assets, BEFORE falling back
     to NOI / cap-rate (equity-only).
  4. Equity assets keep their existing behavior intact.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch


from app.services.bottom_up_cashflow import (
    DEBT_ASSET_TYPES,
    _is_debt_asset,
    _resolve_terminal_value,
)


def test_is_debt_asset_matches_deal_type_debt():
    assert _is_debt_asset({"deal_type": "debt", "asset_type": "anything"})
    assert _is_debt_asset({"deal_type": "DEBT", "asset_type": "property"})
    # Equity deal with property asset is NOT debt
    assert not _is_debt_asset({"deal_type": "equity", "asset_type": "property"})


def test_is_debt_asset_matches_asset_type_cmbs_and_friends():
    for at in DEBT_ASSET_TYPES:
        assert _is_debt_asset({"deal_type": "equity", "asset_type": at}), (
            f"asset_type={at} should classify as debt"
        )
    # Unknown asset_type and unknown deal_type → not debt
    assert not _is_debt_asset({"deal_type": "fund_of_funds", "asset_type": "land"})


def test_is_debt_asset_handles_missing_keys():
    assert _is_debt_asset({"deal_type": "debt"})
    assert _is_debt_asset({"asset_type": "cmbs"})
    assert not _is_debt_asset({})
    assert not _is_debt_asset({"deal_type": None, "asset_type": None})


def test_terminal_value_uses_outstanding_principal_for_debt_when_no_authoritative_nav():
    asset_ctx = {
        "deal_type": "debt",
        "asset_type": "cmbs",
        "cost_basis": Decimal("65000000"),
    }
    # Stub _load_nav_for_terminal so neither authoritative NAV nor
    # quarter-state NAV is found.
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(None, None),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=[],
            exit_event=None,
            env_default_cap_rate=None,
            asset_ctx=asset_ctx,
        )

    assert tv["amount"] == Decimal("65000000")
    assert tv["source"] == "debt_outstanding_principal_default"


def test_terminal_value_authoritative_nav_overrides_debt_default():
    """Priority 1 (authoritative NAV) must win over the new debt path."""
    asset_ctx = {"deal_type": "debt", "cost_basis": Decimal("65000000")}
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(Decimal("19000000"), "authoritative_nav"),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=[],
            exit_event=None,
            env_default_cap_rate=None,
            asset_ctx=asset_ctx,
        )

    # Even though debt path would return 65M, authoritative NAV of 19M wins.
    assert tv["amount"] == Decimal("19000000")
    assert tv["source"] == "authoritative_nav"


def test_terminal_value_debt_asset_without_cost_basis_returns_explicit_null():
    asset_ctx = {"deal_type": "debt", "cost_basis": None}
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(None, None),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=[],
            exit_event=None,
            env_default_cap_rate=None,
            asset_ctx=asset_ctx,
        )

    assert tv["amount"] is None
    assert tv["reason"] == "debt_asset_missing_cost_basis"


def test_terminal_value_equity_asset_falls_through_to_noi_cap_path():
    asset_ctx = {"deal_type": "equity", "asset_type": "property", "cost_basis": Decimal("50000000")}
    operating_rows = [
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
    ]
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(None, None),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=operating_rows,
            exit_event=None,
            env_default_cap_rate=Decimal("0.07"),
            asset_ctx=asset_ctx,
        )

    # NOI = 4 * (1M - 100K) = 3.6M annualized; / 7% cap = ~51.43M
    assert tv["amount"] is not None
    assert "cap_rate" in tv
    assert Decimal("50000000") < tv["amount"] < Decimal("55000000")


def test_terminal_value_equity_asset_with_no_op_returns_no_inflow():
    asset_ctx = {"deal_type": "equity", "asset_type": "property", "cost_basis": Decimal("50000000")}
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(None, None),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=[],
            exit_event=None,
            env_default_cap_rate=Decimal("0.07"),
            asset_ctx=asset_ctx,
        )

    assert tv["amount"] is None
    assert tv["reason"] == "no_inflow"
