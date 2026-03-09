"""Service layer for geography, market overlays, and pipeline geo context."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from app.db import get_cursor

logger = logging.getLogger(__name__)


_OVERLAY_CATALOG_FALLBACK = [
    {
        "metric_key": "market_cap_rate",
        "display_name": "Market Cap Rate",
        "description": "Observed market cap rate benchmark.",
        "category": "market",
        "units": "%",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "orange_sequential",
        "source_name": "Market Intelligence",
        "source_url": None,
        "is_active": True,
    },
    {
        "metric_key": "population_growth_pct",
        "display_name": "Population Growth",
        "description": "Population growth benchmark.",
        "category": "demographics",
        "units": "%",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "green_sequential",
        "source_name": "ACS / Census",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "employment_growth_pct",
        "display_name": "Employment Growth",
        "description": "Employment growth benchmark.",
        "category": "economy",
        "units": "%",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "green_sequential",
        "source_name": "BLS / BEA",
        "source_url": "https://www.bls.gov",
        "is_active": True,
    },
    {
        "metric_key": "median_hh_income",
        "display_name": "Median Household Income",
        "description": "ACS household income benchmark.",
        "category": "demographics",
        "units": "USD",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "green_sequential",
        "source_name": "ACS 5-Year",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "median_age",
        "display_name": "Median Age",
        "description": "Median age of residents.",
        "category": "demographics",
        "units": "years",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "purple_sequential",
        "source_name": "ACS 5-Year",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "population",
        "display_name": "Population",
        "description": "Total population.",
        "category": "demographics",
        "units": "people",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "blue_sequential",
        "source_name": "ACS 5-Year",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "renter_share",
        "display_name": "Renter Share",
        "description": "Renter occupied share of occupied units.",
        "category": "housing",
        "units": "%",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "orange_sequential",
        "source_name": "ACS 5-Year",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "vacancy_rate",
        "display_name": "Vacancy",
        "description": "Vacant housing share.",
        "category": "housing",
        "units": "%",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "red_sequential",
        "source_name": "ACS 5-Year",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "median_gross_rent",
        "display_name": "Median Gross Rent",
        "description": "Median gross rent proxy.",
        "category": "housing",
        "units": "USD",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "orange_sequential",
        "source_name": "ACS 5-Year",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "median_home_value",
        "display_name": "Median Home Value",
        "description": "Median owner home value proxy.",
        "category": "housing",
        "units": "USD",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "blue_sequential",
        "source_name": "ACS 5-Year",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "mobility_proxy",
        "display_name": "Mobility / Migration Proxy",
        "description": "Recent mover share proxy.",
        "category": "mobility",
        "units": "%",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "purple_sequential",
        "source_name": "ACS 5-Year",
        "source_url": "https://data.census.gov",
        "is_active": True,
    },
    {
        "metric_key": "hazard_flood_risk",
        "display_name": "Hazard / Flood Risk",
        "description": "Flood exposure or hazard proxy.",
        "category": "hazard",
        "units": "index",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "red_sequential",
        "source_name": "FEMA",
        "source_url": "https://www.fema.gov",
        "is_active": True,
    },
    {
        "metric_key": "labor_context",
        "display_name": "Labor / Economic Context",
        "description": "Employment and wage context composite.",
        "category": "economy",
        "units": "index",
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "blue_sequential",
        "source_name": "BLS / BEA",
        "source_url": "https://www.bls.gov",
        "is_active": True,
    },
]

_PROFILE_METRICS = [
    "market_cap_rate",
    "population_growth_pct",
    "employment_growth_pct",
    "median_hh_income",
    "median_age",
    "population",
    "renter_share",
    "vacancy_rate",
    "median_gross_rent",
    "median_home_value",
    "mobility_proxy",
    "labor_context",
]

_HAZARD_METRICS = ["hazard_flood_risk"]


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _overlay_catalog() -> list[dict]:
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT metric_key, display_name, description, category, units,
                       geography_levels, compare_modes, color_scale,
                       source_name, source_url, is_active
                FROM dim_geo_metric_catalog
                WHERE is_active = true
                ORDER BY display_name
                """
            )
            rows = cur.fetchall()
        if rows:
            normalized: list[dict] = []
            for row in rows:
                normalized.append({
                    "metric_key": row["metric_key"],
                    "display_name": row["display_name"],
                    "description": row.get("description"),
                    "category": row.get("category") or "market",
                    "units": row.get("units"),
                    "geography_levels": list(row.get("geography_levels") or []),
                    "compare_modes": list(row.get("compare_modes") or []),
                    "color_scale": row.get("color_scale") or "blue_sequential",
                    "source_name": row.get("source_name") or "Unknown",
                    "source_url": row.get("source_url"),
                    "is_active": bool(row.get("is_active", True)),
                })
            return normalized
    except Exception:
        pass
    return list(_OVERLAY_CATALOG_FALLBACK)


