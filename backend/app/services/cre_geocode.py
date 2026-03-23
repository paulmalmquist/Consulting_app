"""CRE Geocoding Pipeline.

Uses the free Census Geocoder API for both single and batch geocoding.
Links geocoded properties to geographies via PostGIS spatial joins.
"""
from __future__ import annotations

import csv
import io
import logging
import time
from dataclasses import dataclass
from uuid import UUID

import httpx

from app.db import get_cursor

log = logging.getLogger(__name__)

GEOCODER_SINGLE = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
GEOCODER_BATCH = "https://geocoding.geo.census.gov/geocoder/geographies/addressbatch"

BENCHMARK = "Public_AR_Current"
VINTAGE = "Census2020_Current"

# Delay between batch requests to respect undocumented rate limits
_BATCH_DELAY_S = 0.5
_BATCH_MAX_ROWS = 10_000


@dataclass(slots=True)
class GeocodingResult:
    input_id: str
    input_address: str
    match_type: str  # "Exact", "Non_Exact", "No_Match"
    matched_address: str
    lat: float | None
    lon: float | None
    tract_geoid: str
    county_fips: str
    state_fips: str
    confidence: float


def geocode_single(address: str) -> GeocodingResult:
    """Geocode a single address using the Census Geocoder API.

    Returns lat/lon, tract GEOID, county FIPS, and state FIPS.
    """
    params = {
        "address": address,
        "benchmark": BENCHMARK,
        "vintage": VINTAGE,
        "format": "json",
    }

    resp = httpx.get(GEOCODER_SINGLE, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    matches = data.get("result", {}).get("addressMatches", [])
    if not matches:
        return GeocodingResult(
            input_id="", input_address=address, match_type="No_Match",
            matched_address="", lat=None, lon=None,
            tract_geoid="", county_fips="", state_fips="", confidence=0.0,
        )

    match = matches[0]
    coords = match.get("coordinates", {})
    geographies = match.get("geographies", {})
    tracts = geographies.get("Census Tracts", [{}])
    tract = tracts[0] if tracts else {}

    return GeocodingResult(
        input_id="",
        input_address=address,
        match_type="Exact" if match.get("tigerLine", {}).get("side") else "Non_Exact",
        matched_address=match.get("matchedAddress", ""),
        lat=float(coords.get("y", 0)),
        lon=float(coords.get("x", 0)),
        tract_geoid=tract.get("GEOID", ""),
        county_fips=tract.get("COUNTY", ""),
        state_fips=tract.get("STATE", ""),
        confidence=0.95 if match.get("matchedAddress") else 0.7,
    )


def geocode_batch(
    addresses: list[tuple[str, str]],
) -> list[GeocodingResult]:
    """Geocode a batch of addresses using the Census batch API.

    Args:
        addresses: List of (unique_id, full_address) tuples.

    Returns:
        List of GeocodingResult objects.
    """
    results: list[GeocodingResult] = []

    for i in range(0, len(addresses), _BATCH_MAX_ROWS):
        chunk = addresses[i:i + _BATCH_MAX_ROWS]

        # Build CSV for batch upload
        csv_buf = io.StringIO()
        writer = csv.writer(csv_buf)
        for uid, addr in chunk:
            # Census batch format: unique_id, street, city, state, zip
            # We send the full address as street and leave city/state/zip empty
            writer.writerow([uid, addr, "", "", ""])

        files = {"addressFile": ("addresses.csv", csv_buf.getvalue(), "text/csv")}
        data = {"benchmark": BENCHMARK, "vintage": VINTAGE}

        log.info("Geocoding batch %d-%d of %d addresses ...", i, i + len(chunk), len(addresses))

        resp = httpx.post(GEOCODER_BATCH, data=data, files=files, timeout=120)
        resp.raise_for_status()

        # Parse CSV response
        reader = csv.reader(io.StringIO(resp.text))
        for row in reader:
            if len(row) < 5:
                continue
            uid = row[0].strip('"')
            match_type = row[2].strip('"') if len(row) > 2 else "No_Match"
            matched_addr = row[3].strip('"') if len(row) > 3 else ""

            lat, lon = None, None
            if len(row) > 5 and row[5]:
                coords = row[5].strip('"').split(",")
                if len(coords) == 2:
                    try:
                        lon, lat = float(coords[0]), float(coords[1])
                    except ValueError:
                        pass

            tract_geoid = row[8].strip('"') if len(row) > 8 else ""
            county_fips = row[9].strip('"') if len(row) > 9 else ""
            state_fips = row[10].strip('"') if len(row) > 10 else ""

            results.append(GeocodingResult(
                input_id=uid,
                input_address=dict(addresses).get(uid, ""),
                match_type=match_type,
                matched_address=matched_addr,
                lat=lat, lon=lon,
                tract_geoid=tract_geoid,
                county_fips=county_fips,
                state_fips=state_fips,
                confidence=0.95 if match_type == "Match" else 0.0,
            ))

        if i + _BATCH_MAX_ROWS < len(addresses):
            time.sleep(_BATCH_DELAY_S)

    log.info("Batch geocoding complete: %d results from %d inputs", len(results), len(addresses))
    return results


def geocode_and_link_property(property_id: str | UUID) -> dict:
    """Geocode a property and create spatial links to geographies.

    1. Read address from dim_property
    2. Geocode via Census API
    3. Write lat/lon/geom to dim_property
    4. Spatial join against dim_geography → bridge_property_geography
    """
    pid = str(property_id)

    with get_cursor() as cur:
        cur.execute(
            "SELECT property_id, address, env_id, business_id FROM dim_property WHERE property_id = %s",
            (pid,),
        )
        prop = cur.fetchone()

    if not prop:
        raise ValueError(f"Property {pid} not found")
    if not prop["address"]:
        raise ValueError(f"Property {pid} has no address")

    result = geocode_single(prop["address"])

    if result.match_type == "No_Match" or result.lat is None:
        log.warning("Geocoding failed for property %s: %s", pid, prop["address"])
        return {"property_id": pid, "geocoded": False, "links_created": 0}

    with get_cursor() as cur:
        # Update property with geocoded coordinates
        cur.execute(
            """
            UPDATE dim_property
            SET geom = ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                resolution_confidence = %s
            WHERE property_id = %s
            """,
            (result.lon, result.lat, result.confidence, pid),
        )

        # Spatial join to create bridge_property_geography links
        cur.execute(
            """
            INSERT INTO bridge_property_geography
              (env_id, business_id, property_id, geography_id, geography_type, match_method, confidence)
            SELECT
              p.env_id, p.business_id, p.property_id,
              g.geography_id, g.geography_type,
              'geocode_spatial_join', %s
            FROM dim_property p
            JOIN dim_geography g ON ST_Contains(g.geom, p.geom)
            WHERE p.property_id = %s
              AND g.geography_type IN ('tract', 'county', 'cbsa')
            ON CONFLICT (property_id, geography_id) DO UPDATE
              SET confidence = EXCLUDED.confidence,
                  match_method = EXCLUDED.match_method
            """,
            (result.confidence, pid),
        )
        links_created = cur.rowcount

    log.info("Geocoded property %s: (%s, %s) — %d geography links", pid, result.lat, result.lon, links_created)
    return {"property_id": pid, "geocoded": True, "lat": result.lat, "lon": result.lon, "links_created": links_created}


def batch_geocode_properties(
    env_id: str | UUID,
    business_id: str | UUID,
    limit: int = 500,
) -> int:
    """Find properties with NULL geom and batch geocode them.

    Returns count of successfully geocoded properties.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT property_id, address FROM dim_property
            WHERE env_id = %s AND business_id = %s
              AND geom IS NULL AND address IS NOT NULL
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (str(env_id), str(business_id), limit),
        )
        props = cur.fetchall()

    if not props:
        log.info("No properties need geocoding for env %s", env_id)
        return 0

    addresses = [(str(p["property_id"]), p["address"]) for p in props]
    results = geocode_batch(addresses)

    geocoded = 0
    for result in results:
        if result.match_type == "No_Match" or result.lat is None:
            continue
        try:
            geocode_and_link_property(result.input_id)
            geocoded += 1
        except Exception as exc:
            log.warning("Failed to link property %s: %s", result.input_id, exc)

    log.info("Batch geocoded %d/%d properties for env %s", geocoded, len(props), env_id)
    return geocoded
