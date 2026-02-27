"""Tests for waterfall scenario calculation endpoint and service."""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest

# IDs
FUND_ID = str(uuid4())
SCENARIO_ID = str(uuid4())
BUSINESS_ID = str(uuid4())
ENV_ID = "env-test"
QUARTER = "2025Q1"
DEFN_ID = str(uuid4())
PARTNER_GP = str(uuid4())
PARTNER_LP1 = str(uuid4())
PARTNER_LP2 = str(uuid4())
RUN_ID = str(uuid4())


class TestValidateIngredients:
    """Test ingredient validation logic."""

    def test_missing_fund_returns_not_ready(self, client, fake_cursor):
        """When fund doesn't exist, validation returns not ready."""
        fake_cursor.push_result([])  # fund lookup returns nothing

        resp = client.get(
            f"/api/re/v2/funds/{FUND_ID}/waterfall-scenarios/validate",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "scenario_id": SCENARIO_ID,
                "quarter": QUARTER,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ready"] is False
        assert any(m["category"] == "FUND_STRUCTURE" for m in data["missing"])

    def test_all_present_returns_ready(self, client, fake_cursor):
        """When all ingredients exist, validation returns ready."""
        # 1. Fund exists
        fake_cursor.push_result([{"fund_id": FUND_ID, "strategy_type": "equity"}])
        # 2. Waterfall definition
        fake_cursor.push_result([{"definition_id": DEFN_ID}])
        # 3. Partner commitments count
        fake_cursor.push_result([{"cnt": 4}])
        # 4. Capital ledger count
        fake_cursor.push_result([{"cnt": 12}])
        # 5. Fund quarter state
        fake_cursor.push_result([{"fund_id": FUND_ID}])
        # 6. Cash events count
        fake_cursor.push_result([{"cnt": 8}])
        # 7. Scenario exists
        fake_cursor.push_result([{"id": SCENARIO_ID}])
        # 8. Investments count
        fake_cursor.push_result([{"cnt": 12}])

        resp = client.get(
            f"/api/re/v2/funds/{FUND_ID}/waterfall-scenarios/validate",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "scenario_id": SCENARIO_ID,
                "quarter": QUARTER,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ready"] is True
        assert data["missing"] == []


class TestWaterfallScenarioRun:
    """Test the waterfall scenario run endpoint."""

    def test_missing_ingredients_returns_structured_error(self, client, fake_cursor):
        """If ingredients are missing, returns status=failed with missing list."""
        # Fund exists
        fake_cursor.push_result([{"fund_id": FUND_ID, "strategy_type": "equity"}])
        # No waterfall definition
        fake_cursor.push_result([])
        # Partners exist
        fake_cursor.push_result([{"cnt": 4}])
        # No capital ledger
        fake_cursor.push_result([{"cnt": 0}])
        # No fund state
        fake_cursor.push_result([])
        # Cash events
        fake_cursor.push_result([{"cnt": 5}])
        # Scenario exists
        fake_cursor.push_result([{"id": SCENARIO_ID}])
        # Investments
        fake_cursor.push_result([{"cnt": 12}])

        resp = client.post(
            f"/api/re/v2/funds/{FUND_ID}/waterfall-scenarios/run",
            json={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "scenario_id": SCENARIO_ID,
                "as_of_quarter": QUARTER,
                "mode": "shadow",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "failed"
        assert data["error"] == "missing_ingredients"
        categories = [m["category"] for m in data["missing"]]
        assert "WATERFALL_DEFINITION" in categories
        assert "CAPITAL_LEDGER" in categories
        assert "FUND_STATE" in categories

    def test_successful_scenario_run(self, client, fake_cursor):
        """Full successful waterfall scenario run with all ingredients."""
        # ── Validation phase (8 queries) ──
        fake_cursor.push_result([{"fund_id": FUND_ID, "strategy_type": "equity"}])
        fake_cursor.push_result([{"definition_id": DEFN_ID}])
        fake_cursor.push_result([{"cnt": 3}])
        fake_cursor.push_result([{"cnt": 10}])
        fake_cursor.push_result([{"fund_id": FUND_ID}])
        fake_cursor.push_result([{"cnt": 6}])
        fake_cursor.push_result([{"id": SCENARIO_ID}])
        fake_cursor.push_result([{"cnt": 12}])

        # ── Run phase ──
        # Create run record
        fake_cursor.push_result([{"id": RUN_ID, "run_type": "WATERFALL_SCENARIO", "status": "running"}])
        # Load scenario overrides
        fake_cursor.push_result([
            {"key": "exit_cap_rate_delta_bps", "value": "75"},
            {"key": "noi_stress_pct", "value": "5"},
        ])
        # Load base fund state
        fake_cursor.push_result([{
            "portfolio_nav": "425000000",
            "total_committed": "500000000",
            "total_called": "350000000",
            "total_distributed": "50000000",
        }])
        # Load cash events
        fake_cursor.push_result([
            {"event_date": "2022-03-15", "event_type": "CALL", "amount": "200000000"},
            {"event_date": "2023-06-15", "event_type": "CALL", "amount": "150000000"},
            {"event_date": "2024-09-30", "event_type": "DIST", "amount": "50000000"},
        ])
        # Fees total
        fake_cursor.push_result([{"total": "7500000"}])
        # Expenses total
        fake_cursor.push_result([{"total": "1200000"}])
        # Waterfall definition
        fake_cursor.push_result([{
            "definition_id": DEFN_ID,
            "fund_id": FUND_ID,
            "version": 1,
            "waterfall_type": "european",
            "is_active": True,
        }])
        # Waterfall tiers
        fake_cursor.push_result([
            {"tier_order": 1, "tier_type": "return_of_capital", "hurdle_rate": None, "split_gp": None, "split_lp": None, "catch_up_percent": None},
            {"tier_order": 2, "tier_type": "preferred_return", "hurdle_rate": "0.08", "split_gp": None, "split_lp": None, "catch_up_percent": None},
            {"tier_order": 3, "tier_type": "catch_up", "hurdle_rate": None, "split_gp": None, "split_lp": None, "catch_up_percent": "1.0"},
            {"tier_order": 4, "tier_type": "split", "hurdle_rate": None, "split_gp": "0.20", "split_lp": "0.80", "catch_up_percent": None},
        ])
        # Partners with commitments
        fake_cursor.push_result([
            {"partner_id": PARTNER_GP, "name": "Meridian GP", "partner_type": "gp", "committed_amount": "25000000"},
            {"partner_id": PARTNER_LP1, "name": "CalPERS LP", "partner_type": "lp", "committed_amount": "250000000"},
            {"partner_id": PARTNER_LP2, "name": "Ontario Teachers LP", "partner_type": "lp", "committed_amount": "225000000"},
        ])
        # Capital ledger per partner (3 partners × 1 query each)
        for _ in range(3):
            fake_cursor.push_result([{"contributed": "100000000", "distributed": "15000000"}])
        # Insert waterfall run
        fake_cursor.push_result([{"run_id": str(uuid4()), "status": "success"}])
        # Insert waterfall run results (variable number — engine output)
        # For the test, the real engine will be called and produce lines
        # We need results for each INSERT RETURNING
        for _ in range(20):  # Buffer for allocation line inserts
            fake_cursor.push_result([{
                "id": str(uuid4()), "run_id": str(uuid4()),
                "partner_id": PARTNER_LP1, "tier_code": "tier_1",
                "payout_type": "return_of_capital", "amount": "1000000",
            }])

        # Base metrics
        fake_cursor.push_result([{
            "gross_irr": "0.1245",
            "net_irr": "0.0987",
            "gross_tvpi": "1.3571",
            "net_tvpi": "1.2143",
            "dpi": "0.1429",
            "rvpi": "1.2143",
        }])
        # Insert scenario snapshot
        fake_cursor.push_result([{"id": 1}])
        # Update run status
        fake_cursor.push_result([])

        resp = client.post(
            f"/api/re/v2/funds/{FUND_ID}/waterfall-scenarios/run",
            json={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "scenario_id": SCENARIO_ID,
                "as_of_quarter": QUARTER,
                "mode": "shadow",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["fund_id"] == FUND_ID
        assert data["scenario_id"] == SCENARIO_ID
        assert data["quarter"] == QUARTER
        assert data["mode"] == "shadow"
        assert data["run_id"] is not None
        # Overrides should reflect what we seeded
        assert data["overrides"]["cap_rate_delta_bps"] == "75"
        assert data["overrides"]["noi_stress_pct"] == "5"
        # Base and scenario metrics should be present
        assert data["base"] is not None
        assert data["scenario"] is not None
        assert data["deltas"] is not None
        # Carry should be computed
        assert data["carry_estimate"] is not None


class TestListScenarioRuns:
    """Test listing waterfall scenario runs."""

    def test_list_returns_runs(self, client, fake_cursor):
        fake_cursor.push_result([
            {
                "id": RUN_ID,
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
                "fund_id": FUND_ID,
                "quarter": QUARTER,
                "scenario_id": SCENARIO_ID,
                "run_type": "WATERFALL_SCENARIO",
                "status": "success",
                "input_hash": None,
                "output_hash": "abc123",
                "created_at": "2025-01-15T10:00:00",
                "created_by": "api",
                "scenario_name": "Downside CapRate +75bps",
            },
        ])

        resp = client.get(
            f"/api/re/v2/funds/{FUND_ID}/waterfall-scenarios/runs",
            params={
                "env_id": ENV_ID,
                "business_id": BUSINESS_ID,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["run_type"] == "WATERFALL_SCENARIO"
        assert data[0]["scenario_name"] == "Downside CapRate +75bps"
