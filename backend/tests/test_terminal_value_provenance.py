"""Tests for the terminal-value resolver provenance and sanity gate.

The runtime must:
  1. Accept authoritative NAV unconditionally (priority 1).
  2. Accept quarter_state NAV only when the implied cap rate is in band
     (3%-15%); otherwise reject with structured provenance.
  3. Fall through to debt outstanding principal for debt assets.
  4. Fall through to NOI / cap-rate (env_default or exit_event cap) when
     other sources are rejected.
  5. Return all rejection metadata (rejected_quarter_state_nav,
     rejected_implied_cap_rate, cap_rate_source) so consumers can audit
     why the value differs from on-disk NAV.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from app.services.bottom_up_cashflow import _resolve_terminal_value


def test_authoritative_nav_takes_priority_unconditional():
    asset_ctx = {"deal_type": "equity", "asset_type": "property", "cost_basis": Decimal("50000000")}
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(Decimal("100000000"), "authoritative_nav"),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=[],
            exit_event=None,
            env_default_cap_rate=Decimal("0.065"),
            asset_ctx=asset_ctx,
        )
    assert tv["amount"] == Decimal("100000000")
    assert tv["source"] == "authoritative_nav"
    assert "implied_cap_rate" not in tv  # authoritative isn't sanity-gated


def test_quarter_state_nav_accepted_when_implied_cap_in_band():
    asset_ctx = {"deal_type": "equity", "asset_type": "property"}
    operating = [
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
    ]
    # NOI = 4*900K = 3.6M. NAV = 50M → implied cap = 7.2%, in band [3%, 15%]
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(Decimal("50000000"), "quarter_state_nav"),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=operating,
            exit_event=None,
            env_default_cap_rate=Decimal("0.065"),
            asset_ctx=asset_ctx,
        )
    assert tv["amount"] == Decimal("50000000")
    assert tv["source"] == "quarter_state_nav"
    assert tv["implied_cap_rate"] is not None
    assert 0.03 < tv["implied_cap_rate"] < 0.15


def test_quarter_state_nav_rejected_when_implied_cap_out_of_band():
    """NAV that implies a >15% cap rate (e.g. wildly undervalued) is
    rejected, runtime falls through to noi_cap_rate, AND the rejection
    metadata is preserved for audit."""
    asset_ctx = {"deal_type": "equity", "asset_type": "property"}
    # NOI = 3.6M. NAV = 18M → implied cap = 20%, out of band
    operating = [
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
        {"revenue": Decimal("1000000"), "other_income": Decimal("0"), "opex": Decimal("100000")},
    ]
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(Decimal("18000000"), "quarter_state_nav"),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=operating,
            exit_event=None,
            env_default_cap_rate=Decimal("0.065"),
            asset_ctx=asset_ctx,
        )
    # Falls through to noi/cap = 3.6M / 0.065 = ~55.4M
    assert tv["source"] == "noi_cap_rate"
    assert tv["cap_rate"] == 0.065
    assert tv["cap_rate_source"] == "env_default_cap_rate"
    # Rejection metadata is preserved
    assert tv["rejected_quarter_state_nav"] == 18000000.0
    assert tv["rejected_implied_cap_rate"] > 0.15


def test_quarter_state_nav_with_no_noi_accepted_with_low_confidence():
    """When NOI is unavailable, we can't compute implied cap. Accept the
    NAV but flag it via implied_cap_rate=None for downstream awareness."""
    asset_ctx = {"deal_type": "equity", "asset_type": "property"}
    with patch(
        "app.services.bottom_up_cashflow._load_nav_for_terminal",
        return_value=(Decimal("50000000"), "quarter_state_nav"),
    ):
        tv = _resolve_terminal_value(
            cur=None,
            asset_id="00000000-0000-0000-0000-000000000001",
            as_of_quarter="2026Q2",
            operating_rows=[],
            exit_event=None,
            env_default_cap_rate=Decimal("0.065"),
            asset_ctx=asset_ctx,
        )
    assert tv["amount"] == Decimal("50000000")
    assert tv["source"] == "quarter_state_nav"
    assert tv["implied_cap_rate"] is None  # explicit "could not verify"


def test_exit_event_cap_rate_used_when_present():
    asset_ctx = {"deal_type": "equity", "asset_type": "property"}
    operating = [
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
            operating_rows=operating,
            exit_event={"projected_cap_rate": Decimal("0.05")},
            env_default_cap_rate=Decimal("0.065"),
            asset_ctx=asset_ctx,
        )
    # Exit-event cap (0.05) wins over env default (0.065)
    assert tv["source"] == "noi_cap_rate"
    assert tv["cap_rate"] == 0.05
    assert tv["cap_rate_source"] == "exit_event_projected_cap_rate"


def test_no_cap_rate_anywhere_returns_no_cap_rate_reason():
    asset_ctx = {"deal_type": "equity", "asset_type": "property"}
    operating = [
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
            operating_rows=operating,
            exit_event=None,
            env_default_cap_rate=None,
            asset_ctx=asset_ctx,
        )
    assert tv["amount"] is None
    assert tv["reason"] == "no_cap_rate"