def _overlay_definition(metric_key: str) -> dict:
    for item in _overlay_catalog():
        if item["metric_key"] == metric_key:
            return item
    return {
        "metric_key": metric_key,
        "display_name": metric_key.replace("_", " ").title(),
        "description": None,
        "category": "market",
        "units": None,
        "geography_levels": ["county", "tract", "block_group"],
        "compare_modes": ["tract", "county", "metro"],
        "color_scale": "blue_sequential",
        "source_name": "Market Data",
        "source_url": None,
        "is_active": True,
    }


def _compute_bins(values: list[float]) -> list[dict[str, float | str]]:
    if not values:
        return []
    ordered = sorted(values)
    if len(ordered) == 1:
        value = round(ordered[0], 4)
        return [{"min": value, "max": value, "label": str(value)}]

    boundaries: list[float] = []
    for idx in range(6):
        pos = round((len(ordered) - 1) * (idx / 5))
        boundaries.append(float(ordered[pos]))

    bins: list[dict[str, float | str]] = []
    for idx in range(len(boundaries) - 1):
        left = round(boundaries[idx], 4)
        right = round(boundaries[idx + 1], 4)
        bins.append({
            "min": left,
            "max": right,
            "label": f"{left:g} - {right:g}",
        })
    return bins


def _latest_metric_map(
    *,
    geography_ids: list[str],
    metric_keys: list[str],
) -> dict[tuple[str, str], dict]:
    if not geography_ids or not metric_keys:
        return {}
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (geography_id, metric_key)
                geography_id,
                metric_key,
                value::float AS value,
                units,
                source_name,
                dataset_vintage
            FROM fact_market_metric
            WHERE geography_id = ANY(%s)
              AND metric_key = ANY(%s)
            ORDER BY geography_id, metric_key, period_start DESC
            """,
            (geography_ids, metric_keys),
        )
        rows = cur.fetchall()
    return {
        (row["geography_id"], row["metric_key"]): row
        for row in rows
    }


def _resolve_pipeline_property_geographies(property_row: dict) -> dict[str, str | None]:
    resolved = {
        "county": property_row.get("county_geoid"),
        "tract": property_row.get("tract_geoid"),
        "block_group": property_row.get("block_group_geoid"),
    }
    property_id = property_row.get("property_id")
    if property_id and not all(resolved.values()):
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT geography_type, geography_id
                FROM property_geography_link
                WHERE property_id = %s::uuid
                """,
                (property_id,),
            )
            for row in cur.fetchall():
                geography_type = row["geography_type"]
                geography_id = row["geography_id"]
                if geography_type in resolved and not resolved[geography_type]:
                    resolved[geography_type] = geography_id

    if property_row.get("lat") is not None and property_row.get("lon") is not None and not all(resolved.values()):
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT geography_type, geography_id
                FROM pipeline_geography
                WHERE ST_Contains(geom, ST_SetSRID(ST_Point(%s, %s), 4326))
                ORDER BY CASE geography_type
                  WHEN 'block_group' THEN 1
                  WHEN 'tract' THEN 2
                  WHEN 'county' THEN 3
                  ELSE 4
                END
                """,
                (property_row["lon"], property_row["lat"]),
            )
            for row in cur.fetchall():
                geography_type = row["geography_type"]
                geography_id = row["geography_id"]
                if geography_type in resolved and not resolved[geography_type]:
                    resolved[geography_type] = geography_id
    return resolved


def _benchmark_metric_map(cbsa_code: str | None, metric_keys: list[str]) -> dict[str, dict]:
    if not cbsa_code or not metric_keys:
        return {}
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT geography_id
            FROM pipeline_geography
            WHERE cbsa_code = %s
              AND geography_type = 'county'
            """,
            (cbsa_code,),
        )
        geographies = [row["geography_id"] for row in cur.fetchall()]
    latest = _latest_metric_map(geography_ids=geographies, metric_keys=metric_keys)
    grouped: dict[str, list[float]] = defaultdict(list)
    sample_row: dict[str, dict] = {}
    for (_geo_id, metric_key), row in latest.items():
        value = _safe_float(row.get("value"))
        if value is None:
            continue
        grouped[metric_key].append(value)
        sample_row[metric_key] = row
    benchmark: dict[str, dict] = {}
    for metric_key, values in grouped.items():
        if not values:
            continue
        row = sample_row[metric_key]
        benchmark[metric_key] = {
            "label": _overlay_definition(metric_key)["display_name"],
            "value": round(sum(values) / len(values), 4),
            "units": row.get("units"),
            "source_name": row.get("source_name"),
            "dataset_vintage": row.get("dataset_vintage"),
        }
    return benchmark


