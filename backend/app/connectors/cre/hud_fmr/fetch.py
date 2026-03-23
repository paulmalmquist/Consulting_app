"""Fetch HUD Fair Market Rents from the HUD User API.

Requires HUD_API_KEY env var for authentication.
Returns county-level 2BR FMR data.
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

HUD_FMR_API = "https://www.huduser.gov/hudapi/public/fmr/statedata"

_FIPS_TO_ABBREV = {
    "12": "FL", "48": "TX", "13": "GA", "37": "NC", "06": "CA", "36": "NY",
    "34": "NJ", "42": "PA",
}


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


def fetch(context: ConnectorContext) -> dict:
    """Fetch HUD FMR for counties in the configured metro area.

    Returns county-level 2BR Fair Market Rent values.
    If HUD_API_KEY is not set, returns empty rows (logged as warning).
    """
    cbsa_code = context.filters.get("metro", "33100")
    year = int(context.filters.get("year", date.today().year))

    metro = _lookup_metro(cbsa_code)
    state_fips_list = metro["state_fips"]
    county_fips_set = set(metro["county_fips"])

    api_key = os.environ.get("HUD_API_KEY", "")
    if not api_key:
        log.warning("HUD_API_KEY not set — returning 0 FMR rows. Register at https://www.huduser.gov/hudapi/public/register")
        return {"period": date(year, 10, 1).isoformat(), "rows": []}

    headers = {"Authorization": f"Bearer {api_key}"}
    period = date(year, 10, 1).isoformat()  # FMR fiscal year starts Oct 1

    rows: list[dict] = []

    for state_fips in state_fips_list:
        state_abbrev = _FIPS_TO_ABBREV.get(state_fips, state_fips)
        url = f"{HUD_FMR_API}/{state_abbrev}"
        params = {"year": year}

        log.info("Fetching HUD FMR %d for %s ...", year, state_abbrev)

        try:
            resp = httpx.get(url, params=params, headers=headers, timeout=30)

            if resp.status_code in (401, 403):
                log.warning("HUD API returned %d — check HUD_API_KEY validity", resp.status_code)
                continue

            resp.raise_for_status()
            data = resp.json()

            counties = data.get("data", {}).get("counties", [])
            for county in counties:
                geoid = county.get("fips_code", "")[:5]
                if county_fips_set and geoid not in county_fips_set:
                    continue

                fmr_2br = county.get("fmr_2br") or county.get("Rent50_2") or county.get("rent50_2")
                if not fmr_2br:
                    continue

                try:
                    value = float(fmr_2br)
                except (ValueError, TypeError):
                    continue

                rows.append({
                    "geography_type": "county",
                    "geoid": geoid,
                    "metric_key": "fair_market_rent",
                    "value": value,
                    "units": "USD",
                    "source": "hud_fmr",
                    "vintage": f"HUD FMR {year}",
                    "period": period,
                })

        except httpx.HTTPError as exc:
            log.warning("HUD API error for %s: %s", state_abbrev, exc)
            continue

    log.info("HUD FMR fetch complete: %d county records for CBSA %s", len(rows), cbsa_code)
    return {"period": period, "rows": rows}
