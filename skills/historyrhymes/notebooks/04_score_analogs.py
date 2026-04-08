"""Score current market state against historical episode signal vectors.

Returns top-3 matches (not just top-1) with proper NULL handling.

Fixes applied:
  - Top 3 analogs returned, not just 1
  - NULL dimensions excluded from both numerator and denominator
  - Euclidean distance explicitly labeled as Phase 1 proxy
  - Scenario probs tied to analog score, not just regime confidence
  - Accepts optional DatabricksClient for pipeline orchestration

Phase 2 upgrade path:
  - Replace hardcoded reference vectors with pgvector HNSW search
  - Add DTW component to scoring
  - Add permutation testing (null distribution)

Usage:
    python -m skills.historyrhymes.notebooks.04_score_analogs
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from databricks_client import DatabricksClient


SCORE_SQL = """
WITH current_state AS (
    SELECT signal_name, zscore_1y
    FROM novendor_1.historyrhymes.signals_featured
    WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.signals_featured)
),
current_regime AS (
    SELECT regime_label, regime_confidence, signal_agreement_score
    FROM novendor_1.historyrhymes.market_state_daily
    WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.market_state_daily)
    LIMIT 1
),
current_vector AS (
    SELECT
        MAX(CASE WHEN signal_name = 'yield_curve_10y2y' THEN zscore_1y END) AS yc_z,
        MAX(CASE WHEN signal_name = 'cpi_yoy' THEN zscore_1y END) AS cpi_z,
        MAX(CASE WHEN signal_name = 'hy_credit_spread' THEN zscore_1y END) AS spread_z,
        MAX(CASE WHEN signal_name = 'initial_claims' THEN zscore_1y END) AS claims_z,
        MAX(CASE WHEN signal_name = 'housing_starts_saar' THEN zscore_1y END) AS housing_z,
        MAX(CASE WHEN signal_name = 'vix_spot' THEN zscore_1y END) AS vix_z,
        MAX(CASE WHEN signal_name = 'btc_price_usd' THEN zscore_1y END) AS btc_z
    FROM current_state
),
-- Episode reference vectors (Phase 1: hardcoded; Phase 2: read from Supabase episode_signals)
episode_refs AS (
    SELECT * FROM (VALUES
        ('2022 Luna/3AC/FTX Crypto Contagion', -0.8, 2.1, 1.2, -0.3, -0.5, 1.8, -1.8, 'deflationary_deleveraging'),
        ('2007-2009 Global Financial Crisis', 0.1, 0.5, 0.8, -0.2, -1.2, 0.6, NULL, 'deflationary_deleveraging'),
        ('1970s Stagflation Cycle', NULL, 2.5, 0.3, 0.8, -0.8, NULL, NULL, 'inflationary'),
        ('2020 COVID Crash', 0.3, -0.1, -0.3, -0.5, 0.8, 3.5, -1.5, 'crisis'),
        ('1998 LTCM Crisis', 0.4, -0.2, 1.5, -0.3, 0.2, 1.2, NULL, 'crisis'),
        ('2017-2018 ICO Bubble', NULL, NULL, NULL, NULL, NULL, NULL, -2.0, 'crisis'),
        ('2011 Debt Ceiling Crisis', 0.8, 0.1, 0.4, -0.1, -0.3, 1.4, NULL, 'crisis'),
        ('2016 Brexit Shock', 0.5, 0.0, 0.2, -0.1, 0.1, 0.8, NULL, 'crisis')
    ) AS t(name, yc_z, cpi_z, spread_z, claims_z, housing_z, vix_z, btc_z, regime_type)
),
distances AS (
    SELECT
        e.name,
        e.regime_type,
        -- Euclidean distance excluding NULL dimensions from BOTH sides
        -- dim_count tracks how many dimensions are compared
        SQRT(
            COALESCE(CASE WHEN c.yc_z IS NOT NULL AND e.yc_z IS NOT NULL THEN POW(c.yc_z - e.yc_z, 2) END, 0) +
            COALESCE(CASE WHEN c.cpi_z IS NOT NULL AND e.cpi_z IS NOT NULL THEN POW(c.cpi_z - e.cpi_z, 2) END, 0) +
            COALESCE(CASE WHEN c.spread_z IS NOT NULL AND e.spread_z IS NOT NULL THEN POW(c.spread_z - e.spread_z, 2) END, 0) +
            COALESCE(CASE WHEN c.claims_z IS NOT NULL AND e.claims_z IS NOT NULL THEN POW(c.claims_z - e.claims_z, 2) END, 0) +
            COALESCE(CASE WHEN c.housing_z IS NOT NULL AND e.housing_z IS NOT NULL THEN POW(c.housing_z - e.housing_z, 2) END, 0) +
            COALESCE(CASE WHEN c.vix_z IS NOT NULL AND e.vix_z IS NOT NULL THEN POW(c.vix_z - e.vix_z, 2) END, 0) +
            COALESCE(CASE WHEN c.btc_z IS NOT NULL AND e.btc_z IS NOT NULL THEN POW(c.btc_z - e.btc_z, 2) END, 0)
        ) AS raw_dist,
        -- Count matched dimensions for normalization
        (
            CASE WHEN c.yc_z IS NOT NULL AND e.yc_z IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.cpi_z IS NOT NULL AND e.cpi_z IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.spread_z IS NOT NULL AND e.spread_z IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.claims_z IS NOT NULL AND e.claims_z IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.housing_z IS NOT NULL AND e.housing_z IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.vix_z IS NOT NULL AND e.vix_z IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.btc_z IS NOT NULL AND e.btc_z IS NOT NULL THEN 1 ELSE 0 END
        ) AS dim_count,
        -- Categorical match
        CASE
            WHEN e.regime_type = cr.regime_label THEN 0.8
            WHEN e.regime_type LIKE '%deleveraging%' AND cr.regime_label LIKE '%tightening%' THEN 0.6
            WHEN e.regime_type = 'crisis' THEN 0.4
            ELSE 0.3
        END AS categorical_match
    FROM current_vector c
    CROSS JOIN episode_refs e
    CROSS JOIN current_regime cr
),
scored AS (
    SELECT
        name,
        regime_type,
        raw_dist,
        dim_count,
        categorical_match,
        -- Normalize distance by dimension count, then convert to similarity
        CASE WHEN dim_count > 0
            THEN 0.6 * GREATEST(0, 1 - (raw_dist / SQRT(dim_count)) / 3.0)  -- structural similarity
               + 0.3 * GREATEST(0, 1 - raw_dist / (dim_count * 1.5))         -- path proxy
               + 0.1 * categorical_match                                       -- categorical
            ELSE 0.1 * categorical_match
        END AS analog_score,
        ROW_NUMBER() OVER (ORDER BY
            CASE WHEN dim_count > 0
                THEN 0.6 * GREATEST(0, 1 - (raw_dist / SQRT(dim_count)) / 3.0)
                   + 0.3 * GREATEST(0, 1 - raw_dist / (dim_count * 1.5))
                   + 0.1 * categorical_match
                ELSE 0.1 * categorical_match
            END DESC
        ) AS rank
    FROM distances
    WHERE dim_count >= 3  -- Require at least 3 overlapping dimensions
),
top3 AS (
    SELECT * FROM scored WHERE rank <= 3
)
-- Write top-1 to history_rhymes_daily (top 2+3 go to divergence fields)
MERGE INTO novendor_1.historyrhymes.history_rhymes_daily AS tgt
USING (
    SELECT
        current_date() AS as_of_date,
        'global' AS scope,
        (SELECT name FROM top3 WHERE rank = 1) AS top_analog_name,
        (SELECT ROUND(analog_score, 4) FROM top3 WHERE rank = 1) AS top_analog_score,
        -- Scenario probs: blend regime confidence with analog score
        ROUND(CASE
            WHEN cr.regime_label LIKE '%tightening%' THEN 0.12 + (1 - COALESCE((SELECT analog_score FROM top3 WHERE rank = 1), 0.5)) * 0.12
            ELSE 0.22 + COALESCE((SELECT analog_score FROM top3 WHERE rank = 1), 0.5) * 0.08
        END, 4) AS bull_prob,
        0.50 AS base_prob,
        ROUND(CASE
            WHEN cr.regime_label LIKE '%tightening%' THEN 0.28 + COALESCE((SELECT analog_score FROM top3 WHERE rank = 1), 0.5) * 0.10
            ELSE 0.18 + (1 - COALESCE((SELECT analog_score FROM top3 WHERE rank = 1), 0.5)) * 0.10
        END, 4) AS bear_prob,
        ROUND(cr.regime_confidence, 4) AS confidence_score,
        CASE WHEN cr.signal_agreement_score < 0.4 THEN true ELSE false END AS trap_flag,
        CASE WHEN cr.signal_agreement_score < 0.4 THEN 'Low signal agreement — mixed regime' ELSE NULL END AS trap_reason,
        (SELECT name || ' (score=' || ROUND(analog_score, 2) || ')' FROM top3 WHERE rank = 1) AS key_similarity_1,
        (SELECT name || ' (score=' || ROUND(analog_score, 2) || ')' FROM top3 WHERE rank = 2) AS key_similarity_2,
        (SELECT name || ' (score=' || ROUND(analog_score, 2) || ')' FROM top3 WHERE rank = 3) AS key_divergence_1,
        'Regime: ' || cr.regime_label || ' (conf=' || ROUND(cr.regime_confidence, 2) || ')' AS key_divergence_2
    FROM current_regime cr
) AS src
ON tgt.as_of_date = src.as_of_date AND tgt.scope = src.scope
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
"""


def main(client: Optional[DatabricksClient] = None):
    owns_warehouse = client is None
    if owns_warehouse:
        client = DatabricksClient()
        print("Starting warehouse...")
        client.start_warehouse()
        client.wait_for_warehouse("RUNNING")

    print("Scoring analogs (top 3)...")
    result = client.execute_sql(SCORE_SQL)
    status = result.get("status", {}).get("state", "UNKNOWN")
    print(f"  Status: {status}")

    print("\nLatest analog scores:")
    result = client.execute_sql("""
        SELECT as_of_date, top_analog_name, ROUND(top_analog_score, 3),
               ROUND(bull_prob, 2), ROUND(base_prob, 2), ROUND(bear_prob, 2),
               trap_flag, trap_reason,
               key_similarity_1, key_similarity_2, key_divergence_1
        FROM novendor_1.historyrhymes.history_rhymes_daily
        WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.history_rhymes_daily)
    """)
    for row in result.get("result", {}).get("data_array", []):
        print(f"  {row[0]}: #{1} {row[1]} (score={row[2]})")
        print(f"    Bull={row[3]} Base={row[4]} Bear={row[5]}")
        if row[6]:
            print(f"    TRAP: {row[7]}")
        print(f"    #2: {row[8]}")
        print(f"    #3: {row[9]}")
        if row[10]:
            print(f"    Divergence: {row[10]}")

    if owns_warehouse:
        print("\nStopping warehouse...")
        client.stop_warehouse()

    print("Done.")


if __name__ == "__main__":
    main()
