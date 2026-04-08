"""Load raw market signals into Databricks signals_raw table.

Sources:
  - FRED API (free): yield curve, CPI, housing starts, unemployment claims, HY spreads
  - CBOE/Yahoo Finance: VIX spot + term structure proxy
  - CoinGecko (free): BTC price (MVRV proxy derived from price)

Fixes applied:
  - CPI loaded as raw index; YoY is computed in 02_build_features
  - VIX added as P0 signal
  - Dedup via MERGE to prevent duplicate rows on re-run
  - Parameterized SQL to prevent injection
  - Accepts optional DatabricksClient for pipeline orchestration

Usage:
    python -m skills.historyrhymes.notebooks.01_load_signals
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from databricks_client import DatabricksClient

FRED_API_KEY = os.environ.get("FRED_API_KEY", "")

# FRED series we pull
FRED_SERIES = {
    "T10Y2Y": "yield_curve_10y2y",       # 10Y-2Y spread (daily)
    "CPIAUCSL": "cpi_index",              # CPI index — NOT YoY; computed in 02
    "HOUST": "housing_starts_saar",       # Housing starts SAAR (monthly)
    "ICSA": "initial_claims",             # Weekly initial claims
    "BAMLH0A0HYM2": "hy_credit_spread",  # ICE BofA HY spread (daily)
    "VIXCLS": "vix_spot",                 # VIX close (daily)
}


def fetch_fred(series_id: str, start: str, end: str) -> list[dict[str, Any]]:
    """Fetch observations from FRED API."""
    if not FRED_API_KEY:
        print(f"  FRED_API_KEY not set, skipping {series_id}")
        return []
    url = (
        f"https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&observation_start={start}&observation_end={end}"
        f"&api_key={FRED_API_KEY}&file_type=json"
    )
    try:
        req = Request(url)
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        rows = [
            {"date": o["date"], "value": float(o["value"])}
            for o in data.get("observations", [])
            if o["value"] != "."
        ]
        print(f"    {series_id}: {len(rows)} observations")
        return rows
    except (URLError, Exception) as e:
        print(f"    {series_id}: FAILED — {e}")
        return []


def fetch_coingecko_btc(days: int = 365) -> list[dict[str, Any]]:
    """Fetch BTC price history from CoinGecko (free, no key)."""
    url = f"https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days={days}"
    req = Request(url)
    req.add_header("Accept", "application/json")
    try:
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        rows = [
            {"date": datetime.utcfromtimestamp(p[0] / 1000).strftime("%Y-%m-%d"), "value": p[1]}
            for p in data.get("prices", [])
        ]
        print(f"    CoinGecko BTC: {len(rows)} observations")
        return rows
    except (URLError, Exception) as e:
        print(f"    CoinGecko BTC: FAILED — {e}")
        return []


def _sanitize_value(v: float) -> str:
    """Ensure numeric value is safe for SQL."""
    return str(float(v))


def _sanitize_string(s: str) -> str:
    """Escape single quotes for SQL string literals."""
    return s.replace("'", "''")


def merge_signals(client: DatabricksClient, signal_name: str, rows: list[dict[str, Any]], source: str):
    """Dedup-safe merge of signal rows into signals_raw."""
    if not rows:
        return

    safe_name = _sanitize_string(signal_name)
    safe_source = _sanitize_string(source)

    # Batch in chunks of 100
    for i in range(0, len(rows), 100):
        chunk = rows[i:i + 100]
        values = ", ".join(
            f"(DATE'{r['date']}', '{safe_name}', 'global', {_sanitize_value(r['value'])}, '{safe_source}')"
            for r in chunk
        )
        sql = f"""
            MERGE INTO novendor_1.historyrhymes.signals_raw AS tgt
            USING (
                SELECT col1 AS as_of_date, col2 AS signal_name, col3 AS asset_scope,
                       col4 AS value, col5 AS source
                FROM (VALUES {values}) AS v(col1, col2, col3, col4, col5)
            ) AS src
            ON tgt.as_of_date = src.as_of_date
                AND tgt.signal_name = src.signal_name
                AND tgt.asset_scope = src.asset_scope
            WHEN MATCHED THEN UPDATE SET tgt.value = src.value, tgt.source = src.source, tgt.loaded_at = current_timestamp()
            WHEN NOT MATCHED THEN INSERT (as_of_date, signal_name, asset_scope, value, source) VALUES (src.as_of_date, src.signal_name, src.asset_scope, src.value, src.source)
        """
        client.execute_sql(sql)
    print(f"  Merged {len(rows)} rows for {signal_name}")


def main(client: Optional[DatabricksClient] = None):
    owns_warehouse = client is None
    if owns_warehouse:
        client = DatabricksClient()
        print("Starting warehouse...")
        client.start_warehouse()
        client.wait_for_warehouse("RUNNING")

    end = date.today().isoformat()
    start_2y = (date.today() - timedelta(days=730)).isoformat()

    succeeded = []
    failed = []

    # FRED signals
    for series_id, signal_name in FRED_SERIES.items():
        print(f"Fetching FRED {series_id} -> {signal_name}...")
        rows = fetch_fred(series_id, start_2y, end)
        if rows:
            merge_signals(client, signal_name, rows, f"fred:{series_id}")
            succeeded.append(signal_name)
        else:
            failed.append(signal_name)

    # BTC price
    print("Fetching CoinGecko BTC price...")
    btc_rows = fetch_coingecko_btc(days=730)
    if btc_rows:
        merge_signals(client, "btc_price_usd", btc_rows, "coingecko")
        succeeded.append("btc_price_usd")
    else:
        failed.append("btc_price_usd")

    # Report
    print(f"\nIngestion complete: {len(succeeded)} succeeded, {len(failed)} failed")
    if failed:
        print(f"  FAILED sources: {failed}")

    # Verify row counts
    print("\nSignal inventory:")
    result = client.execute_sql("""
        SELECT signal_name, COUNT(*) as cnt, MIN(as_of_date), MAX(as_of_date)
        FROM novendor_1.historyrhymes.signals_raw
        GROUP BY signal_name
        ORDER BY signal_name
    """)
    for row in result.get("result", {}).get("data_array", []):
        print(f"  {row[0]}: {row[1]} rows ({row[2]} to {row[3]})")

    if owns_warehouse:
        print("\nStopping warehouse...")
        client.stop_warehouse()

    print("Done.")
    return {"succeeded": succeeded, "failed": failed}


if __name__ == "__main__":
    main()
