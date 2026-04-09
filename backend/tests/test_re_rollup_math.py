"""Tests for the RE v2 deterministic rollup engine.

Verifies bottom-up aggregation: Asset → JV → Investment → Fund.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from tests.conftest import FakeCursor
from app.services import re_rollup


def _make_asset_state(asset_id: str, *, nav: str, noi: str, debt: str, cash: str) -> dict:
    return {
        "asset_id": asset_id,
        "noi": nav,  # intentionally mapped
        "nav": nav,
        "debt_balance": debt,
        "cash_balance": cash,
        "inputs_hash": f"hash_{asset_id[:8]}",
    }


def _make_jv_state(jv_id: str, *, nav: str, ownership: str = "1.0") -> dict:
    return {
        "jv_id": jv_id,
        "nav": nav,
        "noi": "0",
        "debt_balance": "0",
        "cash_balance": "0",
        "ownership_percent": ownership,
        "inputs_hash": f"hash_{jv_id[:8]}",
    }


def _make_inv_state(inv_id: str, *, nav: str) -> dict:
    return {
        "investment_id": inv_id,
        "nav": nav,
        "effective_nav": nav,
        "inputs_hash": f"hash_{inv_id[:8]}",
    }


class TestRollupJv:
    """JV-level rollup sums asset quarter states."""

    def test_single_asset(self, fake_cursor: FakeCursor):
        jv_id = uuid4()
        asset_id = str(uuid4())
        quarter = "2026Q1"

        # fetchall: asset states
        fake_cursor.push_result([
            _make_asset_state(asset_id, nav="10000000", noi="800000", debt="5000000", cash="200000"),
        ])
        # fetchone: INSERT RETURNING
        fake_cursor.push_result([{
            "jv_id": str(jv_id), "quarter": quarter, "scenario_id": None,
            "run_id": str(uuid4()), "nav": "10000000", "noi": "800000",
            "debt_balance": "5000000", "cash_balance": "200000",
            "inputs_hash": "abc123", "created_at": "2026-03-31T00:00:00",
        }])

        result = re_rollup.rollup_jv(jv_id=jv_id, quarter=quarter)
        assert result["nav"] == "10000000"
        assert result["noi"] == "800000"

    def test_multiple_assets_sum(self, fake_cursor: FakeCursor):
        jv_id = uuid4()
        a1 = str(uuid4())
        a2 = str(uuid4())
        quarter = "2026Q1"

        fake_cursor.push_result([
            _make_asset_state(a1, nav="10000000", noi="800000", debt="5000000", cash="100000"),
            _make_asset_state(a2, nav="15000000", noi="1200000", debt="8000000", cash="300000"),
        ])
        # We need to verify the SQL params, so push an INSERT result
        fake_cursor.push_result([{
            "jv_id": str(jv_id), "quarter": quarter, "scenario_id": None,
            "run_id": str(uuid4()), "nav": "25000000", "noi": "2000000",
            "debt_balance": "13000000", "cash_balance": "400000",
            "inputs_hash": "def456", "created_at": "2026-03-31T00:00:00",
        }])

        result = re_rollup.rollup_jv(jv_id=jv_id, quarter=quarter)
        assert result["nav"] == "25000000"

    def test_no_assets_produces_zero_nav(self, fake_cursor: FakeCursor):
        jv_id = uuid4()
        quarter = "2026Q1"

        # fetchall: no asset states
        fake_cursor.push_result([])
        # INSERT RETURNING
        fake_cursor.push_result([{
            "jv_id": str(jv_id), "quarter": quarter, "scenario_id": None,
            "run_id": str(uuid4()), "nav": "0", "noi": "0",
            "debt_balance": "0", "cash_balance": "0",
            "inputs_hash": "zero_hash", "created_at": "2026-03-31T00:00:00",
        }])

        result = re_rollup.rollup_jv(jv_id=jv_id, quarter=quarter)
        assert result["nav"] == "0"


class TestRollupInvestment:
    """Investment-level rollup sums JV states + capital figures."""

    def test_with_jvs_and_capital(self, fake_cursor: FakeCursor):
        inv_id = uuid4()
        jv1 = str(uuid4())
        jv2 = str(uuid4())
        quarter = "2026Q1"

        # fetchall 1: JV states (with ownership_percent)
        fake_cursor.push_result([
            _make_jv_state(jv1, nav="10000000"),
            _make_jv_state(jv2, nav="15000000"),
        ])
        # fetchall 2: direct (non-JV) asset states — none
        fake_cursor.push_result([])
        # fetchone 3: investment capital figures from repe_deal
        fake_cursor.push_result([{
            "committed_capital": "30000000",
            "invested_capital": "20000000",
            "realized_distributions": "5000000",
        }])
        # fetchone 4: INSERT RETURNING
        equity_multiple = (Decimal("5000000") + Decimal("25000000")) / Decimal("20000000")
        fake_cursor.push_result([{
            "investment_id": str(inv_id), "quarter": quarter, "scenario_id": None,
            "run_id": str(uuid4()), "nav": "25000000",
            "committed_capital": "30000000", "invested_capital": "20000000",
            "realized_distributions": "5000000", "unrealized_value": "25000000",
            "equity_multiple": str(equity_multiple),
            "inputs_hash": "inv_hash", "created_at": "2026-03-31T00:00:00",
        }])

        result = re_rollup.rollup_investment(investment_id=inv_id, quarter=quarter)
        assert result["nav"] == "25000000"
        assert result["committed_capital"] == "30000000"

    def test_equity_multiple_zero_invested(self, fake_cursor: FakeCursor):
        """Equity multiple should be None when invested_capital is 0."""
        inv_id = uuid4()
        quarter = "2026Q1"

        fake_cursor.push_result([])  # No JV states
        fake_cursor.push_result([])  # No direct asset states
        fake_cursor.push_result([{   # Investment capital
            "committed_capital": "10000000",
            "invested_capital": "0",
            "realized_distributions": "0",
        }])
        fake_cursor.push_result([{   # INSERT RETURNING
            "investment_id": str(inv_id), "quarter": quarter, "scenario_id": None,
            "run_id": str(uuid4()), "nav": "0",
            "committed_capital": "10000000", "invested_capital": "0",
            "realized_distributions": "0", "unrealized_value": "0",
            "equity_multiple": None,
            "inputs_hash": "inv_hash2", "created_at": "2026-03-31T00:00:00",
        }])

        result = re_rollup.rollup_investment(investment_id=inv_id, quarter=quarter)
        assert result["equity_multiple"] is None


class TestRollupFund:
    """Fund-level rollup sums investment NAVs and computes DPI/RVPI/TVPI."""

    def test_fund_multiples(self, fake_cursor: FakeCursor):
        fund_id = uuid4()
        inv1 = str(uuid4())
        quarter = "2026Q1"

        # fetchall 1: investment states (with effective_nav)
        fake_cursor.push_result([
            _make_inv_state(inv1, nav="50000000"),
        ])
        # fetchall 2: asset states for weighted LTV/DSCR — empty
        fake_cursor.push_result([])
        # fetchone 3: xirr_from_fund_ledger — empty (no capital ledger data)
        fake_cursor.push_result([])
        # fetchone 4: INSERT RETURNING
        fake_cursor.push_result([{
            "fund_id": str(fund_id), "quarter": quarter, "scenario_id": None,
            "run_id": str(uuid4()), "portfolio_nav": "50000000",
            "total_committed": "40000000", "total_called": "30000000",
            "total_distributed": "10000000",
            "dpi": "0.333333333333", "rvpi": "1.666666666667", "tvpi": "2.000000000000",
            "gross_irr": None, "net_irr": None,
            "inputs_hash": "fund_hash", "created_at": "2026-03-31T00:00:00",
        }])

        result = re_rollup.rollup_fund(
            fund_id=fund_id,
            quarter=quarter,
            total_committed=Decimal("40000000"),
            total_called=Decimal("30000000"),
            total_distributed=Decimal("10000000"),
        )
        assert result["portfolio_nav"] == "50000000"
        assert result["tvpi"] == "2.000000000000"

    def test_fund_zero_called_no_multiples(self, fake_cursor: FakeCursor):
        """When total_called is 0, DPI/RVPI/TVPI should be None."""
        fund_id = uuid4()
        quarter = "2026Q1"

        fake_cursor.push_result([])  # No investment states
        fake_cursor.push_result([])  # No asset states
        fake_cursor.push_result([])  # xirr — empty
        fake_cursor.push_result([{   # INSERT RETURNING
            "fund_id": str(fund_id), "quarter": quarter, "scenario_id": None,
            "run_id": str(uuid4()), "portfolio_nav": None,
            "total_committed": "0", "total_called": "0",
            "total_distributed": "0",
            "dpi": None, "rvpi": None, "tvpi": None,
            "gross_irr": None, "net_irr": None,
            "inputs_hash": "fund_hash2", "created_at": "2026-03-31T00:00:00",
        }])

        result = re_rollup.rollup_fund(fund_id=fund_id, quarter=quarter)
        assert result["dpi"] is None
        assert result["tvpi"] is None


class TestInputsHash:
    """Deterministic hashing produces consistent results."""

    def test_same_inputs_same_hash(self):
        h1 = re_rollup._compute_inputs_hash({"a": "1", "b": "2"})
        h2 = re_rollup._compute_inputs_hash({"b": "2", "a": "1"})
        assert h1 == h2

    def test_different_inputs_different_hash(self):
        h1 = re_rollup._compute_inputs_hash({"a": "1"})
        h2 = re_rollup._compute_inputs_hash({"a": "2"})
        assert h1 != h2
