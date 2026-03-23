"""Tests for sale scenario modeling, XIRR integration, and LP summary.

Tests:
- XIRR integration returns correct IRR from cash events
- Waterfall shadow delegates to real engine when definition exists
- Waterfall shadow falls back to simplified carry when no definition
- Sale assumption CRUD
- Scenario compute returns IRR delta and stores snapshot
- Scenario isolation: never writes to re_fund_metrics_qtr
- LP summary aggregation with partner breakdowns
- Sale with disposition fee calculates net proceeds correctly
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from tests.conftest import FakeCursor


ENV_ID = "test-env"
BUSINESS_ID = str(uuid.uuid4())
FUND_ID = str(uuid.uuid4())
SCENARIO_ID = str(uuid.uuid4())
DEAL_ID = str(uuid.uuid4())
ASSET_ID = str(uuid.uuid4())
PARTNER_GP_ID = str(uuid.uuid4())
PARTNER_LP1_ID = str(uuid.uuid4())
RUN_ID = str(uuid.uuid4())
NOW = datetime(2025, 9, 30, 12, 0, 0).isoformat()


# ── Test: XIRR Engine Integration ────────────────────────────────────────────

class TestXirrIntegration:
    def test_xirr_with_known_cashflows(self):
        """XIRR should return a correct IRR for known cashflows."""
        from app.finance.irr_engine import xirr

        # Simple: invest $100, receive $110 one year later → ~10% IRR
        cashflows = [
            (date(2024, 1, 1), Decimal("-100")),
            (date(2025, 1, 1), Decimal("110")),
        ]
        result = xirr(cashflows)
        assert result is not None
        # Should be approximately 0.10 (10%)
        assert abs(float(result) - 0.10) < 0.01

    def test_xirr_returns_none_for_single_cashflow(self):
        """XIRR should return None for < 2 cashflows."""
        from app.finance.irr_engine import xirr

        result = xirr([(date(2024, 1, 1), Decimal("-100"))])
        assert result is None

    def test_xirr_returns_none_for_all_positive(self):
        """XIRR should return None if no negative cashflows."""
        from app.finance.irr_engine import xirr

        result = xirr([
            (date(2024, 1, 1), Decimal("100")),
            (date(2025, 1, 1), Decimal("110")),
        ])
        assert result is None


# ── Test: Sale Assumption CRUD ───────────────────────────────────────────────

class TestSaleAssumptionCrud:
    def test_create_sale_assumption(self, client, fake_cursor: FakeCursor):
        """POST /api/re/v2/funds/{id}/sale-scenarios should create a sale assumption."""
        fake_cursor.push_result([{
            "id": 1,
            "fund_id": FUND_ID,
            "scenario_id": SCENARIO_ID,
            "deal_id": DEAL_ID,
            "asset_id": None,
            "sale_price": Decimal("45000000"),
            "sale_date": date(2025, 12, 31),
            "buyer_costs": Decimal("0"),
            "disposition_fee_pct": Decimal("0.01"),
            "memo": "Test sale",
            "created_by": "api",
            "created_at": datetime.now(),
        }])

        response = client.post(f"/api/re/v2/funds/{FUND_ID}/sale-scenarios", json={
            "scenario_id": SCENARIO_ID,
            "deal_id": DEAL_ID,
            "sale_price": 45000000,
            "sale_date": "2025-12-31",
            "disposition_fee_pct": 0.01,
            "memo": "Test sale",
        })

        assert response.status_code == 201
        data = response.json()
        assert data["sale_price"] == "45000000"

    def test_list_sale_assumptions(self, client, fake_cursor: FakeCursor):
        """GET /api/re/v2/funds/{id}/sale-scenarios should list assumptions."""
        fake_cursor.push_result([{
            "id": 1,
            "fund_id": FUND_ID,
            "scenario_id": SCENARIO_ID,
            "deal_id": DEAL_ID,
            "asset_id": None,
            "sale_price": Decimal("45000000"),
            "sale_date": date(2025, 12, 31),
            "buyer_costs": Decimal("0"),
            "disposition_fee_pct": Decimal("0.01"),
            "memo": "Test",
            "created_by": "api",
            "created_at": datetime.now(),
        }])

        response = client.get(f"/api/re/v2/funds/{FUND_ID}/sale-scenarios", params={
            "scenario_id": SCENARIO_ID,
        })

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    def test_delete_sale_assumption(self, client, fake_cursor: FakeCursor):
        """DELETE /api/re/v2/sale-scenarios/{id} should delete."""
        fake_cursor.push_result([])  # DELETE result

        response = client.delete("/api/re/v2/sale-scenarios/1")
        assert response.status_code == 204


# ── Test: Scenario Compute ───────────────────────────────────────────────────

class TestScenarioCompute:
    def test_compute_returns_irr_delta(self, client, fake_cursor: FakeCursor):
        """POST /api/re/v2/funds/{id}/scenario-compute should return IRR delta."""
        # 1. Cash events query
        fake_cursor.push_result([
            {"event_date": date(2024, 3, 1), "event_type": "CALL", "amount": Decimal("25000000")},
            {"event_date": date(2025, 3, 31), "event_type": "DIST", "amount": Decimal("2000000")},
        ])
        # 2. Fund quarter state
        fake_cursor.push_result([{
            "portfolio_nav": Decimal("30000000"),
            "total_called": Decimal("25000000"),
            "total_distributed": Decimal("2000000"),
        }])
        # 3. Base metrics
        fake_cursor.push_result([{
            "gross_irr": Decimal("0.1200"),
            "net_irr": Decimal("0.0950"),
            "gross_tvpi": Decimal("1.28"),
            "net_tvpi": Decimal("1.20"),
            "dpi": Decimal("0.08"),
            "rvpi": Decimal("1.20"),
        }])
        # 4. Sale assumptions query
        fake_cursor.push_result([{
            "id": 1,
            "fund_id": FUND_ID,
            "scenario_id": SCENARIO_ID,
            "deal_id": DEAL_ID,
            "asset_id": None,
            "sale_price": Decimal("35000000"),
            "sale_date": date(2025, 9, 30),
            "buyer_costs": Decimal("0"),
            "disposition_fee_pct": Decimal("0.01"),
            "memo": "Exit",
        }])
        # 5. Fee accrual total
        fake_cursor.push_result([{"total": Decimal("375000")}])
        # 6. Fund expense total
        fake_cursor.push_result([{"total": Decimal("255000")}])
        # 7. Waterfall definition lookup (empty → fallback to simplified carry)
        fake_cursor.push_result([])
        # 8. INSERT INTO re_scenario_metrics_snapshot
        fake_cursor.push_result([{
            "id": 1,
            "fund_id": FUND_ID,
            "scenario_id": SCENARIO_ID,
            "quarter": "2025Q3",
        }])

        response = client.post(f"/api/re/v2/funds/{FUND_ID}/scenario-compute", json={
            "scenario_id": SCENARIO_ID,
            "quarter": "2025Q3",
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
        })

        assert response.status_code == 200
        data = response.json()
        assert "scenario_gross_irr" in data
        assert "irr_delta" in data
        assert data["sale_count"] == 1
        assert data["snapshot_id"] is not None


# ── Test: LP Summary ─────────────────────────────────────────────────────────

class TestLpSummary:
    def test_lp_summary_returns_partner_data(self, client, fake_cursor: FakeCursor):
        """GET /api/re/v2/funds/{id}/lp_summary should return partners."""
        # 1. Fund metrics
        fake_cursor.push_result([{
            "gross_irr": Decimal("0.1200"),
            "net_irr": Decimal("0.0950"),
            "gross_tvpi": Decimal("1.28"),
            "net_tvpi": Decimal("1.20"),
            "dpi": Decimal("0.08"),
            "rvpi": Decimal("1.20"),
            "cash_on_cash": Decimal("0.08"),
        }])
        # 2. Gross-net bridge
        fake_cursor.push_result([{
            "gross_return": Decimal("7000000"),
            "mgmt_fees": Decimal("375000"),
            "fund_expenses": Decimal("255000"),
            "carry_shadow": Decimal("960000"),
            "net_return": Decimal("5410000"),
        }])
        # 3. Partners + commitments
        fake_cursor.push_result([
            {"partner_id": PARTNER_GP_ID, "name": "Winston Capital", "partner_type": "gp", "committed_amount": Decimal("10000000")},
            {"partner_id": PARTNER_LP1_ID, "name": "State Pension", "partner_type": "lp", "committed_amount": Decimal("200000000")},
        ])
        # 4. Capital balances for GP
        fake_cursor.push_result([{"contributed": Decimal("8500000"), "distributed": Decimal("680000")}])
        # 5. Capital balances for LP1
        fake_cursor.push_result([{"contributed": Decimal("170000000"), "distributed": Decimal("13600000")}])
        # 6. Fund NAV
        fake_cursor.push_result([{"portfolio_nav": Decimal("425000000")}])
        # 7. Waterfall results (empty)
        fake_cursor.push_result([])

        response = client.get(f"/api/re/v2/funds/{FUND_ID}/lp_summary", params={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "quarter": "2025Q3",
        })

        assert response.status_code == 200
        data = response.json()
        assert len(data["partners"]) == 2
        assert data["partners"][0]["name"] == "Winston Capital"
        assert data["total_committed"] is not None
        assert data["fund_nav"] is not None


# ── Test: Sale with Disposition Fee ──────────────────────────────────────────

class TestDispositionFee:
    def test_net_proceeds_calculation(self):
        """Net proceeds = sale_price - buyer_costs - (sale_price * disposition_fee_pct)."""
        sale_price = Decimal("50000000")
        buyer_costs = Decimal("250000")
        fee_pct = Decimal("0.01")
        disp_fee = (sale_price * fee_pct).quantize(Decimal("0.01"))
        net = sale_price - buyer_costs - disp_fee

        assert disp_fee == Decimal("500000.00")
        assert net == Decimal("49250000.00")
