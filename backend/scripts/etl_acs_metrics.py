"""
ETL: Fetch ACS 5-Year metrics for counties and load into fact_market_metric.

Usage:
    python scripts/etl_acs_metrics.py [--states FL] [--year 2023]

Source: Census API (ACS 5-Year Estimates)
Metrics loaded: median_hh_income, population, median_gross_rent, median_home_value, vacancy_rate
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import date

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

CENSUS_API_BASE = "https://api.census.gov/data"

# ACS variable map: census_var -> metric_key
VARIABLE_MAP = {
    "B19013_001E": "median_hh_income",
    "B01003_001E": "population",
    "B25064_001E": "median_gross_rent",
    "B25077_001E": "median_home_value",
    "B25002_003E": "_vacant_units",    # used to compute vacancy_rate
    "B25002_001E": "_total_units",     # used to compute vacancy_rate
}


def fetch_acs_county_data(state_fips: str, year: int) -> list[dict]:
    """Fetch ACS data for all counties in a state."""
    variables = ",".join(VARIABLE_MAP.keys())
    url = f"{CENSUS_API_BASE}/{year}/acs/acs5"
    params = {
        "get": f"NAME,{variables}",
        "for": "county:*",
        "in": f"state:{state_fips}",
    }

    # Add API key if available
    api_key = os.environ.get("CENSUS_API_KEY")
    if api_key:
        params["key"] = api_key

    print(f"Fetching ACS {year} for state {state_fips} ...")
    resp = httpx.get(url, params=params, timeout=30)
    resp.raise_for_status()
    rows = resp.json()

    if len(rows) < 2:
        print(f"  No data returned for state {state_fips}")
        return []

    headers = rows[0]
    results = []
    for row in rows[1:]:
        record = dict(zip(headers, row))
        geoid = record.get("state", "") + record.get("county", "")
        metrics: dict[str, float | None] = {}

        for var, key in VARIABLE_MAP.items():
            raw = record.get(var)
            try:
                metrics[key] = float(raw) if raw and raw not in ("-666666666", "-999999999") else None
            except (ValueError, TypeError):
                metrics[key] = None

        # Compute vacancy rate
        total = metrics.pop("_total_units", None)
        vacant = metrics.pop("_vacant_units", None)
        if total and vacant and total > 0:
            metrics["vacancy_rate"] = round((vacant / total) * 100, 2)
        else:
            metrics["vacancy_rate"] = None

        results.append({"geoid": geoid, "name": record.get("NAME", ""), "metrics": metrics})

    print(f"  Fetched {len(results)} counties")
    return results


def load_metrics(state_fips_list: list[str], year: int):
    """Load ACS metrics into fact_market_metric."""
    from app.db import get_cursor

    vintage = f"ACS {year} 5-Year"
    period_start = date(year, 1, 1)  # annual grain
    total_inserted = 0

    with get_cursor() as cur:
        run_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO geography_etl_run_log (id, job_name, metadata) VALUES (%s, %s, %s::jsonb)",
            (run_id, "etl_acs_metrics", f'{{"year": {year}, "states": {state_fips_list}}}'),
        )

        for state_fips in state_fips_list:
            counties = fetch_acs_county_data(state_fips, year)

            for county in counties:
                geoid = county["geoid"]

                # Check geography exists
                cur.execute("SELECT 1 FROM dim_geography WHERE geography_id = %s", (geoid,))
                if not cur.fetchone():
                    continue  # skip if geography not loaded yet

                for metric_key, value in county["metrics"].items():
                    if value is None:
                        continue

                    # Determine units
                    units_map = {
                        "median_hh_income": "USD",
                        "population": "people",
                        "median_gross_rent": "USD",
                        "median_home_value": "USD",
                        "vacancy_rate": "%",
                    }

                    cur.execute(
                        """
                        INSERT INTO fact_market_metric
                            (geography_id, metric_key, period_start, period_grain,
                             value, units, source_name, source_url, dataset_vintage)
                        VALUES (%s, %s, %s, 'annual', %s, %s,
                                'ACS 5-Year', 'https://data.census.gov', %s)
                        ON CONFLICT (geography_id, metric_key, period_start, dataset_vintage)
                        DO UPDATE SET value = EXCLUDED.value, pulled_at = now()
                        """,
                        (geoid, metric_key, period_start, value,
                         units_map.get(metric_key, ""), vintage),
                    )
                    total_inserted += 1

        cur.execute(
            "UPDATE geography_etl_run_log SET ended_at = now(), rows_inserted = %s, status = 'success' WHERE id = %s",
            (total_inserted, run_id),
        )

    print(f"Done: {total_inserted} metric rows loaded")


def main():
    parser = argparse.ArgumentParser(description="Load ACS 5-Year metrics")
    parser.add_argument("--states", default="FL", help="Comma-separated state FIPS or abbreviations")
    parser.add_argument("--year", type=int, default=2023, help="ACS vintage year")
    args = parser.parse_args()

    abbrev_to_fips = {"FL": "12", "TX": "48", "GA": "13", "NC": "37", "CA": "06", "NY": "36"}
    states = []
    for s in args.states.split(","):
        s = s.strip().upper()
        states.append(abbrev_to_fips.get(s, s))

    load_metrics(states, args.year)


if __name__ == "__main__":
    main()
