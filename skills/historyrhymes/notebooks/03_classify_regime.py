"""Rules-based regime classifier using featured signals.

Reads latest row per signal from signals_featured, applies rule set,
writes one row per day to market_state_daily.

Fixes applied:
  - VIX used directly for volatility_state (not BTC proxy)
  - CPI uses cpi_yoy (derived YoY rate, not raw index)
  - Accepts optional DatabricksClient for pipeline orchestration

Regime labels:
  - late_cycle_tightening:  yield curve inverted + inflation z > 1 + spreads widening
  - stress_transition:      VIX elevated + spreads blowing out + claims rising
  - disinflation_recovery:  inflation falling + liquidity improving
  - risk_on_expansion:      growth positive + spreads tight + vol low
  - range_bound:            mixed signals, no dominant pattern

Confidence = (agreeing signals) / (total relevant signals)

Usage:
    python -m skills.historyrhymes.notebooks.03_classify_regime
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from databricks_client import DatabricksClient


CLASSIFY_SQL = """
WITH latest AS (
    SELECT signal_name, value, zscore_1y, delta_1w
    FROM novendor_1.historyrhymes.signals_featured
    WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.signals_featured)
),
pivoted AS (
    SELECT
        MAX(CASE WHEN signal_name = 'yield_curve_10y2y' THEN value END) AS yc_value,
        MAX(CASE WHEN signal_name = 'yield_curve_10y2y' THEN zscore_1y END) AS yc_z,
        MAX(CASE WHEN signal_name = 'cpi_yoy' THEN zscore_1y END) AS cpi_z,
        MAX(CASE WHEN signal_name = 'hy_credit_spread' THEN zscore_1y END) AS spread_z,
        MAX(CASE WHEN signal_name = 'hy_credit_spread' THEN delta_1w END) AS spread_delta,
        MAX(CASE WHEN signal_name = 'initial_claims' THEN zscore_1y END) AS claims_z,
        MAX(CASE WHEN signal_name = 'initial_claims' THEN delta_1w END) AS claims_delta,
        MAX(CASE WHEN signal_name = 'housing_starts_saar' THEN zscore_1y END) AS housing_z,
        MAX(CASE WHEN signal_name = 'vix_spot' THEN zscore_1y END) AS vix_z,
        MAX(CASE WHEN signal_name = 'vix_spot' THEN value END) AS vix_value,
        MAX(CASE WHEN signal_name = 'btc_price_usd' THEN zscore_1y END) AS btc_z
    FROM latest
),
classified AS (
    SELECT
        current_date() AS as_of_date,
        'global' AS scope,
        -- Regime classification
        CASE
            WHEN yc_value < 0 AND cpi_z > 1.0 AND spread_z > 0.5
                THEN 'late_cycle_tightening'
            WHEN (vix_z > 1.5 OR vix_value > 30) AND spread_z > 1.5 AND claims_z > 1.0
                THEN 'stress_transition'
            WHEN cpi_z < -0.5 AND spread_z < 0
                THEN 'disinflation_recovery'
            WHEN housing_z > 0 AND spread_z < -0.5 AND claims_z < 0 AND vix_z < 0
                THEN 'risk_on_expansion'
            ELSE 'range_bound'
        END AS regime_label,
        -- Confidence: count signals supporting the dominant pattern
        -- Each signal that agrees adds 1/7 to confidence
        (
            CASE WHEN yc_value < 0 THEN 1 ELSE 0 END +
            CASE WHEN cpi_z > 0.5 THEN 1 ELSE 0 END +
            CASE WHEN spread_z > 0.3 THEN 1 ELSE 0 END +
            CASE WHEN claims_z > 0.3 THEN 1 ELSE 0 END +
            CASE WHEN housing_z < 0 THEN 1 ELSE 0 END +
            CASE WHEN vix_z > 0 THEN 1 ELSE 0 END +
            CASE WHEN btc_z < 0 THEN 1 ELSE 0 END
        ) / 7.0 AS regime_confidence,
        -- Per-dimension state labels
        CASE
            WHEN cpi_z > 1.0 THEN 'sticky'
            WHEN cpi_z > 0 THEN 'elevated'
            WHEN cpi_z < -0.5 THEN 'falling'
            ELSE 'stable'
        END AS inflation_state,
        CASE
            WHEN housing_z > 0.5 THEN 'expanding'
            WHEN housing_z < -0.5 THEN 'contracting'
            ELSE 'flat'
        END AS growth_state,
        CASE
            WHEN spread_z < -0.5 THEN 'loose'
            WHEN spread_z > 1.0 THEN 'tightening'
            ELSE 'neutral'
        END AS liquidity_state,
        CASE
            WHEN vix_z > 1.5 OR vix_value > 30 THEN 'elevated'
            WHEN vix_z > 0.5 THEN 'above_avg'
            ELSE 'normal'
        END AS volatility_state,
        CASE
            WHEN spread_z > 1.0 THEN 'stress'
            WHEN spread_z > 0.3 THEN 'widening'
            ELSE 'tight'
        END AS credit_state,
        -- Top risk flag
        CASE
            WHEN spread_delta > 0 AND claims_delta > 0 THEN 'credit+labor deterioration'
            WHEN spread_z > 1.5 THEN 'credit stress'
            WHEN claims_z > 1.5 THEN 'labor weakness'
            WHEN vix_z > 2.0 THEN 'volatility spike'
            ELSE NULL
        END AS top_risk_flag,
        -- Signal agreement score (same as confidence for now)
        (
            CASE WHEN yc_value < 0 THEN 1 ELSE 0 END +
            CASE WHEN cpi_z > 0.5 THEN 1 ELSE 0 END +
            CASE WHEN spread_z > 0.3 THEN 1 ELSE 0 END +
            CASE WHEN claims_z > 0.3 THEN 1 ELSE 0 END +
            CASE WHEN housing_z < 0 THEN 1 ELSE 0 END +
            CASE WHEN vix_z > 0 THEN 1 ELSE 0 END +
            CASE WHEN btc_z < 0 THEN 1 ELSE 0 END
        ) / 7.0 AS signal_agreement_score
    FROM pivoted
)
MERGE INTO novendor_1.historyrhymes.market_state_daily AS tgt
USING classified AS src
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

    print("Classifying regime...")
    result = client.execute_sql(CLASSIFY_SQL)
    status = result.get("status", {}).get("state", "UNKNOWN")
    print(f"  Status: {status}")

    print("\nLatest regime:")
    result = client.execute_sql("""
        SELECT as_of_date, regime_label, ROUND(regime_confidence, 2),
               inflation_state, growth_state, liquidity_state,
               volatility_state, credit_state, top_risk_flag
        FROM novendor_1.historyrhymes.market_state_daily
        WHERE as_of_date = (SELECT MAX(as_of_date) FROM novendor_1.historyrhymes.market_state_daily)
    """)
    for row in result.get("result", {}).get("data_array", []):
        print(f"  {row[0]}: {row[1]} (conf={row[2]})")
        print(f"    inflation={row[3]}, growth={row[4]}, liquidity={row[5]}")
        print(f"    volatility={row[6]}, credit={row[7]}")
        if row[8]:
            print(f"    TOP RISK: {row[8]}")

    if owns_warehouse:
        print("\nStopping warehouse...")
        client.stop_warehouse()

    print("Done.")


if __name__ == "__main__":
    main()