def _build_metric_profile(geography_id: str | None, metric_keys: list[str]) -> dict[str, dict]:
    if not geography_id:
        return {}
    latest = _latest_metric_map(geography_ids=[geography_id], metric_keys=metric_keys)
    profile: dict[str, dict] = {}
    for metric_key in metric_keys:
        definition = _overlay_definition(metric_key)
        row = latest.get((geography_id, metric_key))
        profile[metric_key] = {
            "label": definition["display_name"],
            "value": _safe_float(row.get("value")) if row else None,
            "units": row.get("units") if row else definition.get("units"),
            "source_name": row.get("source_name") if row else definition.get("source_name"),
            "dataset_vintage": row.get("dataset_vintage") if row else None,
        }
    return profile


def _build_fit_summary(
    *,
    sector: str | None,
    tract_profile: dict[str, dict],
    county_profile: dict[str, dict],
    metro_benchmark: dict[str, dict],
) -> dict:
    sector_key = (sector or "").lower()
    score = 55.0
    positives: list[str] = []
    risks: list[str] = []

    renter_share = _safe_float(tract_profile.get("renter_share", {}).get("value"))
    vacancy_rate = _safe_float(tract_profile.get("vacancy_rate", {}).get("value"))
    median_age = _safe_float(tract_profile.get("median_age", {}).get("value"))
    flood_risk = _safe_float(tract_profile.get("hazard_flood_risk", {}).get("value"))
    labor_context = _safe_float(tract_profile.get("labor_context", {}).get("value"))

    if sector_key == "multifamily":
        if renter_share is not None and renter_share >= 45:
            score += 14
            positives.append("The tract is renter-heavy, which supports multifamily demand.")
        if vacancy_rate is not None and vacancy_rate >= 10:
            score -= 10
            risks.append("Vacancy is elevated for a multifamily target.")
    elif sector_key == "industrial":
        if labor_context is not None and labor_context >= 60:
            score += 12
            positives.append("Labor context screens well for industrial operations.")
        if flood_risk is not None and flood_risk >= 60:
            score -= 12
            risks.append("Flood exposure is elevated for an industrial target.")
    elif sector_key == "medical_office":
        if median_age is not None and median_age >= 40:
            score += 12
            positives.append("Older local age profile supports medical office demand.")
    elif sector_key == "student_housing":
        if median_age is not None and median_age >= 38:
            score -= 10
            risks.append("Older age profile weakens the student-housing fit.")
    elif sector_key == "hospitality":
        if flood_risk is not None and flood_risk >= 60:
            score -= 8
            risks.append("Hazard exposure increases operating risk for hospitality.")

    benchmark_deltas: list[dict] = []
    for metric_key in ("median_hh_income", "median_gross_rent", "renter_share", "vacancy_rate"):
        tract_value = _safe_float(tract_profile.get(metric_key, {}).get("value"))
        benchmark_value = _safe_float(metro_benchmark.get(metric_key, {}).get("value"))
        label = tract_profile.get(metric_key, {}).get("label") or _overlay_definition(metric_key)["display_name"]
        delta = None
        if tract_value is not None and benchmark_value is not None:
            delta = round(tract_value - benchmark_value, 4)
        benchmark_deltas.append({
            "metric_key": metric_key,
            "label": label,
            "subject_value": tract_value,
            "benchmark_value": benchmark_value,
            "delta": delta,
            "units": tract_profile.get(metric_key, {}).get("units"),
        })

    if not positives:
        positives.append("No obvious market tailwind is confirmed from the current geo fields.")
    if not risks:
        risks.append("No immediate geo-market red flag is confirmed from the current data.")

    return {
        "sector_fit_score": round(max(0.0, min(100.0, score)), 1),
        "positives": positives[:3],
        "risks": risks[:3],
        "benchmark_deltas": benchmark_deltas,
    }


