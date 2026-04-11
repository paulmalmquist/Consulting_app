"""INV-4 regression test: rollup_investment must apply ownership exactly once.

Tests two scenarios:
  1. One JV-held investment ($100M raw NAV, 50% fund LP share → $50M effective)
  2. One direct-held investment ($100M raw NAV, 50% entity-link → $50M effective)

Pre-Patch-A, the direct-held path contributed $100M (unweighted — Defect A).
Post-Patch-A, both contribute exactly $50M.

These tests use mock cursors (no DB required) so they run in CI without fixtures.
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import UUID

_FUND_ID = UUID("11111111-0000-0000-0000-000000000001")
_INVESTMENT_A = UUID("22222222-0000-0000-0000-000000000001")  # JV-held
_INVESTMENT_B = UUID("33333333-0000-0000-0000-000000000001")  # direct-held


def _make_cursor(jv_rows, direct_rows, inv_row=None):
    """Return a mock cursor that yields the given rows in query order.

    rollup_investment executes exactly 4 queries in sequence:
      1. JV states   → fetchall()
      2. Direct assets → fetchall()
      3. Investment capital → fetchone()
      4. INSERT/RETURNING → fetchone()
    """
    cur = MagicMock()
    cur.fetchall.side_effect = [jv_rows, direct_rows]
    if inv_row is None:
        inv_row = {
            "committed_capital": "200000000",
            "invested_capital": "200000000",
            "realized_distributions": "0",
        }
    cur.fetchone.side_effect = [
        inv_row,
        {"investment_id": str(_INVESTMENT_A), "nav": "50000000"},
    ]
    return cur


def _make_ctx(cur):
    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=cur)
    ctx.__exit__ = MagicMock(return_value=False)
    return ctx


# ── Helper: extract agg_nav from the INSERT params ────────────────────────────

def _inserted_nav(cur) -> Decimal:
    """Return the nav value passed to the INSERT INTO re_investment_quarter_state."""
    # The INSERT is the 4th execute call (index 3).
    # Params tuple layout (see rollup_investment source):
    #   (investment_id, quarter, scenario_id, run_id, agg_nav, committed, ...)
    insert_call = cur.execute.call_args_list[3]
    params = insert_call[0][1]  # positional args: (sql, params)
    return Decimal(str(params[4]))  # index 4 = _q(agg_nav)


# ── Test 1: JV-held investment with 50% LP share ──────────────────────────────

def test_jv_ownership_applied():
    """JV path must multiply NAV by lp_percent (now COALESCE(lp_percent, ownership_percent)).

    Fixture: one JV with raw nav=$100M, lp_percent=0.50 (as returned by the query).
    Expected: fund sees $50M.
    Pre-Patch-A: the query returned ownership_percent=1.0, so fund saw $100M.
    """
    jv_rows = [
        {
            "jv_id": "aaaaaaaa-0000-0000-0000-000000000001",
            "nav": "100000000",
            "noi": None,
            "debt_balance": "0",
            "cash_balance": "0",
            "inputs_hash": "jv_hash_001",
            "ownership_percent": "0.5",  # COALESCE(lp_percent=0.5, ownership_percent=1.0)
        }
    ]
    cur = _make_cursor(jv_rows=jv_rows, direct_rows=[])
    ctx = _make_ctx(cur)

    with patch("app.services.re_rollup.get_cursor", return_value=ctx):
        from app.services import re_rollup
        re_rollup.rollup_investment(investment_id=_INVESTMENT_A, quarter="2026Q2")

    nav = _inserted_nav(cur)
    assert abs(nav - Decimal("50000000")) <= Decimal("1"), (
        f"JV path: expected $50M (50% of $100M), got {nav}.  "
        "INV-4 violation: lp_percent not applied to JV-held asset."
    )


# ── Test 2: Direct-held investment with 50% entity-link ownership ─────────────

def test_direct_ownership_applied():
    """Direct path must multiply NAV by repe_asset_entity_link.percent.

    Fixture: one direct asset with raw nav=$100M, ownership_percent=0.50 (from entity-link).
    Expected: fund sees $50M.
    Pre-Patch-A: no ownership applied, so fund saw $100M (Defect A).
    """
    direct_rows = [
        {
            "asset_id": "bbbbbbbb-0000-0000-0000-000000000001",
            "nav": "100000000",
            "asset_value": "100000000",
            "noi": None,
            "revenue": None,
            "opex": None,
            "debt_service": None,
            "occupancy": None,
            "debt_balance": "0",
            "cash_balance": "0",
            "inputs_hash": "asset_hash_001",
            "ownership_percent": "0.5",  # from repe_asset_entity_link.percent
        }
    ]
    cur = _make_cursor(jv_rows=[], direct_rows=direct_rows)
    ctx = _make_ctx(cur)

    with patch("app.services.re_rollup.get_cursor", return_value=ctx):
        from app.services import re_rollup
        re_rollup.rollup_investment(investment_id=_INVESTMENT_B, quarter="2026Q2")

    nav = _inserted_nav(cur)
    assert abs(nav - Decimal("50000000")) <= Decimal("1"), (
        f"Direct path: expected $50M (50% of $100M), got {nav}.  "
        "INV-4 violation: ownership not applied to direct-held asset (Defect A)."
    )


# ── Test 3: JV + direct symmetry — both contribute equally ───────────────────

def test_jv_and_direct_weighted_equally():
    """Mixed investment: JV asset and direct asset both at 50% ownership.

    Total fund NAV should be $100M ($50M + $50M), not $150M ($50M + $100M).
    This is the key Defect A regression: the two paths were asymmetric.
    """
    jv_rows = [
        {
            "jv_id": "aaaaaaaa-0000-0000-0000-000000000002",
            "nav": "100000000",
            "noi": None,
            "debt_balance": "0",
            "cash_balance": "0",
            "inputs_hash": "jv_hash_002",
            "ownership_percent": "0.5",
        }
    ]
    direct_rows = [
        {
            "asset_id": "bbbbbbbb-0000-0000-0000-000000000002",
            "nav": "100000000",
            "asset_value": "100000000",
            "noi": None,
            "revenue": None,
            "opex": None,
            "debt_service": None,
            "occupancy": None,
            "debt_balance": "0",
            "cash_balance": "0",
            "inputs_hash": "asset_hash_002",
            "ownership_percent": "0.5",
        }
    ]
    cur = _make_cursor(jv_rows=jv_rows, direct_rows=direct_rows)
    ctx = _make_ctx(cur)

    with patch("app.services.re_rollup.get_cursor", return_value=ctx):
        from app.services import re_rollup
        re_rollup.rollup_investment(investment_id=_INVESTMENT_A, quarter="2026Q2")

    nav = _inserted_nav(cur)
    assert abs(nav - Decimal("100000000")) <= Decimal("1"), (
        f"Symmetry: expected $100M ($50M JV + $50M direct), got {nav}.  "
        "Pre-Patch-A this would have been $150M (Defect A)."
    )


# ── Test 4: Direct asset defaults to 100% ownership when no entity-link ───────

def test_direct_defaults_to_full_ownership():
    """When repe_asset_entity_link has no owner row, ownership_percent = 1.0 (default).

    A fund that fully owns a direct asset should see 100% of the NAV.
    """
    direct_rows = [
        {
            "asset_id": "cccccccc-0000-0000-0000-000000000001",
            "nav": "75000000",
            "asset_value": "75000000",
            "noi": None,
            "revenue": None,
            "opex": None,
            "debt_service": None,
            "occupancy": None,
            "debt_balance": "0",
            "cash_balance": "0",
            "inputs_hash": "asset_hash_003",
            "ownership_percent": "1.0",  # COALESCE(NULL, 1.0) = 1.0
        }
    ]
    cur = _make_cursor(jv_rows=[], direct_rows=direct_rows)
    ctx = _make_ctx(cur)

    with patch("app.services.re_rollup.get_cursor", return_value=ctx):
        from app.services import re_rollup
        re_rollup.rollup_investment(investment_id=_INVESTMENT_B, quarter="2026Q2")

    nav = _inserted_nav(cur)
    assert abs(nav - Decimal("75000000")) <= Decimal("1"), (
        f"Full-ownership direct: expected $75M, got {nav}."
    )
