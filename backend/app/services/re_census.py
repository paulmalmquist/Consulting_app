"""Census tract caching layer: reverse geocode + ACS data fetch + server-side cache."""

from __future__ import annotations

import httpx

from app.db import get_cursor
from app.observability.logger import emit_log

# Census API (free, key optional but recommended for rate limits)
_CENSUS_ACS_BASE = "https://api.census.gov/data"
_FCC_GEO_BASE = "https://geo.fcc.gov/api/census/block/find"


# ── Public API ───────────────────────────────────────────────────────────────

def get_tract_by_latlon(*, lat: float, lon: float, year: int = 2023) -> dict | None:
    """Reverse geocode lat/lon to Census tract, fetch ACS data, cache result."""
    fips = _reverse_geocode_fcc(lat=lat, lon=lon)
    if not fips:
        return None
    geoid = f"{fips['state_fips']}{fips['county_fips']}{fips['tract_fips']}"
    return _ensure_tract_cached(
        tract_geoid=geoid,
        state_fips=fips["state_fips"],
        county_fips=fips["county_fips"],
        tract_fips=fips["tract_fips"],
        year=year,
    )


def get_tracts_by_bbox(
    *,
    bbox: tuple[float, float, float, float],
    layer: str | None = None,
) -> list[dict]:
    """Return cached census tracts within bounding box."""
    sw_lat, sw_lon, ne_lat, ne_lon = bbox
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT tract_geoid, geometry_geojson, centroid_lat, centroid_lon,
                   metrics_json, source_year
            FROM re_census_tract_cache
            WHERE centroid_lat BETWEEN %s AND %s
              AND centroid_lon BETWEEN %s AND %s
            LIMIT 500
            """,
            (sw_lat, ne_lat, sw_lon, ne_lon),
        )
        return cur.fetchall()


def list_layers() -> list[dict]:
    """Return all active census layer definitions."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT layer_id, layer_name, census_variable, label, color_scale, "
            "unit, description, is_active FROM re_census_layer_def WHERE is_active = true "
            "ORDER BY label"
        )
        return cur.fetchall()


# ── Internal ─────────────────────────────────────────────────────────────────

def _reverse_geocode_fcc(*, lat: float, lon: float) -> dict | None:
    """Use FCC API to get FIPS codes from lat/lon."""
    try:
        resp = httpx.get(
            _FCC_GEO_BASE,
            params={"latitude": lat, "longitude": lon, "format": "json"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        block = data.get("Block", {})
        fips = block.get("FIPS", "")
        if len(fips) < 11:
            return None
        return {
            "state_fips": fips[:2],
            "county_fips": fips[2:5],
            "tract_fips": fips[5:11],
        }
    except Exception as exc:
        emit_log(level="warn", service="backend", action="census.fcc_geocode_error",
                 message=str(exc))
        return None


def _fetch_census_acs(
    *,
    state_fips: str,
    county_fips: str,
    tract_fips: str,
    year: int = 2023,
) -> dict:
    """Fetch ACS 5-year data for a tract. Returns metrics dict."""
    variables = "B19013_001E,B01003_001E,B25064_001E,B25077_001E,B25002_003E,B17001_002E"
    url = f"{_CENSUS_ACS_BASE}/{year}/acs/acs5"
    try:
        resp = httpx.get(
            url,
            params={
                "get": f"NAME,{variables}",
                "for": f"tract:{tract_fips}",
                "in": f"state:{state_fips}+county:{county_fips}",
            },
            timeout=15,
        )
        resp.raise_for_status()
        rows = resp.json()
        if len(rows) < 2:
            return {}
        headers = rows[0]
        values = rows[1]
        metrics = {}
        var_map = {
            "B19013_001E": "median_income",
            "B01003_001E": "population",
            "B25064_001E": "median_rent",
            "B25077_001E": "median_home_value",
            "B25002_003E": "vacant_units",
            "B17001_002E": "poverty_population",
        }
        for i, h in enumerate(headers):
            if h in var_map:
                try:
                    metrics[var_map[h]] = int(values[i]) if values[i] else None
                except (ValueError, TypeError):
                    metrics[var_map[h]] = None
        return metrics
    except Exception as exc:
        emit_log(level="warn", service="backend", action="census.acs_fetch_error",
                 message=str(exc))
        return {}


def _ensure_tract_cached(
    *,
    tract_geoid: str,
    state_fips: str,
    county_fips: str,
    tract_fips: str,
    year: int = 2023,
) -> dict:
    """Check cache; if missing or expired, fetch and store."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM re_census_tract_cache WHERE tract_geoid = %s AND ttl_expires_at > now()",
            (tract_geoid,),
        )
        cached = cur.fetchone()
        if cached:
            return cached

    # Fetch from Census API
    metrics = _fetch_census_acs(
        state_fips=state_fips, county_fips=county_fips, tract_fips=tract_fips, year=year,
    )

    import json
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_census_tract_cache
                (tract_geoid, state_fips, county_fips, tract_fips, metrics_json, source_year,
                 fetched_at, ttl_expires_at)
            VALUES (%s, %s, %s, %s, %s, %s, now(), now() + interval '90 days')
            ON CONFLICT (tract_geoid) DO UPDATE
            SET metrics_json = EXCLUDED.metrics_json, fetched_at = now(),
                ttl_expires_at = now() + interval '90 days'
            RETURNING tract_geoid, geometry_geojson, centroid_lat, centroid_lon,
                      metrics_json, source_year
            """,
            (tract_geoid, state_fips, county_fips, tract_fips, json.dumps(metrics), year),
        )
        return cur.fetchone()