def _build_commentary_seed(
    *,
    sector: str | None,
    deal_name: str,
    tract_profile: dict[str, dict],
    county_profile: dict[str, dict],
    metro_benchmark: dict[str, dict],
    fit: dict,
    geographies: dict[str, str | None],
) -> dict:
    facts = {
        "deal_name": deal_name,
        "sector": sector,
        "tract_geoid": geographies.get("tract"),
        "county_geoid": geographies.get("county"),
        "median_hh_income": tract_profile.get("median_hh_income", {}).get("value"),
        "median_age": tract_profile.get("median_age", {}).get("value"),
        "renter_share": tract_profile.get("renter_share", {}).get("value"),
        "vacancy_rate": tract_profile.get("vacancy_rate", {}).get("value"),
        "median_gross_rent": tract_profile.get("median_gross_rent", {}).get("value"),
        "labor_context": tract_profile.get("labor_context", {}).get("value"),
        "flood_risk": tract_profile.get("hazard_flood_risk", {}).get("value"),
        "county_income": county_profile.get("median_hh_income", {}).get("value"),
        "metro_income": metro_benchmark.get("median_hh_income", {}).get("value"),
        "sector_fit_score": fit.get("sector_fit_score"),
    }

    narrative: list[str] = []
    for item in fit.get("positives", [])[:2]:
        narrative.append(item)
    for item in fit.get("risks", [])[:2]:
        narrative.append(item)
    if not narrative:
        narrative.append("Geo-market context is available, but the current fact pack is thin.")

    return {
        "facts": facts,
        "safe_narrative": narrative,
    }


def compute_geo_risk_score(*, market_id: str | None = None, tract_geoid: str | None = None, county_geoid: str | None = None) -> dict:
    geography_id = tract_geoid or county_geoid or market_id
    tract_profile = _build_metric_profile(tract_geoid, _PROFILE_METRICS + _HAZARD_METRICS)
    county_profile = _build_metric_profile(county_geoid, _PROFILE_METRICS + _HAZARD_METRICS)
    profile = tract_profile or county_profile

    def metric(name: str, default: float | None = None) -> float | None:
        value = _safe_float(profile.get(name, {}).get("value"))
        if value is None and county_profile:
            value = _safe_float(county_profile.get(name, {}).get("value"))
        if value is None:
            value = default
        return value

    market_cap_rate = metric("market_cap_rate", 5.5)
    population_growth_pct = metric("population_growth_pct")
    if population_growth_pct is None:
        population_growth_pct = metric("mobility_proxy", 0.5)
    employment_growth_pct = metric("employment_growth_pct")
    if employment_growth_pct is None:
        employment_growth_pct = metric("labor_context", 0.5)
    vacancy_rate = metric("vacancy_rate", 6.0)

    cap_rate_component = max(0.0, min(100.0, ((market_cap_rate or 5.5) - 5.0) * 18))
    population_component = max(0.0, min(100.0, 55 - ((population_growth_pct or 0) * 10)))
    employment_component = max(0.0, min(100.0, 55 - ((employment_growth_pct or 0) * 10)))
    vacancy_component = max(0.0, min(100.0, (vacancy_rate or 0) * 7.5))
    score = round(
        (cap_rate_component * 0.25)
        + (population_component * 0.25)
        + (employment_component * 0.20)
        + (vacancy_component * 0.30),
        2,
    )
    return {
        "market_id": geography_id,
        "market_cap_rate": market_cap_rate,
        "population_growth_pct": population_growth_pct,
        "employment_growth_pct": employment_growth_pct,
        "vacancy_rate": vacancy_rate,
        "geo_risk_score": score,
    }


