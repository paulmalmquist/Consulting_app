"""Fetch building permit data from Census Bureau Building Permits Survey."""
from __future__ import annotations

import logging
import os
from datetime import date
from typing import Any

import httpx

from app.connectors.cre.base import ConnectorContext
from app.db import get_cursor

log = logging.getLogger(__name__)

CENSUS_PERMITS_BASE = "https://api.census.gov/data/timeseries/bps"


def _lookup_metro(cbsa_code: str) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT metro_name, county_fips FROM cre_metro_registry WHERE cbsa_code = %s", (cbsa_code,))
        row = cur.fetchone()
    if not row:
        raise ValueError(f"CBSA {cbsa_code} not found in cre_metro_registry")
    return {"metro_name": row["metro_name"], "county_fips": list(row["county_fips"])}


def fetch(context: ConnectorContext) -> dict:
    cbsa_code = context.filters.get("metro", "33100")
    year = int(context.filters.get("year", date.today().year - 1))

    metro = _lookup_metro(cbsa_code)
    api_key = os.environ.get("CENSUS_API_KEY", "")

    rows: list[dict] = []
    for county_fips in metro["county_fips"]:
        state = county_fips[:2]
        county = county_fips[2:]
        params: dict[str, str] = {
            "get": "PERMITS,UNITS",
            "for": f"county:{county}",
            "in": f"state:{state}",
            "time": str(year),
        }
        if api_key:
            params["key"] = api_key

        try:
            resp = httpx.get(CENSUS_PERMITS_BASE, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if len(data) >= 2:
                headers = data[0]
                for row_data in data[1:]:
                    rec = dict(zip(headers, row_data))
                    permits = rec.get("PERMITS")
                    units = rec.get("UNITS")
                    if permits:
                        rows.append({
                            "geography_type": "county", "geoid": county_fips,
                            "metric_key": "permits_total", "value": float(permits),
                            "units": "count", "source": "building_permits",
                            "vintage": f"Census BPS {year}", "period": f"{year}-12-31",
                        })
                    if units:
                        rows.append({
                            "geography_type": "county", "geoid": county_fips,
                            "metric_key": "permit_units_total", "value": float(units),
                            "units": "count", "source": "building_permits",
                            "vintage": f"Census BPS {year}", "period": f"{year}-12-31",
                        })
        except Exception as exc:
            log.warning("Census BPS error for %s: %s", county_fips, exc)

    log.info("Building permits fetch: %d rows for CBSA %s", len(rows), cbsa_code)
    return {"period": f"{year}-12-31", "rows": rows}
