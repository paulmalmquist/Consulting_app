"""INV-3 regression test: IRR must not be computed on incomplete cash flow series.

Asserts that _compute_fund_xirr returns None (not a numeric) when:
  - There are no CALL events (no negative cash flows)
  - There are no DIST events and no terminal NAV (no positive cash flows)

A fund with only CALL events but no DIST events and no terminal NAV is not
economically complete enough to produce a meaningful IRR.  Returning a
numeric in this case produces the -90% noise seen in Phase 4b analysis.
"""
from __future__ import annotations

import importlib
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID


def _fn():
    mod = importlib.import_module("app.services.re_fund_metrics")
    return mod._compute_fund_xirr


def _mock_cur(rows):
    cur = MagicMock()
    cur.fetchall.return_value = rows
    return cur


# No CALL events — no negative cash flows
def test_irr_returns_none_with_no_calls():
    xirr_fn = _fn()
    # fetchall returns empty list (no cash events)
    cur = _mock_cur([])
    result = xirr_fn(
        cur=cur,
        env_id="test-env",
        business_id=UUID("00000000-0000-0000-0000-000000000002"),
        fund_id=UUID("00000000-0000-0000-0000-000000000001"),
        quarter="2026Q2",
        terminal_nav=Decimal("0"),
    )
    assert result is None, (
        f"Expected None when there are no cash events, got {result!r}.  "
        "IRR must be None for an incomplete cash flow series (INV-3)."
    )


# Only CALL events — no positive cash flows, no terminal NAV
def test_irr_returns_none_with_only_calls_no_terminal():
    xirr_fn = _fn()
    # Two CALL events, no DIST, terminal_nav = 0
    rows = [
        {"event_date": "2024-03-01", "event_type": "CALL", "amount": "100000000.00"},
        {"event_date": "2024-06-01", "event_type": "CALL", "amount": "50000000.00"},
    ]
    cur = _mock_cur(rows)
    result = xirr_fn(
        cur=cur,
        env_id="test-env",
        business_id=UUID("00000000-0000-0000-0000-000000000002"),
        fund_id=UUID("00000000-0000-0000-0000-000000000001"),
        quarter="2026Q2",
        terminal_nav=Decimal("0"),
    )
    assert result is None, (
        f"Expected None when there is no positive cash flow (no DIST and terminal_nav=0), "
        f"got {result!r}.  IRR must be None for an incomplete series (INV-3)."
    )