def list_geographies(
    geography_type: str,
    sw_lat: float,
    sw_lon: float,
    ne_lat: float,
    ne_lon: float,
    simplify: bool = True,
    max_features: int = 2000,
) -> dict:
    """Return GeoJSON FeatureCollection of geographies within a bounding box."""
    simplify_tolerance = 0.001 if simplify and geography_type == "tract" else 0.0005
    geom_select = (
        f"ST_AsGeoJSON(ST_SimplifyPreserveTopology(g.geom, {simplify_tolerance}))::json"
        if simplify
        else "ST_AsGeoJSON(g.geom)::json"
    )

    logger.debug(
        "list_geographies type=%s bbox=[%.4f,%.4f,%.4f,%.4f] max=%d",
        geography_type, sw_lat, sw_lon, ne_lat, ne_lon, max_features,
    )
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                g.geography_id,
                g.geography_type,
                g.name,
                g.state_fips,
                g.county_fips,
                g.cbsa_code,
                g.centroid_lat::float,
                g.centroid_lon::float,
                g.area_sq_miles::float,
                {geom_select} AS geometry
            FROM pipeline_geography g
            WHERE g.geography_type = %s
              AND g.centroid_lat BETWEEN %s AND %s
              AND g.centroid_lon BETWEEN %s AND %s
            LIMIT %s
            """,
            (geography_type, sw_lat, ne_lat, sw_lon, ne_lon, max_features),
        )
        rows = cur.fetchall()
    logger.debug("list_geographies returned %d features", len(rows))

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": row["geography_id"],
                "properties": {
                    "geography_id": row["geography_id"],
                    "geography_type": row["geography_type"],
                    "name": row["name"],
                    "state_fips": row.get("state_fips"),
                    "county_fips": row.get("county_fips"),
                    "cbsa_code": row.get("cbsa_code"),
                    "centroid_lat": row.get("centroid_lat"),
                    "centroid_lon": row.get("centroid_lon"),
                    "area_sq_miles": row.get("area_sq_miles"),
                },
                "geometry": row["geometry"],
            }
            for row in rows
        ],
        "total_count": len(rows),
    }


def list_metric_catalog() -> list[dict]:
    """Return all active metric definitions."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT metric_key, display_name, description, units,
                   grain_supported, geography_types_supported,
                   source_name, source_url, color_scale, is_active
            FROM dim_metric
            WHERE is_active = true
            ORDER BY display_name
            """
        )
        return cur.fetchall()


def list_overlay_catalog() -> list[dict]:
    return _overlay_catalog()


def get_choropleth_data(
    geography_type: str,
    metric_key: str,
    period_start: str | None = None,
    sw_lat: float | None = None,
    sw_lon: float | None = None,
    ne_lat: float | None = None,
    ne_lon: float | None = None,
) -> list[dict]:
    """Return metric values for choropleth rendering within a viewport."""
    with get_cursor() as cur:
        params: list = [geography_type, metric_key]
        bbox_clause = ""
        if all(v is not None for v in (sw_lat, sw_lon, ne_lat, ne_lon)):
            params.extend([sw_lat, ne_lat, sw_lon, ne_lon])
            bbox_clause = """
                AND g.centroid_lat BETWEEN %s AND %s
                AND g.centroid_lon BETWEEN %s AND %s
            """

        period_clause = ""
        if period_start:
            params.append(period_start)
            period_clause = "AND f.period_start = %s"

        cur.execute(
            f"""
            SELECT DISTINCT ON (f.geography_id)
                f.geography_id,
                f.value::float AS value,
                f.units,
                f.dataset_vintage,
                f.source_name
            FROM fact_market_metric f
            JOIN pipeline_geography g ON g.geography_id = f.geography_id
            WHERE g.geography_type = %s
              AND f.metric_key = %s
              {bbox_clause}
              {period_clause}
            ORDER BY f.geography_id, f.period_start DESC
            """,
            params,
        )
        return cur.fetchall()


def get_map_context(
    *,
    env_id: str,
    geography_level: str,
    overlay_key: str,
    sw_lat: float,
    sw_lon: float,
    ne_lat: float,
    ne_lon: float,
    fund_id: str | None = None,
    strategy: str | None = None,
    sector: str | None = None,
    stage: str | None = None,
    q: str | None = None,
    simplify: bool = True,
    max_features: int = 1200,
) -> dict:
    overlay = _overlay_definition(overlay_key)
    geographies = list_geographies(
        geography_type=geography_level,
        sw_lat=sw_lat,
        sw_lon=sw_lon,
        ne_lat=ne_lat,
        ne_lon=ne_lon,
        simplify=simplify,
        max_features=max_features,
    )
    geography_ids = [feature["properties"]["geography_id"] for feature in geographies["features"]]
    latest_metrics = _latest_metric_map(geography_ids=geography_ids, metric_keys=[overlay_key])

    logger.debug(
        "get_map_context env=%s level=%s overlay=%s",
        env_id, geography_level, overlay_key,
    )
    # NOTE: SQL processes %s left-to-right. The JOIN clause has pgl.geography_type = %s
    # BEFORE the WHERE clause has d.env_id = %s, so geography_level must come first.
    conditions = ["d.env_id = %s"]
    params: list[Any] = [geography_level, env_id]
    if fund_id:
        conditions.append("d.fund_id = %s")
        params.append(fund_id)
    if strategy:
        conditions.append("d.strategy = %s")
        params.append(strategy)
    if sector:
        conditions.append("d.property_type = %s")
        params.append(sector)
    if stage:
        conditions.append("d.status = %s")
        params.append(stage)
    if q:
        needle = f"%{q}%"
        conditions.append(
            "(d.deal_name ILIKE %s OR COALESCE(p.city, '') ILIKE %s OR COALESCE(p.state, '') ILIKE %s OR COALESCE(d.source, '') ILIKE %s)"
        )
        params.extend([needle, needle, needle, needle])

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                pgl.geography_id,
                d.deal_id::text AS deal_id,
                d.deal_name,
                d.status AS stage,
                d.property_type AS sector,
                d.strategy,
                f.name AS fund_name
            FROM re_pipeline_property p
            JOIN re_pipeline_deal d ON d.deal_id = p.deal_id
            LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
            JOIN property_geography_link pgl
              ON pgl.property_id = p.property_id
             AND pgl.geography_type = %s
            WHERE {' AND '.join(conditions)}
            ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC
            """,
            params,
        )
        nearby_rows = cur.fetchall()

    nearby_by_geo: dict[str, list[dict]] = defaultdict(list)
    for row in nearby_rows:
        nearby_by_geo[row["geography_id"]].append({
            "deal_id": row["deal_id"],
            "deal_name": row["deal_name"],
            "stage": row["stage"],
            "sector": row.get("sector"),
            "strategy": row.get("strategy"),
            "fund_name": row.get("fund_name"),
        })

    metric_values: list[float] = []
    features: list[dict] = []
    source_name = overlay["source_name"]
    dataset_vintage = None
    for feature in geographies["features"]:
        geography_id = feature["properties"]["geography_id"]
        metric = latest_metrics.get((geography_id, overlay_key))
        metric_value = _safe_float(metric.get("value")) if metric else None
        if metric_value is not None:
            metric_values.append(metric_value)
        if metric and metric.get("source_name"):
            source_name = metric["source_name"]
        if metric and metric.get("dataset_vintage") and not dataset_vintage:
            dataset_vintage = metric["dataset_vintage"]
        features.append({
            "geoid": geography_id,
            "geography_level": geography_level,
            "name": feature["properties"]["name"],
            "geometry": feature["geometry"],
            "metric_value": metric_value,
            "metric_label": overlay["display_name"],
            "units": metric.get("units") if metric else overlay.get("units"),
            "source_name": metric.get("source_name") if metric else overlay.get("source_name"),
            "dataset_vintage": metric.get("dataset_vintage") if metric else None,
            "nearby_deals": nearby_by_geo.get(geography_id, [])[:6],
        })

    return {
        "overlay": {
            "metric_key": overlay_key,
            "label": overlay["display_name"],
            "units": overlay.get("units"),
            "source_name": source_name,
            "dataset_vintage": dataset_vintage,
            "geography_level": geography_level,
            "color_scale": overlay.get("color_scale") or "blue_sequential",
            "bins": _compute_bins(metric_values),
        },
        "features": features,
        "total_count": len(features),
    }


