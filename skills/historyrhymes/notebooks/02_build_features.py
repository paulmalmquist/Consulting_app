"""Compute rolling z-scores, deltas, and percentiles from raw signals.

Reads from signals_raw, writes to signals_featured.

Fixes applied:
  - RANGE BETWEEN INTERVAL for date-based windows (handles gaps in monthly data)
  - CPI YoY computed from index before z-scoring
  - Staleness detection via loaded_at
  - Accepts optional DatabricksClient for pipeline orchestration

Usage:
    python -m skills.historyrhymes.notebooks.02_build_features
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from databricks_client import DatabricksClient


# Step 1: Compute CPI YoY from the raw CPI index
CPI_YOY_SQL = """
MERGE INTO novendor_1.historyrhymes.signals_raw AS tgt
USING (
    SELECT
        c.as_of_date,
        'cpi_yoy' AS signal_name,
        'global' AS asset_scope,
        (c.value / prev.value - 1) AS value,
        'derived:cpi_index' AS source
    FROM novendor_1.historyrhymes.signals_raw c
    INNER JOIN novendor_1.historyrhymes.signals_raw prev
        ON prev.signal_name = 'cpi_index'
        AND prev.asset_scope = c.asset_scope
        AND prev.as_of_date = add_months(c.as_of_date, -12)
    WHERE c.signal_name = 'cpi_index'
) AS src
ON tgt.as_of_date = src.as_of_date
    AND tgt.signal_name = src.signal_name
    AND tgt.asset_scope = src.asset_scope
WHEN MATCHED THEN UPDATE SET tgt.value = src.value, tgt.source = src.source, tgt.loaded_at = current_timestamp()
WHEN NOT MATCHED THEN INSERT (as_of_date, signal_name, asset_scope, value, source) VALUES (src.as_of_date, src.signal_name, src.asset_scope, src.value, src.source)
"""

# Step 2: Compute features with date-based windows
# Uses RANGE BETWEEN INTERVAL which handles gaps in monthly/weekly data correctly
FEATURE_SQL = """
MERGE INTO novendor_1.historyrhymes.signals_featured AS tgt
USING (
    WITH base AS (
        SELECT
            as_of_date,
            signal_name,
            asset_scope,
            value,
            loaded_at,
            -- 1-year rolling stats (date-based, handles gaps)
            AVG(value) OVER w1y AS mean_1y,
            STDDEV(value) OVER w1y AS std_1y,
            -- 2-year rolling stats
            AVG(value) OVER w2y AS mean_2y,
            STDDEV(value) OVER w2y AS std_2y,
            -- Lagged values for deltas (approximate: nearest row within window)
            LAG(value, 1) OVER (PARTITION BY signal_name, asset_scope ORDER BY as_of_date) AS prev_value,
            FIRST_VALUE(value) OVER (
                PARTITION BY signal_name, asset_scope
                ORDER BY as_of_date
                RANGE BETWEEN INTERVAL 7 DAYS PRECEDING AND INTERVAL 5 DAYS PRECEDING
            ) AS value_1w_ago,
            FIRST_VALUE(value) OVER (
                PARTITION BY signal_name, asset_scope
                ORDER BY as_of_date
                RANGE BETWEEN INTERVAL 30 DAYS PRECEDING AND INTERVAL 28 DAYS PRECEDING
            ) AS value_1m_ago,
            -- Percentile rank over 2 years
            PERCENT_RANK() OVER w2y_rank AS pct_rank_2y
        FROM novendor_1.historyrhymes.signals_raw
        WHERE signal_name != 'cpi_index'  -- Use cpi_yoy instead
        WINDOW
            w1y AS (PARTITION BY signal_name, asset_scope ORDER BY as_of_date RANGE BETWEEN INTERVAL 365 DAYS PRECEDING AND CURRENT ROW),
            w2y AS (PARTITION BY signal_name, asset_scope ORDER BY as_of_date RANGE BETWEEN INTERVAL 730 DAYS PRECEDING AND CURRENT ROW),
            w2y_rank AS (PARTITION BY signal_name, asset_scope ORDER BY value RANGE BETWEEN INTERVAL 730 DAYS PRECEDING AND CURRENT ROW)
    )
    SELECT
        as_of_date,
        signal_name,
        asset_scope,
        value,
        CASE WHEN std_1y > 0.0001 THEN (value - mean_1y) / std_1y ELSE 0 END AS zscore_1y,
        CASE WHEN std_2y > 0.0001 THEN (value - mean_2y) / std_2y ELSE 0 END AS zscore_2y,
        value - value_1w_ago AS delta_1w,
        value - value_1m_ago AS delta_1m,
        pct_rank_2y AS percentile_2y,
        TIMESTAMPDIFF(HOUR, loaded_at, current_timestamp()) AS freshness_hours,
        CASE WHEN TIMESTAMPDIFF(HOUR, loaded_at, current_timestamp()) > 24 THEN true ELSE false END AS is_stale
    FROM base
    WHERE as_of_date >= date_sub(current_date(), 730)  -- Keep 2 years of featured data
) AS src
ON tgt.as_of_date = src.as_of_date
    AND tgt.signal_name = src.signal_name
    AND tgt.asset_scope = src.asset_scope
WHEN MATCHED THEN UPDATE SET
    tgt.value = src.value,
    tgt.zscore_1y = src.zscore_1y,
    tgt.zscore_2y = src.zscore_2y,
    tgt.delta_1w = src.delta_1w,
    tgt.delta_1m = src.delta_1m,
    tgt.percentile_2y = src.percentile_2y,
    tgt.freshness_hours = src.freshness_hours,
    tgt.is_stale = src.is_stale
WHEN NOT MATCHED THEN INSERT *
"""


def main(client: Optional[DatabricksClient] = None):
    owns_warehouse = client is None
    if owns_warehouse:
        client = DatabricksClient()
        print("Starting warehouse...")
        client.start_warehouse()
        client.wait_for_warehouse("RUNNING")

    # Step 1: Derive CPI YoY from index
    print("Computing CPI YoY from index...")
    result = client.execute_sql(CPI_YOY_SQL)
    status = result.get("status", {}).get("state", "UNKNOWN")
    print(f"  CPI YoY derivation: {status}")

    # Step 2: Compute all features
    print("Computing features (MERGE INTO signals_featured)...")
    result = client.execute_sql(FEATURE_SQL)
    status = result.get("status", {}).get("state", "UNKNOWN")
    print(f"  Feature computation: {status}")

    # Show latest snapshot
    print("\nLatest featured signals:")
    result = client.execute_sql("""
        SELECT signal_name, as_of_date, ROUND(value, 4) AS val,
               ROUND(zscore_1y, 2) AS z1y,
               ROUND(delta_1w, 4) AS d1w,
               ROUND(percentile_2y, 2) AS pct,
               ROUND(freshness_hours, 1) AS fresh_h,
               is_stale
        FROM novendor_1.historyrhymes.signals_featured
        WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.signals_featured)
        ORDER BY signal_name
    """)
    row_count = 0
    for row in result.get("result", {}).get("data_array", []):
        stale_flag = " [STALE]" if row[7] else ""
        print(f"  {row[0]}: val={row[2]}, z={row[3]}, d1w={row[4]}, pct={row[5]}, fresh={row[6]}h{stale_flag}")
        row_count += 1

    if owns_warehouse:
        print("\nStopping warehouse...")
        client.stop_warehouse()

    print("Done.")
    return {"row_count": row_count}


if __name__ == "__main__":
    main()
