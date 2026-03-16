"""Fetch Census TIGER/Line shapefiles for counties, tracts, and CBSA boundaries.

Uses pyshp (pure Python) to avoid geopandas/GDAL dependency.
Downloads are cached in /tmp/tiger_cache/ to avoid re-fetching.
"""
from __future__ import annotations

import logging
import os
import zipfile
from typing import Any

import httpx
import shapefile  # pyshp

from app.connectors.cre.base import ConnectorContext
from app.db import get_cursor

log = logging.getLogger(__name__)

TIGER_BASE = "https://www2.census.gov/geo/tiger/TIGER{year}"
CACHE_DIR = "/tmp/tiger_cache"

# State abbreviation → FIPS (used only as fallback)
_ABBREV_TO_FIPS = {"FL": "12", "TX": "48", "GA": "13", "NC": "37", "CA": "06", "NY": "36", "NJ": "34", "PA": "42"}


def _lookup_metro(cbsa_code: str) -> dict[str, Any]:
    """Look up metro definition from cre_metro_registry."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT metro_name, state_fips, county_fips FROM cre_metro_registry WHERE cbsa_code = %s",
            (cbsa_code,),
        )
        row = cur.fetchone()
    if not row:
        raise ValueError(f"CBSA {cbsa_code} not found in cre_metro_registry")
    return {"metro_name": row["metro_name"], "state_fips": list(row["state_fips"]), "county_fips": list(row["county_fips"])}


def _download(url: str, dest: str) -> None:
    """Download a file if it doesn't already exist locally."""
    if os.path.exists(dest):
        log.info("Cache hit: %s", dest)
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    log.info("Downloading %s ...", url)
    resp = httpx.get(url, follow_redirects=True, timeout=180)
    resp.raise_for_status()
    with open(dest, "wb") as f:
        f.write(resp.content)
    log.info("Downloaded %d bytes → %s", len(resp.content), dest)


def _extract_zip(zip_path: str) -> str:
    """Extract a ZIP and return the directory containing the shapefile."""
    extract_dir = zip_path.replace(".zip", "")
    if not os.path.exists(extract_dir):
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    return extract_dir


def _find_shp(directory: str) -> str:
    """Find the first .shp file in a directory (may be nested one level)."""
    for name in os.listdir(directory):
        if name.endswith(".shp"):
            return os.path.join(directory, name)
        sub = os.path.join(directory, name)
        if os.path.isdir(sub):
            for inner in os.listdir(sub):
                if inner.endswith(".shp"):
                    return os.path.join(sub, inner)
    raise FileNotFoundError(f"No .shp file found in {directory}")


def _normalize_geojson(geo: dict) -> dict:
    """Ensure geometry is MultiPolygon for consistency with dim_geography.geom."""
    if geo["type"] == "Polygon":
        return {"type": "MultiPolygon", "coordinates": [geo["coordinates"]]}
    return geo


def _read_counties(year: int, state_fips_set: set[str], county_fips_set: set[str]) -> list[dict]:
    """Read county boundaries from TIGER county shapefile."""
    filename = f"tl_{year}_us_county.zip"
    zip_path = os.path.join(CACHE_DIR, filename)
    _download(f"{TIGER_BASE.format(year=year)}/COUNTY/{filename}", zip_path)
    extract_dir = _extract_zip(zip_path)
    shp_path = _find_shp(extract_dir)

    rows: list[dict] = []
    sf = shapefile.Reader(shp_path)
    for sr in sf.shapeRecords():
        rec = sr.record.as_dict()
        statefp = rec.get("STATEFP", "")
        geoid = rec.get("GEOID", "")
        if statefp not in state_fips_set:
            continue
        if county_fips_set and geoid not in county_fips_set:
            continue
        geo = sr.shape.__geo_interface__
        rows.append({
            "geography_type": "county",
            "geoid": geoid,
            "name": rec.get("NAMELSAD", rec.get("NAME", "")),
            "state_code": statefp,
            "cbsa_code": None,
            "geometry_geojson": _normalize_geojson(geo),
        })
    log.info("Counties: %d records for states %s", len(rows), state_fips_set)
    return rows


def _read_tracts(year: int, state_fips: str, county_fips_set: set[str]) -> list[dict]:
    """Read tract boundaries from TIGER tract shapefile (one per state)."""
    filename = f"tl_{year}_{state_fips}_tract.zip"
    zip_path = os.path.join(CACHE_DIR, filename)
    _download(f"{TIGER_BASE.format(year=year)}/TRACT/{filename}", zip_path)
    extract_dir = _extract_zip(zip_path)
    shp_path = _find_shp(extract_dir)

    rows: list[dict] = []
    sf = shapefile.Reader(shp_path)
    for sr in sf.shapeRecords():
        rec = sr.record.as_dict()
        county_geoid = rec.get("STATEFP", "") + rec.get("COUNTYFP", "")
        if county_fips_set and county_geoid not in county_fips_set:
            continue
        geo = sr.shape.__geo_interface__
        rows.append({
            "geography_type": "tract",
            "geoid": rec.get("GEOID", ""),
            "name": rec.get("NAMELSAD", rec.get("NAME", "")),
            "state_code": state_fips,
            "cbsa_code": None,
            "geometry_geojson": _normalize_geojson(geo),
        })
    log.info("Tracts for state %s: %d records", state_fips, len(rows))
    return rows


def _read_cbsa(year: int, cbsa_code: str) -> list[dict]:
    """Read CBSA boundary from TIGER CBSA shapefile."""
    filename = f"tl_{year}_us_cbsa.zip"
    zip_path = os.path.join(CACHE_DIR, filename)
    _download(f"{TIGER_BASE.format(year=year)}/CBSA/{filename}", zip_path)
    extract_dir = _extract_zip(zip_path)
    shp_path = _find_shp(extract_dir)

    rows: list[dict] = []
    sf = shapefile.Reader(shp_path)
    for sr in sf.shapeRecords():
        rec = sr.record.as_dict()
        if rec.get("GEOID", "") != cbsa_code and rec.get("CBSAFP", "") != cbsa_code:
            continue
        geo = sr.shape.__geo_interface__
        rows.append({
            "geography_type": "cbsa",
            "geoid": cbsa_code,
            "name": rec.get("NAMELSAD", rec.get("NAME", "")),
            "state_code": None,
            "cbsa_code": cbsa_code,
            "geometry_geojson": _normalize_geojson(geo),
        })
    log.info("CBSA %s: %d records", cbsa_code, len(rows))
    return rows


def fetch(context: ConnectorContext) -> dict:
    """Fetch TIGER/Line geography data for the configured metro area.

    Uses context.filters["metro"] (CBSA code) to look up the metro registry
    and determine which state/county FIPS codes to download.
    """
    cbsa_code = context.filters.get("metro", "33100")
    year = int(context.filters.get("year", 2023))

    metro = _lookup_metro(cbsa_code)
    state_fips_set = set(metro["state_fips"])
    county_fips_set = set(metro["county_fips"])

    rows: list[dict] = []

    # 1. CBSA boundary
    rows.extend(_read_cbsa(year, cbsa_code))

    # 2. Counties in the metro
    rows.extend(_read_counties(year, state_fips_set, county_fips_set))

    # 3. Tracts for each state in the metro
    for sfips in state_fips_set:
        rows.extend(_read_tracts(year, sfips, county_fips_set))

    log.info("TIGER fetch complete: %d total geography rows for CBSA %s", len(rows), cbsa_code)

    return {"vintage": year, "rows": rows}