def get_geography_metrics(
    geography_id: str,
    metric_keys: list[str] | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
) -> list[dict]:
    """Return time series of metrics for a single geography."""
    with get_cursor() as cur:
        params: list[Any] = [geography_id]
        key_clause = ""
        period_clause = ""

        if metric_keys:
            params.append(metric_keys)
            key_clause = "AND f.metric_key = ANY(%s)"
        if period_start:
            params.append(period_start)
            period_clause += "AND f.period_start >= %s"
        if period_end:
            params.append(period_end)
            period_clause += "AND f.period_start <= %s"

        cur.execute(
            f"""
            SELECT
                f.geography_id,
                f.metric_key,
                f.period_start,
                f.period_grain,
                f.value::float AS value,
                f.units,
                f.source_name,
                f.dataset_vintage,
                m.display_name,
                m.color_scale
            FROM fact_market_metric f
            JOIN dim_metric m ON m.metric_key = f.metric_key
            WHERE f.geography_id = %s
              {key_clause}
              {period_clause}
            ORDER BY f.metric_key, f.period_start DESC
            """,
            params,
        )
        return cur.fetchall()


def get_pipeline_map_feed(
    env_id: str,
    sw_lat: float | None = None,
    sw_lon: float | None = None,
    ne_lat: float | None = None,
    ne_lon: float | None = None,
    status: str | None = None,
) -> dict:
    """Return pipeline properties as map markers with linked geographies."""
    with get_cursor() as cur:
        params: list[Any] = [env_id]
        bbox_clause = ""
        status_clause = ""
        if all(v is not None for v in (sw_lat, sw_lon, ne_lat, ne_lon)):
            params.extend([sw_lat, ne_lat, sw_lon, ne_lon])
            bbox_clause = """
                AND p.lat BETWEEN %s AND %s
                AND p.lon BETWEEN %s AND %s
            """

        if status:
            params.append(status)
            status_clause = "AND d.status = %s"

        cur.execute(
            f"""
            SELECT
                p.property_id::text AS property_id,
                p.deal_id::text AS deal_id,
                p.property_name,
                p.address,
                p.lat::float AS lat,
                p.lon::float AS lon,
                d.deal_name,
                d.status AS deal_status
            FROM re_pipeline_property p
            LEFT JOIN re_pipeline_deal d ON d.deal_id = p.deal_id
            WHERE d.env_id = %s::uuid
              AND p.lat IS NOT NULL
              AND p.lon IS NOT NULL
              {bbox_clause}
              {status_clause}
            ORDER BY d.deal_name, p.property_name
            """,
            params,
        )
        properties = cur.fetchall()

    markers = []
    for prop in properties:
        geographies = []
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT pgl.geography_type, pgl.geography_id, g.name
                FROM property_geography_link pgl
                JOIN pipeline_geography g ON g.geography_id = pgl.geography_id
                WHERE pgl.property_id = %s::uuid
                """,
                (prop["property_id"],),
            )
            for link in cur.fetchall():
                geographies.append({
                    "geography_type": link["geography_type"],
                    "geography_id": link["geography_id"],
                    "name": link["name"],
                })

        markers.append({**prop, "geographies": geographies})
    return {"markers": markers, "total_count": len(markers)}


def get_deal_geo_context(*, deal_id: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                d.deal_id::text AS deal_id,
                d.deal_name,
                d.status,
                d.strategy,
                d.property_type,
                d.headline_price::float AS headline_price,
                d.target_irr::float AS target_irr,
                d.target_moic::float AS target_moic,
                f.name AS fund_name,
                p.property_id::text AS property_id,
                p.property_name,
                p.city,
                p.state,
                p.lat::float AS lat,
                p.lon::float AS lon
            FROM re_pipeline_deal d
            LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
            LEFT JOIN LATERAL (
                SELECT
                    property_id,
                    property_name,
                    city,
                    state,
                    lat,
                    lon
                FROM re_pipeline_property
                WHERE deal_id = d.deal_id
                ORDER BY created_at ASC
                LIMIT 1
            ) p ON TRUE
            WHERE d.deal_id = %s::uuid
            """,
            (deal_id,),
        )
        deal = cur.fetchone()
    if not deal:
        raise LookupError(f"Pipeline deal {deal_id} not found")

    geographies = _resolve_pipeline_property_geographies(deal)
    with get_cursor() as cur:
        cbsa_code = None
        for geography_id in filter(None, [geographies.get("tract"), geographies.get("county")]):
            cur.execute(
                """
                SELECT cbsa_code
                FROM pipeline_geography
                WHERE geography_id = %s
                LIMIT 1
                """,
                (geography_id,),
            )
            row = cur.fetchone()
            if row and row.get("cbsa_code"):
                cbsa_code = row["cbsa_code"]
                break

    tract_profile = _build_metric_profile(geographies.get("tract"), _PROFILE_METRICS + _HAZARD_METRICS)
    county_profile = _build_metric_profile(geographies.get("county"), _PROFILE_METRICS + _HAZARD_METRICS)
    metro_benchmark = _benchmark_metric_map(cbsa_code, _PROFILE_METRICS + _HAZARD_METRICS)
    hazard = {
        key: tract_profile.get(key) or county_profile.get(key) or {
            "label": _overlay_definition(key)["display_name"],
            "value": None,
            "units": _overlay_definition(key).get("units"),
            "source_name": _overlay_definition(key)["source_name"],
            "dataset_vintage": None,
        }
        for key in _HAZARD_METRICS
    }
    fit = _build_fit_summary(
        sector=deal.get("property_type"),
        tract_profile=tract_profile,
        county_profile=county_profile,
        metro_benchmark=metro_benchmark,
    )
    commentary_seed = _build_commentary_seed(
        sector=deal.get("property_type"),
        deal_name=deal["deal_name"],
        tract_profile=tract_profile,
        county_profile=county_profile,
        metro_benchmark=metro_benchmark,
        fit=fit,
        geographies=geographies,
    )
    geo_metrics = compute_geo_risk_score(
        market_id=cbsa_code,
        tract_geoid=geographies.get("tract"),
        county_geoid=geographies.get("county"),
    )

    if deal.get("property_id"):
        try:
            with get_cursor() as cur:
                cur.execute(
                    """
                    UPDATE fact_asset_market_context
                    SET geo_risk_score = %s,
                        computed_at = now()
                    WHERE property_id = %s::uuid
                    """,
                    (geo_metrics["geo_risk_score"], deal["property_id"]),
                )
        except Exception:
            pass

    return {
        "deal": {
            "deal_id": deal["deal_id"],
            "property_id": deal.get("property_id"),
            "deal_name": deal["deal_name"],
            "sector": deal.get("property_type"),
            "strategy": deal.get("strategy"),
            "fund_name": deal.get("fund_name"),
            "stage": deal.get("status"),
            "property_name": deal.get("property_name"),
            "city": deal.get("city"),
            "state": deal.get("state"),
            "lat": deal.get("lat"),
            "lon": deal.get("lon"),
            "county_geoid": geographies.get("county"),
            "tract_geoid": geographies.get("tract"),
            "block_group_geoid": geographies.get("block_group"),
        },
        "underwriting": {
            "headline_price": deal.get("headline_price"),
            "equity_required": None,
            "target_irr": deal.get("target_irr"),
            "target_moic": deal.get("target_moic"),
        },
        "tract_profile": tract_profile,
        "county_profile": county_profile,
        "metro_benchmark": metro_benchmark,
        "hazard": hazard,
        "market_metrics": geo_metrics,
        "fit": fit,
        "commentary_seed": commentary_seed,
        "geo_risk_score": geo_metrics["geo_risk_score"],
    }


