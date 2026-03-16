"""Fetch BLS LAUS unemployment and employment data via Public Data API v2.

Uses CBSA-level series from the metro registry.
Supports BLS_API_KEY env var for higher rate limits (500 req/day vs 10).
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

BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

# BLS LAUS series ID patterns for CBSAs
# LAUCB{cbsa}0000000003 = unemployment rate
# LAUCB{cbsa}0000000005 = employment level
_SERIES_TEMPLATES = {
    "unemployment_rate": "LAUCB{cbsa}0000000003",
    "employment_level": "LAUCB{cbsa}0000000005",
}


def _lookup_metro(cbsa_code: str) -> dict[str, Any]:
    """Look up metro from registry."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT metro_name FROM cre_metro_registry WHERE cbsa_code = %s",
            (cbsa_code,),
        )
        row = cur.fetchone()
    if not row:
        raise ValueError(f"CBSA {cbsa_code} not found in cre_metro_registry")
    return {"metro_name": row["metro_name"]}


def fetch(context: ConnectorContext) -> dict:
    """Fetch BLS LAUS data for the configured metro CBSA.

    Returns monthly unemployment_rate and employment_level for trailing 2 years.
    """
    cbsa_code = context.filters.get("metro", "33100")
    current_year = date.today().year
    start_year = int(context.filters.get("start_year", current_year - 1))
    end_year = int(context.filters.get("end_year", current_year))

    _lookup_metro(cbsa_code)  # validate CBSA exists

    series_ids = [
        tmpl.format(cbsa=cbsa_code) for tmpl in _SERIES_TEMPLATES.values()
    ]
    series_to_metric = {
        tmpl.format(cbsa=cbsa_code): metric_key
        for metric_key, tmpl in _SERIES_TEMPLATES.items()
    }

    payload: dict[str, Any] = {
        "seriesid": series_ids,
        "startyear": str(start_year),
        "endyear": str(end_year),
    }

    api_key = os.environ.get("BLS_API_KEY")
    if api_key:
        payload["registrationkey"] = api_key

    log.info("Fetching BLS LAUS for CBSA %s (%s-%s) ...", cbsa_code, start_year, end_year)

    resp = httpx.post(BLS_API_URL, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    if data.get("status") != "REQUEST_SUCCEEDED":
        msg = data.get("message", ["Unknown BLS error"])
        log.warning("BLS API returned status=%s: %s", data.get("status"), msg)
        return {"period": f"{end_year}-12-31", "rows": []}

    rows: list[dict] = []
    for series in data.get("Results", {}).get("series", []):
        series_id = series.get("seriesID", "")
        metric_key = series_to_metric.get(series_id)
        if not metric_key:
            continue

        units = "pct" if metric_key == "unemployment_rate" else "people"

        for dp in series.get("data", []):
            period_str = dp.get("period", "")
            if not period_str.startswith("M") or period_str == "M13":
                continue  # skip annual average
            month = int(period_str[1:])
            year = int(dp.get("year", end_year))
            try:
                value = float(dp["value"])
            except (KeyError, ValueError, TypeError):
                continue

            rows.append({
                "geography_type": "cbsa",
                "geoid": cbsa_code,
                "metric_key": metric_key,
                "value": value,
                "units": units,
                "source": "bls_labor",
                "vintage": f"BLS LAUS {year}",
                "period": date(year, month, 1).isoformat(),
            })

    log.info("BLS fetch complete: %d monthly records for CBSA %s", len(rows), cbsa_code)
    return {"period": f"{end_year}-12-31", "rows": rows}
