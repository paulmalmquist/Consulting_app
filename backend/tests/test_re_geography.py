"""Tests for geo overlay catalog, map context, and deal geo context."""

from contextlib import contextmanager
from unittest.mock import patch
from uuid import uuid4


def _patch_geo_cursor(fake_cursor):
    @contextmanager
    def _mock_get_cursor():
        yield fake_cursor

    return patch("app.services.re_geography.get_cursor", _mock_get_cursor)


class TestGeoOverlayCatalog:
    def test_overlay_catalog_service_uses_db_rows(self, fake_cursor):
        from app.services import re_geography

        fake_cursor.push_result([{
            "metric_key": "median_hh_income",
            "display_name": "Median Household Income",
            "description": "Income",
            "category": "demographics",
            "units": "USD",
            "geography_levels": ["county", "tract"],
            "compare_modes": ["tract", "county", "metro"],
            "color_scale": "green_sequential",
            "source_name": "ACS 5-Year",
            "source_url": "https://data.census.gov",
            "is_active": True,
        }])

        with _patch_geo_cursor(fake_cursor):
            rows = re_geography.list_overlay_catalog()

        assert rows[0]["metric_key"] == "median_hh_income"
        assert rows[0]["color_scale"] == "green_sequential"


class TestGeoMapContext:
    def test_map_context_service_attaches_metrics_and_nearby_deals(self, fake_cursor):
        from app.services import re_geography

        fake_cursor.push_result([{
            "geography_id": "12086000100",
            "geography_type": "tract",
            "name": "Census Tract 1",
            "state_fips": "12",
            "county_fips": "086",
            "cbsa_code": "33100",
            "centroid_lat": 25.77,
            "centroid_lon": -80.19,
            "area_sq_miles": 1.2,
            "geometry": {"type": "Polygon", "coordinates": []},
        }])
        fake_cursor.push_result([{
            "geography_id": "12086000100",
            "metric_key": "median_hh_income",
            "value": 88000,
            "units": "USD",
            "source_name": "ACS 5-Year",
            "dataset_vintage": "ACS 2023 5-Year",
        }])
        fake_cursor.push_result([{
            "geography_id": "12086000100",
            "deal_id": str(uuid4()),
            "deal_name": "Phoenix Commerce Center",
            "stage": "dd",
            "sector": "industrial",
            "strategy": "value_add",
            "fund_name": "Meridian Fund VI",
        }])

        with _patch_geo_cursor(fake_cursor):
            with patch("app.services.re_geography._overlay_catalog", return_value=[{
                "metric_key": "median_hh_income",
                "display_name": "Median Household Income",
                "description": "Income",
                "category": "demographics",
                "units": "USD",
                "geography_levels": ["county", "tract"],
                "compare_modes": ["tract", "county", "metro"],
                "color_scale": "green_sequential",
                "source_name": "ACS 5-Year",
                "source_url": "https://data.census.gov",
                "is_active": True,
            }]):
                result = re_geography.get_map_context(
                    env_id=str(uuid4()),
                    geography_level="tract",
                    overlay_key="median_hh_income",
                    sw_lat=24.0,
                    sw_lon=-81.0,
                    ne_lat=27.0,
                    ne_lon=-79.0,
                )

        assert result["overlay"]["metric_key"] == "median_hh_income"
        assert result["total_count"] == 1
        assert result["features"][0]["metric_value"] == 88000
        assert result["features"][0]["nearby_deals"][0]["deal_name"] == "Phoenix Commerce Center"


