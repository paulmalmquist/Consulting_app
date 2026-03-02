"""Tests for Census caching service."""

from unittest.mock import patch, MagicMock
from uuid import uuid4



class TestReverseGeocode:
    def test_fcc_geocode_success(self, fake_cursor):
        from app.services import re_census

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "Block": {"FIPS": "08031004902001"},
        }
        mock_resp.raise_for_status = MagicMock()

        with patch("app.services.re_census.httpx.get", return_value=mock_resp):
            result = re_census._reverse_geocode_fcc(lat=39.7392, lon=-104.9903)

        assert result is not None
        assert result["state_fips"] == "08"
        assert result["county_fips"] == "031"
        assert result["tract_fips"] == "004902"

    def test_fcc_geocode_short_fips(self, fake_cursor):
        from app.services import re_census

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"Block": {"FIPS": "1234"}}
        mock_resp.raise_for_status = MagicMock()

        with patch("app.services.re_census.httpx.get", return_value=mock_resp):
            result = re_census._reverse_geocode_fcc(lat=39.7, lon=-104.9)

        assert result is None

    def test_fcc_geocode_error(self, fake_cursor):
        from app.services import re_census

        with patch("app.services.re_census.httpx.get", side_effect=Exception("timeout")):
            result = re_census._reverse_geocode_fcc(lat=39.7, lon=-104.9)

        assert result is None


class TestFetchCensusAcs:
    def test_acs_fetch_success(self, fake_cursor):
        from app.services import re_census

        mock_resp = MagicMock()
        mock_resp.json.return_value = [
            ["NAME", "B19013_001E", "B01003_001E", "B25064_001E", "B25077_001E", "B25002_003E", "B17001_002E", "state", "county", "tract"],
            ["Tract 49.02", "75000", "5432", "1200", "350000", "120", "450", "08", "031", "004902"],
        ]
        mock_resp.raise_for_status = MagicMock()

        with patch("app.services.re_census.httpx.get", return_value=mock_resp):
            result = re_census._fetch_census_acs(
                state_fips="08", county_fips="031", tract_fips="004902",
            )

        assert result["median_income"] == 75000
        assert result["population"] == 5432
        assert result["median_rent"] == 1200
        assert result["median_home_value"] == 350000

    def test_acs_fetch_empty(self, fake_cursor):
        from app.services import re_census

        mock_resp = MagicMock()
        mock_resp.json.return_value = [["NAME"]]
        mock_resp.raise_for_status = MagicMock()

        with patch("app.services.re_census.httpx.get", return_value=mock_resp):
            result = re_census._fetch_census_acs(
                state_fips="08", county_fips="031", tract_fips="999999",
            )

        assert result == {}

    def test_acs_fetch_error(self, fake_cursor):
        from app.services import re_census

        with patch("app.services.re_census.httpx.get", side_effect=Exception("API down")):
            result = re_census._fetch_census_acs(
                state_fips="08", county_fips="031", tract_fips="004902",
            )

        assert result == {}


class TestEnsureTractCached:
    def test_cache_hit(self, fake_cursor):
        from app.services import re_census

        cached = {
            "tract_geoid": "08031004902",
            "geometry_geojson": None,
            "centroid_lat": 39.7,
            "centroid_lon": -104.9,
            "metrics_json": '{"median_income": 75000}',
            "source_year": 2023,
        }
        fake_cursor.push_result([cached])

        result = re_census._ensure_tract_cached(
            tract_geoid="08031004902",
            state_fips="08",
            county_fips="031",
            tract_fips="004902",
        )
        assert result == cached

    def test_cache_miss_fetches(self, fake_cursor):
        from app.services import re_census

        # Cache miss
        fake_cursor.push_result([])
        # INSERT RETURNING
        fake_cursor.push_result([{
            "tract_geoid": "08031004902",
            "geometry_geojson": None,
            "centroid_lat": None,
            "centroid_lon": None,
            "metrics_json": '{"median_income": 75000}',
            "source_year": 2023,
        }])

        mock_resp = MagicMock()
        mock_resp.json.return_value = [
            ["NAME", "B19013_001E", "B01003_001E", "B25064_001E", "B25077_001E", "B25002_003E", "B17001_002E", "state", "county", "tract"],
            ["Tract 49.02", "75000", "5432", "1200", "350000", "120", "450", "08", "031", "004902"],
        ]
        mock_resp.raise_for_status = MagicMock()

        with patch("app.services.re_census.httpx.get", return_value=mock_resp):
            result = re_census._ensure_tract_cached(
                tract_geoid="08031004902",
                state_fips="08",
                county_fips="031",
                tract_fips="004902",
            )

        assert result is not None
        assert result["tract_geoid"] == "08031004902"


class TestListLayers:
    def test_list_layers(self, fake_cursor):
        from app.services import re_census

        fake_cursor.push_result([
            {
                "layer_id": str(uuid4()),
                "layer_name": "median_income",
                "census_variable": "B19013_001E",
                "label": "Median Income",
                "color_scale": "YlOrRd",
                "unit": "$",
                "description": "Median household income",
                "is_active": True,
            },
        ])

        result = re_census.list_layers()
        assert len(result) == 1
        assert result[0]["layer_name"] == "median_income"


class TestGetTractsByBbox:
    def test_bbox_query(self, fake_cursor):
        from app.services import re_census

        fake_cursor.push_result([])

        result = re_census.get_tracts_by_bbox(
            bbox=(39.0, -105.0, 40.0, -104.0),
        )
        assert result == []
        sql = fake_cursor.queries[0][0]
        assert "BETWEEN" in sql
