"""Fetch rental market data from RentCast API.

Requires RENTCAST_API_KEY env var. Provides rent estimates
and market-level rental metrics.
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

RENTCAST_API_BASE = "https://api.rentcast.io/v1"


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
    """Fetch rental market data from RentCast for the configured metro.

    Returns market-level rent statistics and property-level estimates.
    If RENTCAST_API_KEY is not set, returns empty rows.
    """
    cbsa_code = context.filters.get("metro", "33100")
    api_key = os.environ.get("RENTCAST_API_KEY", "")

    if not api_key:
        log.warning("RENTCAST_API_KEY not set — returning 0 rows. Register at https://api.rentcast.io")
        return {"period": date.today().isoformat(), "rows": [], "market_stats": []}

    metro = _lookup_metro(cbsa_code)
    headers = {"X-Api-Key": api_key, "Accept": "application/json"}

    # Fetch market statistics for each county in the metro
    market_rows: list[dict] = []

    # RentCast uses ZIP codes or city/state for market queries
    # We'll use state + county-level aggregation
    for state_fips in metro["state_fips"]:
        state_map = {"12": "FL", "48": "TX", "13": "GA", "06": "CA", "36": "NY"}
        state_abbrev = state_map.get(state_fips, state_fips)

        try:
            resp = httpx.get(
                f"{RENTCAST_API_BASE}/markets",
                params={"state": state_abbrev, "limit": 50},
                headers=headers,
                timeout=30,
            )

            if resp.status_code == 401:
                log.warning("RentCast API returned 401 — check RENTCAST_API_KEY")
                break
            if resp.status_code == 429:
                log.warning("RentCast API rate limited")
                break

            resp.raise_for_status()
            markets = resp.json()

            if isinstance(markets, list):
                for market in markets:
                    zip_code = market.get("zipCode", "")
                    median_rent = market.get("medianRent") or market.get("rent")
                    if median_rent is not None:
                        market_rows.append({
                            "geography_type": "zip",
                            "geoid": zip_code,
                            "metric_key": "rentcast_median_rent",
                            "value": float(median_rent),
                            "units": "USD",
                            "source": "rentcast",
                            "vintage": f"RentCast {date.today().year}",
                            "period": date.today().replace(day=1).isoformat(),
                        })

        except httpx.HTTPError as exc:
            log.warning("RentCast API error for state %s: %s", state_abbrev, exc)
            continue

    log.info("RentCast fetch: %d market stat rows for CBSA %s", len(market_rows), cbsa_code)
    return {"period": date.today().isoformat(), "rows": market_rows}
