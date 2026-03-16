"""Fetch property ownership records from county open data portals (Socrata SODA API).

Starts with Miami-Dade County Property Appraiser open data.
Multi-metro via county_fips from cre_metro_registry.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.connectors.cre.base import ConnectorContext
from app.db import get_cursor

log = logging.getLogger(__name__)

# Known Socrata endpoints per county FIPS
_COUNTY_ENDPOINTS: dict[str, dict[str, str]] = {
    "12086": {
        "base_url": "https://opendata.miamidade.gov/resource",
        "dataset_id": os.environ.get("MIAMI_DADE_DATASET_ID", "mfmt-wjnp"),
        "county_name": "Miami-Dade",
    },
}

_PAGE_SIZE = 1000
_MAX_PAGES = 10


def _lookup_metro(cbsa_code: str) -> dict[str, Any]:
    """Look up metro from registry."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT metro_name, county_fips FROM cre_metro_registry WHERE cbsa_code = %s",
            (cbsa_code,),
        )
        row = cur.fetchone()
    if not row:
        raise ValueError(f"CBSA {cbsa_code} not found in cre_metro_registry")
    return {"metro_name": row["metro_name"], "county_fips": list(row["county_fips"])}


def _fetch_county(county_fips: str, limit: int) -> list[dict]:
    """Fetch property records from a county's Socrata endpoint."""
    endpoint = _COUNTY_ENDPOINTS.get(county_fips)
    if not endpoint:
        log.info("No Socrata endpoint configured for county %s — skipping", county_fips)
        return []

    base_url = endpoint["base_url"]
    dataset_id = endpoint["dataset_id"]
    url = f"{base_url}/{dataset_id}.json"

    app_token = os.environ.get("SOCRATA_APP_TOKEN", "")
    headers = {}
    if app_token:
        headers["X-App-Token"] = app_token

    all_records: list[dict] = []
    offset = 0
    pages = 0

    while pages < _MAX_PAGES and offset < limit:
        page_limit = min(_PAGE_SIZE, limit - offset)
        params = {
            "$limit": str(page_limit),
            "$offset": str(offset),
            "$order": ":id",
        }

        log.info("Fetching %s page %d (offset %d) ...", endpoint["county_name"], pages + 1, offset)

        try:
            resp = httpx.get(url, params=params, headers=headers, timeout=30)
            resp.raise_for_status()
            records = resp.json()
        except httpx.HTTPError as exc:
            log.warning("Socrata API error for county %s: %s", county_fips, exc)
            break

        if not records:
            break

        all_records.extend(records)
        offset += len(records)
        pages += 1

        if len(records) < page_limit:
            break  # last page

    log.info("County %s: fetched %d records", county_fips, len(all_records))
    return all_records


def fetch(context: ConnectorContext) -> dict:
    """Fetch property ownership records for the configured metro area.

    Uses context.filters["metro"] to determine which counties to query.
    """
    cbsa_code = context.filters.get("metro", "33100")
    limit = int(context.filters.get("limit", 5000))

    metro = _lookup_metro(cbsa_code)
    county_fips_list = metro["county_fips"]

    all_records: list[dict] = []
    for county_fips in county_fips_list:
        records = _fetch_county(county_fips, limit)
        for rec in records:
            rec["_county_fips"] = county_fips
        all_records.extend(records)

    log.info("County assessor fetch: %d total records for CBSA %s", len(all_records), cbsa_code)
    return {"source": "county_assessor", "cbsa": cbsa_code, "records": all_records}
