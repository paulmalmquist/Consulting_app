"""Tests for UW vs Actual service + route layer."""

import json
from uuid import uuid4

import pytest


# ── Service-level tests ──────────────────────────────────────────────────────

class TestLinkUnderwriting:
    def test_link_requires_locked_model(self, fake_cursor):
        from app.services import re_uw_vs_actual

        model_id = uuid4()
        inv_id = uuid4()
        # Model lookup returns unlocked scenario model
        fake_cursor.push_result([{
            "model_id": str(model_id),
            "model_type": "scenario",
            "status": "draft",
            "locked_at": None,
        }])

        with pytest.raises(ValueError, match="must be locked"):
            re_uw_vs_actual.link_underwriting(
                investment_id=inv_id, model_id=model_id,
            )

    def test_link_requires_underwriting_io_type(self, fake_cursor):
        from app.services import re_uw_vs_actual

        model_id = uuid4()
        inv_id = uuid4()
        # Model is locked but type is forecast
        fake_cursor.push_result([{
            "model_id": str(model_id),
            "model_type": "forecast",
            "status": "approved",
            "locked_at": "2024-01-01T00:00:00Z",
        }])

        with pytest.raises(ValueError, match="underwriting_io"):
            re_uw_vs_actual.link_underwriting(
                investment_id=inv_id, model_id=model_id,
            )

    def test_link_succeeds_when_valid(self, fake_cursor):
        from app.services import re_uw_vs_actual

        model_id = uuid4()
        inv_id = uuid4()
        link_id = uuid4()
        # Model check: locked + underwriting_io
        fake_cursor.push_result([{
            "model_id": str(model_id),
            "model_type": "underwriting_io",
            "status": "approved",
            "locked_at": "2024-01-01T00:00:00Z",
        }])
        # UPSERT returning result
        fake_cursor.push_result([{
            "id": str(link_id),
            "investment_id": str(inv_id),
            "model_id": str(model_id),
            "linked_at": "2024-01-01T00:00:00Z",
            "linked_by": None,
        }])

        result = re_uw_vs_actual.link_underwriting(
            investment_id=inv_id, model_id=model_id,
        )
        assert result["investment_id"] == str(inv_id)


class TestLinkForecast:
    def test_link_forecast_requires_correct_type(self, fake_cursor):
        from app.services import re_uw_vs_actual

        model_id = uuid4()
        inv_id = uuid4()
        fake_cursor.push_result([{
            "model_id": str(model_id),
            "model_type": "underwriting_io",
            "status": "approved",
            "locked_at": "2024-01-01T00:00:00Z",
        }])

        with pytest.raises(ValueError, match="forecast"):
            re_uw_vs_actual.link_forecast(
                investment_id=inv_id, model_id=model_id,
            )


class TestComputePortfolioScorecard:
    def test_scorecard_with_no_investments(self, fake_cursor):
        from app.services import re_uw_vs_actual

        fund_id = uuid4()
        # List investments returns empty
        fake_cursor.push_result([])

        result = re_uw_vs_actual.compute_portfolio_scorecard(
            fund_id=fund_id, quarter="2024Q4", baseline="IO", level="investment",
        )
        assert result["rows"] == []
        assert result["fund_id"] == str(fund_id)
        assert result["quarter"] == "2024Q4"

    def test_scorecard_computes_deltas(self, fake_cursor):
        from app.services import re_uw_vs_actual

        fund_id = uuid4()
        inv_id = uuid4()
        # investments query returns repe_deal rows with deal_id and name
        fake_cursor.push_result([{
            "deal_id": str(inv_id),
            "name": "Test Investment",
        }])
        # UW link → model results (baseline metrics) — uses gross_irr key
        fake_cursor.push_result([{
            "metrics_json": json.dumps({"gross_irr": 0.18, "equity_multiple": 2.0, "nav": 50000000}),
            "model_name": "UW IO - Test",
            "model_id": str(uuid4()),
            "computed_at": "2024-01-01T00:00:00Z",
        }])
        # Actual metrics from re_investment_quarter_state
        fake_cursor.push_result([{
            "gross_irr": 0.15,
            "equity_multiple": 1.85,
            "nav": 48000000,
        }])

        result = re_uw_vs_actual.compute_portfolio_scorecard(
            fund_id=fund_id, quarter="2024Q4", baseline="IO", level="investment",
        )
        assert len(result["rows"]) == 1
        row = result["rows"][0]
        assert row["investment_name"] == "Test Investment"
        assert float(row["uw_irr"]) == 0.18
        assert float(row["actual_irr"]) == 0.15
        # Delta should be negative (actual < UW)
        assert row["delta_irr"] < 0


