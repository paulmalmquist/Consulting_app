"""Tests for the Consulting Revenue OS – Engagements, Revenue, and Metrics Engine.

Tests:
- Create engagement
- Update engagement spend (auto-recompute margin)
- Complete engagement
- Create revenue entries (bulk)
- Update invoice status
- Revenue summary (MTD/QTD)
- Metrics snapshot computation (weighted pipeline, close rate, forecast formula)
- Get latest snapshot
- Forecast formula with zero-denominator handling
"""

import uuid
from datetime import datetime, date
from decimal import Decimal

import pytest

from tests.conftest import FakeCursor


ENV_ID = "test-consulting-env"
BUSINESS_ID = str(uuid.uuid4())
TENANT_ID = str(uuid.uuid4())
CLIENT_ID = str(uuid.uuid4())
ENGAGEMENT_ID = str(uuid.uuid4())
REVENUE_ENTRY_ID = str(uuid.uuid4())
SNAPSHOT_ID = str(uuid.uuid4())
NOW = datetime(2026, 2, 26, 12, 0, 0).isoformat()


class TestCreateEngagement:
    def test_creates_engagement(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/engagements should create an engagement."""
        fake_cursor.push_result([{
            "id": ENGAGEMENT_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "client_id": CLIENT_ID,
            "name": "AI Strategy Phase 1",
            "engagement_type": "strategy",
            "status": "active",
            "start_date": "2026-03-01",
            "end_date": "2026-06-30",
            "budget": Decimal("80000"),
            "actual_spend": Decimal("0"),
            "margin_pct": None,
            "notes": "Initial engagement",
            "created_at": NOW,
        }])

        response = client.post("/api/consulting/engagements", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "client_id": CLIENT_ID,
            "name": "AI Strategy Phase 1",
            "engagement_type": "strategy",
            "budget": "80000",
            "start_date": "2026-03-01",
            "end_date": "2026-06-30",
            "notes": "Initial engagement",
        })

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "AI Strategy Phase 1"
        assert data["engagement_type"] == "strategy"
        assert float(data["budget"]) == 80000


class TestUpdateSpend:
    def test_updates_spend_and_margin(self, client, fake_cursor: FakeCursor):
        """PATCH /api/consulting/engagements/{id}/spend should recompute margin."""
        # SELECT budget
        fake_cursor.push_result([{"budget": Decimal("80000")}])
        # UPDATE
        fake_cursor.push_result([{
            "id": ENGAGEMENT_ID,
            "budget": Decimal("80000"),
            "actual_spend": Decimal("48000"),
            "margin_pct": Decimal("0.4000"),
            "status": "active",
        }])

        response = client.patch(
            f"/api/consulting/engagements/{ENGAGEMENT_ID}/spend?actual_spend=48000"
        )
        assert response.status_code == 200
        data = response.json()
        # margin = (80000 - 48000) / 80000 = 0.40
        assert float(data["margin_pct"]) == 0.4


class TestCompleteEngagement:
    def test_completes(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/engagements/{id}/complete should set status."""
        fake_cursor.push_result([{
            "id": ENGAGEMENT_ID,
            "status": "completed",
            "end_date": "2026-06-30",
            "budget": Decimal("80000"),
            "actual_spend": Decimal("48000"),
            "margin_pct": Decimal("0.4000"),
        }])

        response = client.post(f"/api/consulting/engagements/{ENGAGEMENT_ID}/complete")
        assert response.status_code == 200
        assert response.json()["status"] == "completed"


class TestRevenueEntries:
    def test_create_bulk_entries(self, client, fake_cursor: FakeCursor):
        """POST /api/consulting/revenue/entries should bulk-create entries."""
        fake_cursor.push_result([{
            "id": REVENUE_ENTRY_ID,
            "engagement_id": ENGAGEMENT_ID,
            "client_id": CLIENT_ID,
            "period_date": "2026-03-01",
            "amount": Decimal("20000"),
            "currency": "USD",
            "invoice_status": "scheduled",
            "invoiced_at": None,
            "paid_at": None,
            "notes": "March billing",
            "created_at": NOW,
        }])

        response = client.post("/api/consulting/revenue/entries", json={
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "entries": [{
                "engagement_id": ENGAGEMENT_ID,
                "client_id": CLIENT_ID,
                "period_date": "2026-03-01",
                "amount": "20000",
                "notes": "March billing",
            }],
        })

        assert response.status_code == 201
        data = response.json()
        assert len(data) == 1
        assert data[0]["invoice_status"] == "scheduled"


class TestInvoiceStatus:
    def test_update_to_paid(self, client, fake_cursor: FakeCursor):
        """PATCH /api/consulting/revenue/entries/{id}/status should update status."""
        fake_cursor.push_result([{
            "id": REVENUE_ENTRY_ID,
            "invoice_status": "paid",
            "invoiced_at": NOW,
            "paid_at": NOW,
        }])

        response = client.patch(
            f"/api/consulting/revenue/entries/{REVENUE_ENTRY_ID}/status",
            json={"invoice_status": "paid"},
        )
        assert response.status_code == 200
        assert response.json()["invoice_status"] == "paid"


class TestRevenueSummary:
    def test_returns_summary(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/revenue/summary should return MTD/QTD/YTD."""
        fake_cursor.push_result([{
            "revenue_mtd": Decimal("45000"),
            "revenue_qtd": Decimal("120000"),
            "revenue_ytd": Decimal("350000"),
            "scheduled_next_30d": Decimal("60000"),
            "overdue": Decimal("15000"),
        }])

        response = client.get(
            f"/api/consulting/revenue/summary?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )
        assert response.status_code == 200
        data = response.json()
        assert float(data["revenue_mtd"]) == 45000
        assert float(data["revenue_qtd"]) == 120000
        assert float(data["overdue"]) == 15000


class TestForecastFormula:
    def test_forecast_with_close_rate(self):
        """Forecast = weighted_pipeline * close_rate + scheduled_revenue."""
        from app.services.cro_metrics_engine import compute_forecast_90d

        result = compute_forecast_90d(
            weighted_pipeline=Decimal("200000"),
            close_rate=Decimal("0.40"),
            scheduled_revenue=Decimal("50000"),
        )
        # 200000 * 0.40 + 50000 = 130000
        assert result == Decimal("130000.00")

    def test_forecast_with_no_close_rate(self):
        """When close_rate is None, use conservative 0.20."""
        from app.services.cro_metrics_engine import compute_forecast_90d

        result = compute_forecast_90d(
            weighted_pipeline=Decimal("200000"),
            close_rate=None,
            scheduled_revenue=Decimal("50000"),
        )
        # 200000 * 0.20 + 50000 = 90000
        assert result == Decimal("90000.00")

    def test_forecast_zero_pipeline(self):
        """Zero pipeline should only return scheduled revenue."""
        from app.services.cro_metrics_engine import compute_forecast_90d

        result = compute_forecast_90d(
            weighted_pipeline=Decimal("0"),
            close_rate=Decimal("0.50"),
            scheduled_revenue=Decimal("25000"),
        )
        assert result == Decimal("25000.00")


class TestMetricsSnapshot:
    def test_get_latest_snapshot(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/metrics/latest should return most recent snapshot."""
        fake_cursor.push_result([{
            "id": SNAPSHOT_ID,
            "env_id": ENV_ID,
            "business_id": BUSINESS_ID,
            "snapshot_date": "2026-02-26",
            "weighted_pipeline": Decimal("250000"),
            "unweighted_pipeline": Decimal("500000"),
            "open_opportunities": 12,
            "close_rate_90d": Decimal("0.3500"),
            "won_count_90d": 7,
            "lost_count_90d": 13,
            "outreach_count_30d": 45,
            "response_rate_30d": Decimal("0.2667"),
            "meetings_30d": 8,
            "revenue_mtd": Decimal("42000"),
            "revenue_qtd": Decimal("115000"),
            "forecast_90d": Decimal("137500"),
            "avg_deal_size": Decimal("75000"),
            "avg_margin_pct": Decimal("0.3800"),
            "active_engagements": 5,
            "active_clients": 3,
            "computed_at": NOW,
            "input_hash": "abc123def456",
            "created_at": NOW,
        }])

        response = client.get(
            f"/api/consulting/metrics/latest?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )
        assert response.status_code == 200
        data = response.json()
        assert float(data["weighted_pipeline"]) == 250000
        assert float(data["forecast_90d"]) == 137500
        assert data["active_engagements"] == 5

    def test_no_snapshot_returns_404(self, client, fake_cursor: FakeCursor):
        """GET /api/consulting/metrics/latest with no snapshots should 404."""
        fake_cursor.push_result([])

        response = client.get(
            f"/api/consulting/metrics/latest?env_id={ENV_ID}&business_id={BUSINESS_ID}"
        )
        assert response.status_code == 404
