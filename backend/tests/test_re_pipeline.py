"""Tests for Pipeline CRUD service + route layer."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


# ── Service-level tests ──────────────────────────────────────────────────────

class TestDealCrud:
    def test_list_deals_returns_results(self, fake_cursor):
        from app.services import re_pipeline

        env_id = str(uuid4())
        deal = {
            "deal_id": str(uuid4()),
            "env_id": env_id,
            "fund_id": None,
            "deal_name": "Test Deal",
            "status": "sourced",
            "source": "CBRE",
            "strategy": "value_add",
            "property_type": "multifamily",
            "target_close_date": None,
            "headline_price": 42000000,
            "target_irr": 18.5,
            "target_moic": 2.1,
            "notes": None,
            "created_by": "test",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
        }
        fake_cursor.push_result([deal])

        result = re_pipeline.list_deals(env_id=env_id)
        assert len(result) == 1
        assert result[0]["deal_name"] == "Test Deal"

    def test_list_deals_derives_summary_fields(self, fake_cursor):
        from app.services import re_pipeline

        env_id = str(uuid4())
        fake_cursor.push_result([{
            "deal_id": str(uuid4()),
            "env_id": env_id,
            "fund_id": str(uuid4()),
            "fund_name": "Meridian Growth Fund",
            "deal_name": "Desert Logistics Portfolio",
            "status": "closing",
            "source": "Brokered",
            "strategy": "value_add",
            "property_type": "industrial",
            "target_close_date": (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat(),
            "headline_price": 42000000,
            "target_irr": 17.5,
            "target_moic": 2.0,
            "notes": None,
            "created_by": "test",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
            "city": "Phoenix",
            "state": "AZ",
            "sponsor_name": "Canyon Sponsor",
            "broker_name": "Annie Case",
            "broker_org": "CBRE",
            "last_activity_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
            "activity_count": 4,
            "property_count": 2,
            "open_equity_required": None,
            "committed_debt": 30000000,
        }])

        result = re_pipeline.list_deals(env_id=env_id)

        assert result[0]["fund_name"] == "Meridian Growth Fund"
        assert result[0]["city"] == "Phoenix"
        assert result[0]["equity_required"] == 12000000
        assert result[0]["attention_flags"] == ["priority"]

    def test_list_deals_with_filters(self, fake_cursor):
        from app.services import re_pipeline

        env_id = str(uuid4())
        fake_cursor.push_result([])

        result = re_pipeline.list_deals(
            env_id=env_id, status="loi", strategy="core_plus",
        )
        assert result == []
        # Check the SQL included the filter conditions
        sql = fake_cursor.queries[0][0]
        assert "d.status = %s" in sql
        assert "d.strategy = %s" in sql
        assert "LEFT JOIN LATERAL" in sql

    def test_get_deal_not_found(self, fake_cursor):
        from app.services import re_pipeline

        fake_cursor.push_result([])

        with pytest.raises(LookupError, match="not found"):
            re_pipeline.get_deal(deal_id=uuid4())

    def test_create_deal(self, fake_cursor):
        from app.services import re_pipeline

        env_id = str(uuid4())
        deal_id = uuid4()
        fake_cursor.push_result([{
            "deal_id": str(deal_id),
            "env_id": env_id,
            "fund_id": None,
            "deal_name": "New Deal",
            "status": "sourced",
            "source": None,
            "strategy": "value_add",
            "property_type": None,
            "target_close_date": None,
            "headline_price": None,
            "target_irr": None,
            "target_moic": None,
            "notes": None,
            "created_by": None,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
        }])

        result = re_pipeline.create_deal(
            env_id=env_id,
            payload={"deal_name": "New Deal", "strategy": "value_add"},
        )
        assert result["deal_name"] == "New Deal"

    def test_update_deal(self, fake_cursor):
        from app.services import re_pipeline

        deal_id = uuid4()
        fake_cursor.push_result([{
            "deal_id": str(deal_id),
            "env_id": str(uuid4()),
            "fund_id": None,
            "deal_name": "Updated Deal",
            "status": "screening",
            "source": None,
            "strategy": "value_add",
            "property_type": None,
            "target_close_date": None,
            "headline_price": None,
            "target_irr": None,
            "target_moic": None,
            "notes": None,
            "created_by": None,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-02T00:00:00Z",
        }])

        result = re_pipeline.update_deal(
            deal_id=deal_id,
            payload={"deal_name": "Updated Deal", "status": "screening"},
        )
        assert result["status"] == "screening"


class TestPropertyCrud:
    def test_list_properties(self, fake_cursor):
        from app.services import re_pipeline

        deal_id = uuid4()
        fake_cursor.push_result([{
            "property_id": str(uuid4()),
            "deal_id": str(deal_id),
            "property_name": "Test Property",
            "address": "123 Main St",
            "city": "Denver",
            "state": "CO",
            "zip": "80202",
            "lat": 39.7392,
            "lon": -104.9903,
            "property_type": "multifamily",
            "units": 100,
            "sqft": 85000,
            "year_built": 2005,
            "occupancy": 0.94,
            "noi": 1500000,
            "asking_cap_rate": 0.065,
            "census_tract_geoid": None,
            "created_at": "2024-01-01T00:00:00Z",
        }])

        result = re_pipeline.list_properties(deal_id=deal_id)
        assert len(result) == 1
        assert result[0]["property_name"] == "Test Property"


class TestTrancheCrud:
    def test_list_tranches(self, fake_cursor):
        from app.services import re_pipeline

        deal_id = uuid4()
        fake_cursor.push_result([{
            "tranche_id": str(uuid4()),
            "deal_id": str(deal_id),
            "tranche_name": "Senior Debt",
            "tranche_type": "senior_debt",
            "close_date": "2024-06-30",
            "commitment_amount": 30000000,
            "price": None,
            "terms_json": "{}",
            "status": "open",
            "created_at": "2024-01-01T00:00:00Z",
        }])

        result = re_pipeline.list_tranches(deal_id=deal_id)
        assert len(result) == 1
        assert result[0]["tranche_type"] == "senior_debt"


class TestMapMarkers:
    def test_markers_basic(self, fake_cursor):
        from app.services import re_pipeline

        env_id = str(uuid4())
        fake_cursor.push_result([{
            "deal_id": str(uuid4()),
            "canonical_property_id": str(uuid4()),
            "deal_name": "Test Deal",
            "status": "sourced",
            "lat": 39.7392,
            "lon": -104.9903,
            "property_name": "Test Property",
            "property_type": "multifamily",
            "headline_price": 42000000,
        }])

        result = re_pipeline.get_map_markers(env_id=env_id)
        assert len(result) == 1
        assert result[0]["deal_name"] == "Test Deal"
        assert result[0]["canonical_property_id"] is not None

    def test_markers_with_bbox(self, fake_cursor):
        from app.services import re_pipeline

        env_id = str(uuid4())
        fake_cursor.push_result([])

        result = re_pipeline.get_map_markers(
            env_id=env_id,
            bbox=(39.0, -105.0, 40.0, -104.0),
        )
        assert result == []
        # SQL should have lat/lon BETWEEN clauses
        sql = fake_cursor.queries[0][0]
        assert "BETWEEN" in sql

    def test_markers_with_status_filter(self, fake_cursor):
        from app.services import re_pipeline

        env_id = str(uuid4())
        fake_cursor.push_result([])

        re_pipeline.get_map_markers(env_id=env_id, status="loi")
        sql = fake_cursor.queries[0][0]
        assert "d.status = %s" in sql


# ── Route-level tests ────────────────────────────────────────────────────────

class TestPipelineRoutes:
    def test_list_deals_route(self, client, fake_cursor):
        env_id = str(uuid4())
        fake_cursor.push_result([])

        resp = client.get(f"/api/re/v2/pipeline/deals?env_id={env_id}")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_deals_route_returns_summary_fields(self, client, fake_cursor):
        env_id = str(uuid4())
        fake_cursor.push_result([{
            "deal_id": str(uuid4()),
            "env_id": env_id,
            "fund_id": None,
            "fund_name": "Meridian Fund VI",
            "deal_name": "Phoenix Commerce Center",
            "status": "ic",
            "source": "JLL",
            "strategy": "core_plus",
            "property_type": "industrial",
            "target_close_date": "2026-03-20",
            "headline_price": 51000000,
            "target_irr": 15.0,
            "target_moic": 1.8,
            "notes": None,
            "created_by": "test",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
            "city": "Phoenix",
            "state": "AZ",
            "sponsor_name": "Canyon Sponsor",
            "broker_name": "Annie Case",
            "broker_org": "JLL",
            "last_activity_at": datetime.now(timezone.utc).isoformat(),
            "activity_count": 3,
            "property_count": 1,
            "open_equity_required": 18000000,
            "committed_debt": 30000000,
        }])

        resp = client.get(f"/api/re/v2/pipeline/deals?env_id={env_id}")

        assert resp.status_code == 200
        payload = resp.json()
        assert payload[0]["fund_name"] == "Meridian Fund VI"
        assert payload[0]["broker_name"] == "Annie Case"
        assert payload[0]["equity_required"] == "18000000"
        assert "priority" in payload[0]["attention_flags"]

    def test_create_deal_route(self, client, fake_cursor):
        env_id = str(uuid4())
        deal_id = uuid4()
        fake_cursor.push_result([{
            "deal_id": str(deal_id),
            "env_id": env_id,
            "fund_id": None,
            "deal_name": "Route Deal",
            "status": "sourced",
            "source": None,
            "strategy": None,
            "property_type": None,
            "target_close_date": None,
            "headline_price": None,
            "target_irr": None,
            "target_moic": None,
            "notes": None,
            "created_by": None,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
        }])

        resp = client.post(
            f"/api/re/v2/pipeline/deals?env_id={env_id}",
            json={"deal_name": "Route Deal"},
        )
        assert resp.status_code == 201
        assert resp.json()["deal_name"] == "Route Deal"

    def test_get_deal_route_404(self, client, fake_cursor):
        deal_id = uuid4()
        fake_cursor.push_result([])

        resp = client.get(f"/api/re/v2/pipeline/deals/{deal_id}")
        assert resp.status_code == 404

    def test_map_markers_route(self, client, fake_cursor):
        env_id = str(uuid4())
        fake_cursor.push_result([])

        resp = client.get(f"/api/re/v2/pipeline/map/markers?env_id={env_id}")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_census_layers_route(self, client, fake_cursor):
        fake_cursor.push_result([{
            "layer_id": str(uuid4()),
            "layer_name": "median_income",
            "census_variable": "B19013_001E",
            "label": "Median Income",
            "color_scale": "YlOrRd",
            "unit": "$",
            "description": "Median household income",
            "is_active": True,
        }])

        resp = client.get("/api/re/v2/pipeline/census/layers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["layer_name"] == "median_income"

    def test_create_deal_validation(self, client, fake_cursor):
        env_id = str(uuid4())
        # Missing required field
        resp = client.post(
            f"/api/re/v2/pipeline/deals?env_id={env_id}",
            json={},
        )
        assert resp.status_code == 422