class TestComputeBridgeFast:
    def test_bridge_returns_drivers(self, fake_cursor):
        from app.services import re_uw_vs_actual

        inv_id = uuid4()
        # UW baseline metrics
        fake_cursor.push_result([{
            "metrics_json": json.dumps({
                "gross_irr": 0.18, "equity_multiple": 2.0, "nav": 50000000,
                "noi": 3500000, "occupancy": 0.95, "capex": 400000,
                "exit_cap_rate": 0.055, "debt_rate": 0.045,
            }),
            "model_name": "UW IO - Test",
            "model_id": str(uuid4()),
            "computed_at": "2024-01-01T00:00:00Z",
        }])
        # Actual metrics
        fake_cursor.push_result([{
            "gross_irr": 0.15,
            "equity_multiple": 1.85,
            "nav": 48000000,
        }])
        # Asset driver data
        fake_cursor.push_result([{
            "actual_noi": 3200000,
            "actual_occupancy": 0.92,
            "actual_capex": 450000,
            "actual_cap_rate": 0.058,
            "actual_debt_rate": 0.05,
        }])

        result = re_uw_vs_actual.compute_bridge_fast(
            level="investment", entity_id=inv_id, quarter="2024Q4", baseline="IO",
        )
        assert "drivers" in result
        assert result["entity_id"] == str(inv_id)
        assert result["quarter"] == "2024Q4"
        # Should have 6 drivers (NOI, Occupancy, Capex, Exit Cap Rate, Debt Terms, Residual)
        assert len(result["drivers"]) == 6
        driver_names = [d["driver"] for d in result["drivers"]]
        assert "NOI" in driver_names
        assert "Residual" in driver_names


class TestStoreModelResults:
    def test_store_model_results_upserts(self, fake_cursor):
        from app.services import re_uw_vs_actual

        model_id = uuid4()
        inv_id = uuid4()
        run_id = uuid4()
        metrics = {"irr": 0.18, "equity_multiple": 2.0}

        # UPSERT returns row
        fake_cursor.push_result([{
            "id": str(uuid4()),
            "model_id": str(model_id),
            "investment_id": str(inv_id),
            "metrics_json": json.dumps(metrics),
            "computed_at": "2024-01-01T00:00:00Z",
        }])

        result = re_uw_vs_actual.store_model_results(
            model_id=model_id, investment_id=inv_id, metrics=metrics, run_id=run_id,
        )
        assert result is not None


# ── Route-level tests ────────────────────────────────────────────────────────

class TestUwRoutes:
    def test_lock_model_route_404(self, client, fake_cursor):
        model_id = uuid4()
        # Model not found
        fake_cursor.push_result([])

        resp = client.post(f"/api/re/v2/models/{model_id}/lock")
        assert resp.status_code in (404, 500)

    def test_uw_link_create_route(self, client, fake_cursor):
        inv_id = uuid4()
        model_id = uuid4()
        link_id = uuid4()

        # Model validation: locked + underwriting_io
        fake_cursor.push_result([{
            "model_id": str(model_id),
            "model_type": "underwriting_io",
            "status": "approved",
            "locked_at": "2024-01-01T00:00:00Z",
        }])
        # UPSERT link
        fake_cursor.push_result([{
            "id": str(link_id),
            "investment_id": str(inv_id),
            "model_id": str(model_id),
            "linked_at": "2024-01-01T00:00:00Z",
            "linked_by": None,
        }])

        resp = client.post(
            f"/api/re/v2/investments/{inv_id}/underwriting-link",
            json={"model_id": str(model_id)},
        )
        assert resp.status_code == 201

    def test_uw_link_get_404(self, client, fake_cursor):
        inv_id = uuid4()
        fake_cursor.push_result([])

        resp = client.get(f"/api/re/v2/investments/{inv_id}/underwriting-link")
        assert resp.status_code == 404

    def test_scorecard_route(self, client, fake_cursor):
        fund_id = uuid4()
        # No investments
        fake_cursor.push_result([])

        resp = client.get(
            "/api/re/v2/reports/uw-vs-actual",
            params={"fundId": str(fund_id), "asof": "2024Q4", "baseline": "IO", "level": "investment"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rows"] == []
