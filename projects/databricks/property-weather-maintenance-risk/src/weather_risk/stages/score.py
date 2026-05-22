"""Stage 06 — score and visualize.

Local path: `build_prediction_rows` is the canonical, parity-gated scoring
contract — its output drives `gold_property_maintenance_risk_predictions.csv`.
Logic is unchanged from the original `pipeline._prediction_rows`. Chart
rendering for the local path is handled by the runner (1x1 PNG placeholders);
the Spark notebook renders real charts.
Spark path: the equivalent risk-score DataFrame transform.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..config import WeatherRiskConfig


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_prediction_rows(
    features: list[dict[str, Any]], run_id: str
) -> list[dict[str, Any]]:
    """Build the gold prediction rows from feature rows.

    Parity-critical: this is the original `pipeline._prediction_rows` logic
    moved verbatim. Do not change the arithmetic.
    """
    sorted_features = sorted(
        features,
        key=lambda row: (
            row["work_order_surge_14d_flag"],
            row["inspection_failure_flag"],
            row["vendor_capacity_risk"],
            row["weather_sensitivity"],
            row["work_orders_prior_90d"],
        ),
        reverse=True,
    )
    predictions: list[dict[str, Any]] = []
    for rank, row in enumerate(sorted_features, start=1):
        risk_score = min(
            0.99,
            0.08
            + row["weather_sensitivity"] * 0.42
            + row["work_orders_prior_90d"] / 160
            + row["emergency_work_orders_prior_90d"] / 45
            + row["resident_impact_incident_count"] / 25
            + max(0, 0.75 - row["vendor_capacity_index"]) * 0.35,
        )
        predictions.append(
            {
                "run_id": run_id,
                "property_id": row["property_id"],
                "county_fips": row["county_fips"],
                "state": row["state"],
                "market": row["market"],
                "work_order_surge_probability": round(risk_score, 4),
                "work_order_surge_prediction": int(risk_score >= 0.55),
                "inspection_failure_probability": round(
                    min(0.95, max(0.05, (85 - row["last_inspection_score"]) / 40)), 4
                ),
                "inspection_failure_prediction": row["inspection_failure_flag"],
                "make_ready_delay_prediction_days": row["make_ready_delay_days"],
                "emergency_maintenance_probability": round(
                    min(0.95, row["emergency_work_orders_prior_90d"] / 20), 4
                ),
                "resident_impact_probability": round(
                    min(0.95, row["resident_impact_incident_count"] / 12), 4
                ),
                "risk_score": round(risk_score, 4),
                "risk_rank": rank,
                "model_version_or_uri": "local-contract-baseline-v1",
                "scored_at": _utc_now(),
                "synthetic_data": True,
            }
        )
    return predictions


def run(
    config: WeatherRiskConfig,
    features: list[dict[str, Any]],
    run_id: str,
) -> list[dict[str, Any]]:
    """Local score stage: build prediction rows and fail closed if empty."""
    predictions = build_prediction_rows(features, run_id)
    if not predictions:
        raise RuntimeError("Score stage produced zero prediction rows.")
    return predictions


def run_spark(spark, dbutils):  # pragma: no cover - Databricks runtime
    """Databricks score stage: compute risk scores and write the gold predictions table."""
    from pyspark.sql import functions as F
    from pyspark.sql.window import Window

    features = spark.table("gold_property_weather_ops_features")
    predictions = (
        features.withColumn(
            "risk_score",
            F.least(
                F.lit(0.99),
                F.lit(0.08)
                + F.col("weather_sensitivity") * F.lit(0.42)
                + F.col("work_orders_prior_90d") / F.lit(160)
                + F.col("emergency_work_orders_prior_90d") / F.lit(45)
                + F.col("resident_impact_incident_count") / F.lit(25)
                + F.greatest(F.lit(0), F.lit(0.75) - F.col("vendor_capacity_index")) * F.lit(0.35),
            ),
        )
        .withColumn("risk_rank", F.row_number().over(Window.orderBy(F.desc("risk_score"))))
        .withColumn("work_order_surge_probability", F.col("risk_score"))
        .withColumn("work_order_surge_prediction", (F.col("risk_score") >= 0.55).cast("int"))
        .withColumn("scored_at", F.current_timestamp())
    )
    predictions.write.mode("overwrite").saveAsTable("gold_property_maintenance_risk_predictions")
    return predictions
