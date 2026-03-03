"""
ETL: Load TIGER/Line county shapefiles into dim_geography.

Usage:
    python scripts/etl_tiger_counties.py [--states FL,TX,GA,NC] [--year 2023]

Requires: geopandas, shapely, psycopg[binary]
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import uuid
import zipfile
from datetime import datetime, timezone

import httpx

# Add parent to path for app imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

TIGER_BASE = "https://www2.census.gov/geo/tiger/TIGER{year}/COUNTY"
TIGER_FILE = "tl_{year}_us_county.zip"


def download_shapefile(year: int, cache_dir: str = "/tmp/tiger_cache") -> str:
    """Download TIGER county shapefile and return path to extracted dir."""
    os.makedirs(cache_dir, exist_ok=True)
    zip_path = os.path.join(cache_dir, TIGER_FILE.format(year=year))

    if not os.path.exists(zip_path):
        url = f"{TIGER_BASE.format(year=year)}/{TIGER_FILE.format(year=year)}"
        print(f"Downloading {url} ...")
        resp = httpx.get(url, follow_redirects=True, timeout=120)
        resp.raise_for_status()
        with open(zip_path, "wb") as f:
            f.write(resp.content)
        print(f"Downloaded {len(resp.content):,} bytes")

    extract_dir = os.path.join(cache_dir, f"county_{year}")
    if not os.path.exists(extract_dir):
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    return extract_dir


def load_counties(year: int, state_fips_filter: set[str] | None = None):
    """Load county boundaries into dim_geography."""
    try:
        import geopandas as gpd
    except ImportError:
        print("ERROR: geopandas is required. Install with: pip install geopandas")
        sys.exit(1)

    from app.db import get_cursor

    extract_dir = download_shapefile(year)

    # Find the .shp file
    shp_files = [f for f in os.listdir(extract_dir) if f.endswith(".shp")]
    if not shp_files:
        # Check subdirectories
        for subdir in os.listdir(extract_dir):
            sub_path = os.path.join(extract_dir, subdir)
            if os.path.isdir(sub_path):
                shp_files = [os.path.join(subdir, f) for f in os.listdir(sub_path) if f.endswith(".shp")]
                if shp_files:
                    break

    if not shp_files:
        print(f"ERROR: No .shp file found in {extract_dir}")
        sys.exit(1)

    shp_path = os.path.join(extract_dir, shp_files[0])
    print(f"Reading {shp_path} ...")
    gdf = gpd.read_file(shp_path)

    # Filter by state if requested
    if state_fips_filter:
        gdf = gdf[gdf["STATEFP"].isin(state_fips_filter)]
        print(f"Filtered to {len(gdf)} counties in states: {state_fips_filter}")

    # Ensure WGS84
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    inserted = 0
    skipped = 0

    with get_cursor() as cur:
        # Log ETL run
        run_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO geography_etl_run_log (id, job_name, metadata) VALUES (%s, %s, %s)",
            (run_id, "etl_tiger_counties", f'{{"year": {year}, "states": {list(state_fips_filter or [])}}}'),
        )

        for _, row in gdf.iterrows():
            geoid = row["GEOID"]  # 5-digit county FIPS
            name = row.get("NAMELSAD", row.get("NAME", ""))
            state_fips = row["STATEFP"]
            county_fips = row["COUNTYFP"]

            # Convert geometry to WKT
            geom = row.geometry
            if geom is None:
                skipped += 1
                continue

            # Ensure MultiPolygon
            from shapely.geometry import MultiPolygon
            if geom.geom_type == "Polygon":
                geom = MultiPolygon([geom])

            wkt = geom.wkt
            centroid = geom.centroid
            bbox = geom.envelope

            # Area in square miles (approximate using WGS84)
            area_sq_miles = float(row.get("ALAND", 0)) / 2_589_988.11 if row.get("ALAND") else None

            cur.execute(
                """
                INSERT INTO dim_geography
                    (geography_id, geography_type, name, state_fips, county_fips,
                     geom, bbox, centroid_lat, centroid_lon, area_sq_miles,
                     source_name, dataset_vintage)
                VALUES (%s, 'county', %s, %s, %s,
                        ST_GeomFromText(%s, 4326), ST_GeomFromText(%s, 4326),
                        %s, %s, %s, 'TIGER/Line', %s)
                ON CONFLICT (geography_id) DO UPDATE SET
                    geom = EXCLUDED.geom,
                    bbox = EXCLUDED.bbox,
                    centroid_lat = EXCLUDED.centroid_lat,
                    centroid_lon = EXCLUDED.centroid_lon,
                    dataset_vintage = EXCLUDED.dataset_vintage
                """,
                (
                    geoid, name, state_fips, county_fips,
                    wkt, bbox.wkt,
                    round(centroid.y, 7), round(centroid.x, 7), area_sq_miles,
                    str(year),
                ),
            )
            inserted += 1

        # Update run log
        cur.execute(
            "UPDATE geography_etl_run_log SET ended_at = now(), rows_inserted = %s, status = 'success' WHERE id = %s",
            (inserted, run_id),
        )

    print(f"Done: {inserted} counties loaded, {skipped} skipped")


def main():
    parser = argparse.ArgumentParser(description="Load TIGER/Line county shapefiles")
    parser.add_argument("--states", default="FL", help="Comma-separated state FIPS codes or abbreviations")
    parser.add_argument("--year", type=int, default=2023, help="TIGER/Line vintage year")
    args = parser.parse_args()

    # Map common abbreviations to FIPS
    abbrev_to_fips = {"FL": "12", "TX": "48", "GA": "13", "NC": "37", "CA": "06", "NY": "36"}
    states = set()
    for s in args.states.split(","):
        s = s.strip().upper()
        states.add(abbrev_to_fips.get(s, s))

    load_counties(year=args.year, state_fips_filter=states)


if __name__ == "__main__":
    main()
