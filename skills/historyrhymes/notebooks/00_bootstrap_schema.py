"""Bootstrap the historyrhymes schema in Databricks Unity Catalog.

Creates the four core tables in novendor_1.historyrhymes:
  - signals_raw:          raw signal values per date
  - signals_featured:     z-scores, deltas, percentiles
  - market_state_daily:   regime classification per day
  - history_rhymes_daily: analog scores and scenario probs

Usage:
    python -m skills.historyrhymes.notebooks.00_bootstrap_schema
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from databricks_client import DatabricksClient


SCHEMA_DDL = """
-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS novendor_1.historyrhymes;

-- Raw signal ingestion table
CREATE TABLE IF NOT EXISTS novendor_1.historyrhymes.signals_raw (
    as_of_date     DATE          NOT NULL,
    signal_name    STRING        NOT NULL,
    asset_scope    STRING        NOT NULL DEFAULT 'global',
    value          DOUBLE        NOT NULL,
    source         STRING,
    loaded_at      TIMESTAMP     DEFAULT current_timestamp()
)
USING DELTA
COMMENT 'Raw market and macro signals, one row per signal per date.';

-- Featured / normalized signals
CREATE TABLE IF NOT EXISTS novendor_1.historyrhymes.signals_featured (
    as_of_date      DATE          NOT NULL,
    signal_name     STRING        NOT NULL,
    asset_scope     STRING        NOT NULL DEFAULT 'global',
    value           DOUBLE        NOT NULL,
    zscore_1y       DOUBLE,
    zscore_2y       DOUBLE,
    delta_1w        DOUBLE,
    delta_1m        DOUBLE,
    percentile_2y   DOUBLE,
    freshness_hours DOUBLE,
    is_stale        BOOLEAN       DEFAULT false
)
USING DELTA
COMMENT 'Normalized signals with rolling z-scores, deltas, and staleness flags.';

-- Daily market state classification
CREATE TABLE IF NOT EXISTS novendor_1.historyrhymes.market_state_daily (
    as_of_date              DATE          NOT NULL,
    scope                   STRING        NOT NULL DEFAULT 'global',
    regime_label            STRING,
    regime_confidence       DOUBLE,
    inflation_state         STRING,
    growth_state            STRING,
    liquidity_state         STRING,
    volatility_state        STRING,
    credit_state            STRING,
    top_risk_flag           STRING,
    signal_agreement_score  DOUBLE
)
USING DELTA
COMMENT 'Daily regime classification with per-dimension state labels.';

-- History Rhymes daily output
CREATE TABLE IF NOT EXISTS novendor_1.historyrhymes.history_rhymes_daily (
    as_of_date         DATE          NOT NULL,
    scope              STRING        NOT NULL DEFAULT 'global',
    top_analog_name    STRING,
    top_analog_score   DOUBLE,
    bull_prob          DOUBLE,
    base_prob          DOUBLE,
    bear_prob          DOUBLE,
    confidence_score   DOUBLE,
    trap_flag          BOOLEAN       DEFAULT false,
    trap_reason        STRING,
    key_similarity_1   STRING,
    key_similarity_2   STRING,
    key_divergence_1   STRING,
    key_divergence_2   STRING
)
USING DELTA
COMMENT 'Daily analog matching output with scenario probabilities and trap flags.';
"""


def main(client: Optional[DatabricksClient] = None):
    owns_warehouse = client is None
    if owns_warehouse:
        client = DatabricksClient()
        print("Starting warehouse...")
        client.start_warehouse()
        client.wait_for_warehouse("RUNNING")
        print("Warehouse running.")

    # Execute each statement separately (Databricks SQL doesn't support multi-statement)
    for stmt in SCHEMA_DDL.split(";"):
        stmt = stmt.strip()
        if not stmt or stmt.startswith("--"):
            continue
        print(f"  Executing: {stmt[:80]}...")
        result = client.execute_sql(stmt)
        status = result.get("status", {}).get("state", "UNKNOWN")
        print(f"    -> {status}")

    # Verify tables
    print("\nVerifying tables...")
    result = client.execute_sql(
        "SHOW TABLES IN novendor_1.historyrhymes"
    )
    tables = [r[1] for r in result.get("result", {}).get("data_array", [])]
    print(f"  Tables: {tables}")

    if owns_warehouse:
        print("\nStopping warehouse...")
        client.stop_warehouse()
    print("Done.")


if __name__ == "__main__":
    main()