def geocode_and_link_property(property_id: str) -> dict:
    """Geocode a property address and create geography links via spatial join."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT property_id::text, lat::float AS lat, lon::float AS lon, address FROM re_pipeline_property WHERE property_id = %s::uuid",
            (property_id,),
        )
        prop = cur.fetchone()
        if not prop:
            raise LookupError(f"Property {property_id} not found")

        lat, lon = prop["lat"], prop["lon"]
        if lat is None or lon is None:
            raise ValueError(f"Property {property_id} has no coordinates. Geocode the address first.")

        cur.execute(
            """
            SELECT geography_id, geography_type, name
            FROM pipeline_geography
            WHERE ST_Contains(geom, ST_SetSRID(ST_Point(%s, %s), 4326))
            """,
            (lon, lat),
        )
        matches = cur.fetchall()

        linked = []
        for match in matches:
            cur.execute(
                """
                INSERT INTO property_geography_link
                    (property_id, geography_type, geography_id, link_method, confidence)
                VALUES (%s::uuid, %s, %s, 'geocode+spatial_join', 1.0)
                ON CONFLICT (property_id, geography_type) DO UPDATE
                SET geography_id = EXCLUDED.geography_id, linked_at = now()
                """,
                (property_id, match["geography_type"], match["geography_id"]),
            )
            linked.append({
                "geography_type": match["geography_type"],
                "geography_id": match["geography_id"],
                "name": match["name"],
            })

    return {
        "property_id": property_id,
        "lat": lat,
        "lon": lon,
        "linked_geographies": linked,
    }