class TestDealGeoContext:
    def test_deal_geo_context_service_builds_profiles(self, fake_cursor):
        from app.services import re_geography

        deal_id = str(uuid4())
        fake_cursor.push_result([{
            "deal_id": deal_id,
            "deal_name": "Harbor Apartments",
            "status": "ic",
            "strategy": "value_add",
            "property_type": "multifamily",
            "headline_price": 42000000,
            "target_irr": 16.5,
            "target_moic": 2.0,
            "fund_name": "Meridian Fund VI",
            "property_id": str(uuid4()),
            "property_name": "Harbor Apartments",
            "city": "Miami",
            "state": "FL",
            "lat": 25.77,
            "lon": -80.19,
            "county_geoid": "12086",
            "tract_geoid": "12086000100",
            "block_group_geoid": "120860001001",
        }])
        fake_cursor.push_result([{"cbsa_code": "33100"}])
        fake_cursor.push_result([
            {
                "geography_id": "12086000100",
                "metric_key": "median_hh_income",
                "value": 95000,
                "units": "USD",
                "source_name": "ACS 5-Year",
                "dataset_vintage": "ACS 2023 5-Year",
            },
            {
                "geography_id": "12086000100",
                "metric_key": "renter_share",
                "value": 58,
                "units": "%",
                "source_name": "ACS 5-Year",
                "dataset_vintage": "ACS 2023 5-Year",
            },
        ])
        fake_cursor.push_result([
            {
                "geography_id": "12086",
                "metric_key": "median_hh_income",
                "value": 81000,
                "units": "USD",
                "source_name": "ACS 5-Year",
                "dataset_vintage": "ACS 2023 5-Year",
            },
        ])
        fake_cursor.push_result([
            {"geography_id": "12086"},
            {"geography_id": "12011"},
        ])
        fake_cursor.push_result([
            {
                "geography_id": "12086",
                "metric_key": "median_hh_income",
                "value": 81000,
                "units": "USD",
                "source_name": "ACS 5-Year",
                "dataset_vintage": "ACS 2023 5-Year",
            },
            {
                "geography_id": "12011",
                "metric_key": "median_hh_income",
                "value": 79000,
                "units": "USD",
                "source_name": "ACS 5-Year",
                "dataset_vintage": "ACS 2023 5-Year",
            },
        ])

        with _patch_geo_cursor(fake_cursor):
            with patch("app.services.re_geography._overlay_catalog", return_value=[
                {
                    "metric_key": "median_hh_income",
                    "display_name": "Median Household Income",
                    "description": "Income",
                    "category": "demographics",
                    "units": "USD",
                    "geography_levels": ["county", "tract"],
                    "compare_modes": ["tract", "county", "metro"],
                    "color_scale": "green_sequential",
                    "source_name": "ACS 5-Year",
                    "source_url": "https://data.census.gov",
                    "is_active": True,
                },
                {
                    "metric_key": "renter_share",
                    "display_name": "Renter Share",
                    "description": "Renter occupied share.",
                    "category": "housing",
                    "units": "%",
                    "geography_levels": ["county", "tract"],
                    "compare_modes": ["tract", "county", "metro"],
                    "color_scale": "orange_sequential",
                    "source_name": "ACS 5-Year",
                    "source_url": "https://data.census.gov",
                    "is_active": True,
                },
                {
                    "metric_key": "hazard_flood_risk",
                    "display_name": "Hazard / Flood Risk",
                    "description": "Flood proxy.",
                    "category": "hazard",
                    "units": "index",
                    "geography_levels": ["county", "tract"],
                    "compare_modes": ["tract", "county", "metro"],
                    "color_scale": "red_sequential",
                    "source_name": "FEMA",
                    "source_url": "https://www.fema.gov",
                    "is_active": True,
                },
                {
                    "metric_key": "labor_context",
                    "display_name": "Labor / Economic Context",
                    "description": "Labor context.",
                    "category": "economy",
                    "units": "index",
                    "geography_levels": ["county", "tract"],
                    "compare_modes": ["tract", "county", "metro"],
                    "color_scale": "blue_sequential",
                    "source_name": "BLS / BEA",
                    "source_url": "https://www.bls.gov",
                    "is_active": True,
                },
            ]):
                result = re_geography.get_deal_geo_context(deal_id=deal_id)

        assert result["deal"]["deal_name"] == "Harbor Apartments"
        assert result["tract_profile"]["median_hh_income"]["value"] == 95000
        assert result["county_profile"]["median_hh_income"]["value"] == 81000
        assert result["metro_benchmark"]["median_hh_income"]["value"] == 80000
        assert result["fit"]["sector_fit_score"] is not None


class TestGeoRoutes:
    def test_overlay_catalog_route(self, client, fake_cursor):
        fake_cursor.push_result([{
            "metric_key": "median_hh_income",
            "display_name": "Median Household Income",
            "description": "Income",
            "category": "demographics",
            "units": "USD",
            "geography_levels": ["county", "tract"],
            "compare_modes": ["tract", "county", "metro"],
            "color_scale": "green_sequential",
            "source_name": "ACS 5-Year",
            "source_url": "https://data.census.gov",
            "is_active": True,
        }])

        with _patch_geo_cursor(fake_cursor):
            resp = client.get("/api/re/v2/geography/overlay-catalog")

        assert resp.status_code == 200
        assert resp.json()[0]["metric_key"] == "median_hh_income"
