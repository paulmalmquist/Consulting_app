"""
ETL: Fetch BLS LAUS (Local Area Unemployment Statistics) and load into fact_market_metric.

Usage:
    python scripts/etl_bls_laus.py [--states FL] [--year 2024]

Source: BLS Public Data API v2 (https://api.bls.gov/publicAPI/v2/timeseries/data/)
Series ID format: LAUCN{state_fips}{county_fips}0000000003 (unemployment rate)
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import date

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"


def fetch_unemployment_data(state_fips: str, year: int) -> list[dict]:
    """Fetch unemployment rates for all counties in a state from BLS LAUS."""
    from app.db import get_cursor

    # First get all county GEOIDs for this state from dim_geography
    with get_cursor() as cur:
        cur.execute(
            "SELECT geography_id, county_fips FROM dim_geography WHERE state_fips = %s AND geography_type = 'county'",
            (state_fips,),
        )
        counties = cur.fetchall()

    if not counties:
        print(f"  No counties found for state {state_fips} in dim_geography")
        return []

    # BLS API accepts up to 50 series per request
    results = []
    batch_size = 50

    for i in range(0, len(counties), batch_size):
        batch = counties[i:i + batch_size]

        # LAUS series ID: LAUCN + state_fips + county_fips + 0000000003 (unemployment rate)
        series_ids = [
            f"LAUCN{c['geography_id']}0000000003"
            for c in batch
        ]

        payload = {
            "seriesid": series_ids,
            "startyear": str(year),
            "endyear": str(year),
        }

        # Add registration key if available
        api_key = os.environ.get("BLS_API_KEY")
        if api_key:
            payload["registrationkey"] = api_key

        print(f"  Fetching BLS LAUS batch {i // batch_size + 1} ({len(series_ids)} series) ...")

        try:
            resp = httpx.post(BLS_API_URL, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            if data.get("status") != "REQUEST_SUCCEEDED":
                print(f"  BLS API error: {data.get('message', 'Unknown error')}")
                continue

            for series in data.get("Results", {}).get("series", []):
                series_id = series.get("seriesID", "")
                # Extract county GEOID from series ID: LAUCN{geoid}0000000003
                if len(series_id) >= 12:
                    geoid = series_id[5:10]  # 5-digit county FIPS
                else:
                    continue

                for dp in series.get("data", []):
                    period = dp.get("period", "")
                    if not period.startswith("M") or period == "M13":  # M13 = annual avg
                        continue

                    month = int(period[1:])
                    value_str = dp.get("value", "")
                    try:
                        value = float(value_str)
                    except (ValueError, TypeError):
                        continue

                    results.append({
                        "geoid": geoid,
                        "month": month,
                        "year": year,
                        "value": value,
                    })

        except Exception as exc:
            print(f"  Error fetching BLS data: {exc}")
            continue

    return results


def load_unemployment(state_fips_list: list[str], year: int):
    """Load BLS LAUS unemployment rates into fact_market_metric."""
    from app.db import get_cursor

    vintage = f"BLS LAUS {year}"
    total_inserted = 0

    with get_cursor() as cur:
        run_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO geography_etl_run_log (id, job_name, metadata) VALUES (%s, %s, %s::jsonb)",
            (run_id, "etl_bls_laus", f'{{"year": {year}, "states": {state_fips_list}}}'),
        )

        for state_fips in state_fips_list:
            records = fetch_unemployment_data(state_fips, year)
            print(f"  State {state_fips}: {len(records)} monthly records")

            for rec in records:
                period_start = date(rec["year"], rec["month"], 1)

                cur.execute(
                    """
                    INSERT INTO fact_market_metric
                        (geography_id, metric_key, period_start, period_grain,
                         value, units, source_name, source_url, dataset_vintage)
                    VALUES (%s, 'unemployment_rate', %s, 'monthly', %s, '%%',
                            'BLS LAUS', 'https://www.bls.gov/lau', %s)
                    ON CONFLICT (geography_id, metric_key, period_start, dataset_vintage)
                    DO UPDATE SET value = EXCLUDED.value, pulled_at = now()
                    """,
                    (rec["geoid"], period_start, rec["value"], vintage),
                )
                total_inserted += 1

        cur.execute(
            "UPDATE geography_etl_run_log SET ended_at = now(), rows_inserted = %s, status = 'success' WHERE id = %s",
            (total_inserted, run_id),
        )

    print(f"Done: {total_inserted} unemployment rate rows loaded")


def main():
    parser = argparse.ArgumentParser(description="Load BLS LAUS unemployment data")
    parser.add_argument("--states", default="FL", help="Comma-separated state abbreviations or FIPS")
    parser.add_argument("--year", type=int, default=2024, help="Data year")
    args = parser.parse_args()

    abbrev_to_fips = {"FL": "12", "TX": "48", "GA": "13", "NC": "37", "CA": "06", "NY": "36"}
    states = []
    for s in args.states.split(","):
        s = s.strip().upper()
        states.append(abbrev_to_fips.get(s, s))

    load_unemployment(states, args.year)


if __name__ == "__main__":
    main()
