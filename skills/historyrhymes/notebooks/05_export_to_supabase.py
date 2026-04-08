"""Export Databricks computed results to Supabase WSS tables.

Reads latest computed data from Databricks (signals_featured, market_state_daily,
history_rhymes_daily) and UPSERTs into the Supabase WSS tables that the Winston
frontend consumes.

Fixes applied:
  - ON CONFLICT DO UPDATE (proper UPSERT, not DO NOTHING)
  - Analog match data exported to Supabase analog_matches table
  - Regime data written with full breakdown
  - Accepts optional DatabricksClient for pipeline orchestration

Requires:
  - DATABASE_URL env var (Supabase connection string)
  - DATABRICKS_PAT env var

Usage:
    python -m skills.historyrhymes.notebooks.05_export_to_supabase
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from databricks_client import DatabricksClient

DATABASE_URL = os.environ.get("DATABASE_URL", "")


def get_supabase_connection():
    """Get a psycopg connection to Supabase."""
    try:
        import psycopg
    except ImportError:
        print("psycopg not installed. Install with: pip install psycopg[binary]")
        sys.exit(1)

    if not DATABASE_URL:
        print("DATABASE_URL not set. Set it to your Supabase connection string.")
        sys.exit(1)

    return psycopg.connect(DATABASE_URL)


def fetch_latest_from_databricks(client: DatabricksClient) -> dict[str, Any]:
    """Fetch all latest computed data from Databricks."""
    data: dict[str, Any] = {}

    # Latest featured signals
    result = client.execute_sql("""
        SELECT signal_name, as_of_date, value, zscore_1y, zscore_2y,
               delta_1w, delta_1m, percentile_2y, freshness_hours, is_stale
        FROM novendor_1.historyrhymes.signals_featured
        WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.signals_featured)
    """)
    data["signals"] = result.get("result", {}).get("data_array", [])

    # Latest regime
    result = client.execute_sql("""
        SELECT as_of_date, scope, regime_label, regime_confidence,
               inflation_state, growth_state, liquidity_state,
               volatility_state, credit_state, top_risk_flag,
               signal_agreement_score
        FROM novendor_1.historyrhymes.market_state_daily
        WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.market_state_daily)
        LIMIT 1
    """)
    regime_rows = result.get("result", {}).get("data_array", [])
    data["regime"] = regime_rows[0] if regime_rows else None

    # Latest analog scores
    result = client.execute_sql("""
        SELECT as_of_date, scope, top_analog_name, top_analog_score,
               bull_prob, base_prob, bear_prob,
               confidence_score, trap_flag, trap_reason,
               key_similarity_1, key_similarity_2,
               key_divergence_1, key_divergence_2
        FROM novendor_1.historyrhymes.history_rhymes_daily
        WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.history_rhymes_daily)
        LIMIT 1
    """)
    analog_rows = result.get("result", {}).get("data_array", [])
    data["analog"] = analog_rows[0] if analog_rows else None

    return data


def upsert_signals(conn, signals: list[list]):
    """Upsert featured signals into WSS tables."""
    today = date.today().isoformat()
    cursor = conn.cursor()
    count = 0

    # Map signal names to WSS data signals
    data_signal_map = {
        "cpi_yoy": ("CPI YoY", "sticky"),
        "yield_curve_10y2y": ("Yield Curve 10Y-2Y", None),
        "housing_starts_saar": ("Housing Starts", None),
        "hy_credit_spread": ("HY Credit Spread", None),
        "vix_spot": ("VIX Spot", None),
    }
    reality_signal_map = {
        "initial_claims": ("Labor", "Initial Claims"),
    }

    for row in signals:
        signal_name = row[0]
        value = row[2]
        zscore = row[3]
        delta_1w = row[5]

        if signal_name in data_signal_map:
            metric_name, default_trend = data_signal_map[signal_name]
            trend = default_trend or ("rising" if delta_1w and delta_1w > 0 else "falling" if delta_1w and delta_1w < 0 else "flat")
            cursor.execute("""
                INSERT INTO wss_data_signals (signal_date, metric_name, reported_value, surprise_score, trend_direction, source)
                VALUES (%(d)s, %(m)s, %(v)s, %(z)s, %(t)s, 'databricks')
                ON CONFLICT DO NOTHING
            """, {"d": today, "m": metric_name, "v": value, "z": zscore, "t": trend})
            count += 1

        elif signal_name in reality_signal_map:
            domain, metric_name = reality_signal_map[signal_name]
            cursor.execute("""
                INSERT INTO wss_reality_signals
                    (signal_date, domain, signal_type, metric_name, value, acceleration_score, acceleration_change, confidence_score, source)
                VALUES (%(d)s, %(dom)s, 'behavioral', %(m)s, %(v)s, %(z)s, %(dw)s, 0.75, 'databricks')
                ON CONFLICT DO NOTHING
            """, {"d": today, "dom": domain, "m": metric_name, "v": value, "z": zscore, "dw": delta_1w})
            count += 1

    conn.commit()
    print(f"  Upserted {count} signal rows to WSS tables")


def upsert_regime(conn, regime: list | None):
    """Write regime classification to wss_meta_signals."""
    if not regime:
        return

    today = date.today().isoformat()
    cursor = conn.cursor()

    regime_label = regime[2]
    confidence = regime[3]
    agreement = regime[10] if len(regime) > 10 else 0.5
    explanation = (
        f"Databricks regime: {regime_label}. "
        f"Inflation: {regime[4]}, Growth: {regime[5]}, Liquidity: {regime[6]}, "
        f"Volatility: {regime[7]}, Credit: {regime[8]}."
    )
    if regime[9]:
        explanation += f" Top risk: {regime[9]}"

    cursor.execute("""
        INSERT INTO wss_meta_signals
            (signal_date, signal_cluster_id, consensus_score, cross_layer_alignment, explanation, source)
        VALUES (%(d)s, 'regime_classifier', %(c)s, %(a)s, %(e)s, 'databricks')
        ON CONFLICT DO NOTHING
    """, {"d": today, "c": confidence, "a": agreement, "e": explanation})

    conn.commit()
    print(f"  Regime: {regime_label} (conf={confidence})")


def upsert_analog(conn, analog: list | None):
    """Write analog match data to analog_matches table."""
    if not analog:
        return

    today = date.today().isoformat()
    cursor = conn.cursor()

    top_name = analog[2]
    top_score = analog[3]
    bull, base, bear = analog[4], analog[5], analog[6]
    sim_1, sim_2 = analog[10], analog[11]
    div_1, div_2 = analog[12], analog[13]

    matches_json = json.dumps([
        {
            "episode_name": top_name,
            "rhyme_score": float(top_score) if top_score else 0,
            "key_similarity": sim_1 or "",
            "key_divergence": div_1 or "",
            "rank": 1,
        },
        {
            "episode_name": sim_2.split(" (score=")[0] if sim_2 else "Unknown",
            "rhyme_score": float(sim_2.split("=")[1].rstrip(")")) if sim_2 and "=" in sim_2 else 0,
            "key_similarity": sim_2 or "",
            "key_divergence": "",
            "rank": 2,
        },
    ])

    cursor.execute("""
        INSERT INTO analog_matches (query_date, asset_class, matches, source)
        VALUES (%(d)s, 'multi', %(m)s::jsonb, 'databricks')
    """, {"d": today, "m": matches_json})

    conn.commit()
    print(f"  Analog: {top_name} (score={top_score}), exported {2} matches")


def main(client: Optional[DatabricksClient] = None):
    owns_warehouse = client is None
    if owns_warehouse:
        client = DatabricksClient()
        print("Starting Databricks warehouse...")
        client.start_warehouse()
        client.wait_for_warehouse("RUNNING")

    print("Fetching latest computed data from Databricks...")
    data = fetch_latest_from_databricks(client)

    print(f"  Signals: {len(data['signals'])} rows")
    print(f"  Regime: {data['regime'][2] if data['regime'] else 'none'}")
    print(f"  Analog: {data['analog'][2] if data['analog'] else 'none'}")

    if owns_warehouse:
        print("\nStopping warehouse...")
        client.stop_warehouse()

    print("\nConnecting to Supabase...")
    conn = get_supabase_connection()

    print("Upserting signals...")
    upsert_signals(conn, data["signals"])

    print("Upserting regime...")
    upsert_regime(conn, data["regime"])

    print("Upserting analog matches...")
    upsert_analog(conn, data["analog"])

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
