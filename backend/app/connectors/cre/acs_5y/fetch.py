"""Fetch ACS 5-Year demographic data from the Census API.

Uses county_fips from the metro registry to scope tract-level queries.
Supports CENSUS_API_KEY env var for higher rate limits.
"""
from __future__ import annotations

import logging
import os
from datetime import date
from typing import Any

import httpx

from app.connectors.cre.base import ConnectorContext
from app.db import get_cursor

log = logging.getLogger(__name__)

CENSUS_API_BASE = "https://api.census.gov/data"

# ACS variable map: census_var -> (metric_key, units)
VARIABLE_MAP: dict[str, tuple[str, str]] = {
    "B19013_001E": ("median_income", "USD"),
    "B01003_001E": ("population", "people"),
    "B25064_001E": ("median_rent", "USD"),
    "B25077_001E": ("median_home_value", "USD"),
    "B25002_003E": ("_vacant_units", ""),
    "B25002_001E": ("_total_units", ""),
}

# Sentinel values Census uses for "not available"
_CENSUS_NULLS = {"-666666666", "-999999999", None, ""}


def _lookup_metro(cbsa_code: str) -> dict[str, Any]:
    """Look up metro from registry."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT metro_name, state_fips, county_fips FROM cre_metro_registry WHERE cbsa_code = %s",
            (cbsa_code,),
        )
        row = cur.fetchone()
    if not row:
        raise ValueError(f"CBSA {cbsa_code} not found in cre_metro_registry")
    return {"metro_name": row["metro_name"], "state_fips": list(row["state_fips"]), "county_fips": list(row["county_fips"])}


def _fetch_tracts(state_fips: str, county_fips_3: list[str], year: int) -> list[list[str]]:
    """Fetch ACS data for all tracts in specified counties of a state."""
    variables = ",".join(VARIABLE_MAP.keys())
    county_filter = ",".join(county_fips_3)

    url = f"{CENSUS_API_BASE}/{year}/acs/acs5"
    params: dict[str, str] = {
        "get": f"NAME,{variables}",
        "for": "tract:*",
        "in": f"state:{state_fips}+county:{county_filter}",
    }

    api_key = os.environ.get("CENSUS_API_KEY")
    if api_key:
        params["key"] = api_key

    log.info("Fetching ACS %d tracts for state %s, counties %s ...", year, state_fips, county_filter)

    resp = httpx.get(url, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    if len(data) < 2:
        log.warning("No ACS data returned for state %s", state_fips)
        return []

    return data  # [headers, row1, row2, ...]


def fetch(context: ConnectorContext) -> dict:
    """Fetch ACS 5-Year demographics for tracts in the configured metro area.

    Returns per-metric rows for: median_income, population, median_rent,
    rent_burden_proxy, vacancy_rate.
    """
    cbsa_code = context.filters.get("metro", "33100")
    year = int(context.filters.get("year", 2023))

    metro = _lookup_metro(cbsa_code)
    state_fips_list = metro["state_fips"]
    county_fips_list = metro["county_fips"]

    # Group counties by state (county FIPS = state_fips + county_3digit)
    counties_by_state: dict[str, list[str]] = {}
    for full_fips in county_fips_list:
        st = full_fips[:2]
        county_3 = full_fips[2:]
        counties_by_state.setdefault(st, []).append(county_3)

    rows: list[dict] = []
    period = date(year, 12, 31).isoformat()

    for state_fips in state_fips_list:
        county_3_list = counties_by_state.get(state_fips, [])
        if not county_3_list:
            continue

        api_rows = _fetch_tracts(state_fips, county_3_list, year)
        if not api_rows:
            continue

        headers = api_rows[0]
        for data_row in api_rows[1:]:
            record = dict(zip(headers, data_row))
            geoid = record.get("state", "") + record.get("county", "") + record.get("tract", "")

            # Parse all variables
            values: dict[str, float | None] = {}
            for var, (key, _) in VARIABLE_MAP.items():
                raw = record.get(var)
                if raw in _CENSUS_NULLS:
                    values[key] = None
                    continue
                try:
                    values[key] = float(raw)
                except (ValueError, TypeError):
                    values[key] = None

            # Compute derived metrics
            total = values.pop("_total_units", None)
            vacant = values.pop("_vacant_units", None)

            median_income = values.get("median_income")
            median_rent = values.get("median_rent")

            if total and vacant and total > 0:
                values["vacancy_rate"] = round((vacant / total) * 100, 2)

            if median_income and median_rent and median_income > 0:
                values["rent_burden_proxy"] = round((median_rent * 12) / median_income, 4)

            # Emit one row per metric
            for metric_key, value in values.items():
                if value is None:
                    continue
                units_map = {
                    "median_income": "USD", "population": "people", "median_rent": "USD",
                    "median_home_value": "USD", "vacancy_rate": "pct", "rent_burden_proxy": "ratio",
                }
                rows.append({
                    "geography_type": "tract",
                    "geoid": geoid,
                    "metric_key": metric_key,
                    "value": value,
                    "units": units_map.get(metric_key, ""),
                    "source": "acs_5y",
                    "vintage": f"ACS {year} 5-Year",
                    "period": period,
                })

    log.info("ACS fetch complete: %d metric rows across %d states for CBSA %s", len(rows), len(state_fips_list), cbsa_code)
    return {"period": period, "rows": rows}
