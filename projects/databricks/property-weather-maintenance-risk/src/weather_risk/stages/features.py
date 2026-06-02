"""Stage 04 — feature engineering.

Local path: `build_feature_rows` is the canonical, parity-gated feature
contract — its output drives `gold_property_weather_ops_features.csv`. The
logic is unchanged from the original `pipeline._feature_rows`.
Spark path: the equivalent DataFrame aggregation that writes the gold features
table on Databricks.
"""
from __future__ import annotations

from statistics import mean
from typing import Any

from ..config import WeatherRiskConfig

# Feature columns the train stage consumes. Single source of truth shared by
# both the Spark trainer and the leakage guard.
MODEL_FEATURE_COLUMNS = [
    "property_age",
    "unit_count",
    "roof_age_years",
    "hvac_age_years",
    "weather_sensitivity",
    "work_orders_prior_90d",
    "emergency_work_orders_prior_90d",
    "weather_related_work_orders_prior_12m",
    "reopened_work_orders_prior_12m",
    "sla_breach_rate_prior_12m",
    "last_inspection_score",
    "average_delay_days_prior",
    "vendor_capacity_index",
    "resident_impact_incident_count",
]

# Label/outcome columns. Track E leakage guard: none of these may be used as a
# model feature, because they encode the target.
LABEL_COLUMNS = {
    "work_order_surge_14d_flag",
    "emergency_maintenance_flag",
    "inspection_failure_flag",
    "resident_impact_incident_flag",
    "vendor_capacity_risk",
}


def build_feature_rows(
    dataset: dict[str, list[dict[str, Any]]], run_id: str
) -> list[dict[str, Any]]:
    """Build the gold feature rows from a synthetic property ops dataset.

    Parity-critical: this is the original `pipeline._feature_rows` logic moved
    verbatim. Do not change the arithmetic — the parity gate diffs its output.
    """
    properties = dataset["properties"]
    work_orders = dataset["work_orders"]
    inspections = dataset["inspections"]
    turns = dataset["make_ready_turns"]
    incidents = dataset["resident_incidents"]
    vendors = {vendor["vendor_id"]: vendor for vendor in dataset["vendors"]}
    rows: list[dict[str, Any]] = []

    for prop in properties:
        property_id = prop["property_id"]
        prop_wos = [wo for wo in work_orders if wo["property_id"] == property_id]
        prop_insp = [insp for insp in inspections if insp["property_id"] == property_id]
        prop_turns = [turn for turn in turns if turn["property_id"] == property_id]
        prop_incidents = [incident for incident in incidents if incident["property_id"] == property_id]
        vendor = vendors[prop["primary_vendor_id"]]
        wo_count = len(prop_wos)
        emergency_count = sum(1 for wo in prop_wos if wo["emergency_flag"])
        weather_count = sum(1 for wo in prop_wos if wo["weather_related_flag"])
        reopened_count = sum(1 for wo in prop_wos if wo.get("reopened_flag"))
        sla_breach_count = sum(1 for wo in prop_wos if wo["sla_breached_flag"])
        avg_delay = mean([turn["delay_days"] for turn in prop_turns]) if prop_turns else 0.0
        avg_score = mean([insp["overall_score"] for insp in prop_insp]) if prop_insp else 85.0
        risk_score = (
            prop["weather_sensitivity"] * 38
            + weather_count * 2.1
            + emergency_count * 2.8
            + reopened_count * 2.3
            + sla_breach_count * 1.5
            + max(0, 85 - avg_score) * 0.55
            + avg_delay * 1.2
            + len(prop_incidents) * 1.8
            + max(0, 0.7 - vendor["capacity_index"]) * 25
        )
        rows.append(
            {
                "run_id": run_id,
                "property_id": property_id,
                "county_fips": prop["county_fips"],
                "state": prop["state"],
                "market": prop["market"],
                "property_age": 2026 - prop["year_built"],
                "unit_count": prop["unit_count"],
                "roof_age_years": prop["roof_age_years"],
                "hvac_age_years": prop["hvac_age_years"],
                "flood_zone_flag": int(prop["flood_zone_flag"]),
                "weather_sensitivity": prop["weather_sensitivity"],
                "work_orders_prior_90d": wo_count,
                "emergency_work_orders_prior_90d": emergency_count,
                "weather_related_work_orders_prior_12m": weather_count,
                "reopened_work_orders_prior_12m": reopened_count,
                "sla_breach_rate_prior_12m": round(sla_breach_count / wo_count, 4) if wo_count else 0.0,
                "last_inspection_score": round(avg_score, 2),
                "make_ready_backlog_prior": sum(1 for turn in prop_turns if turn["delay_days"] > 0),
                "average_delay_days_prior": round(avg_delay, 2),
                "vendor_capacity_index": vendor["capacity_index"],
                "resident_impact_incident_count": len(prop_incidents),
                "work_order_surge_14d_flag": int(risk_score >= 72),
                "emergency_maintenance_flag": int(emergency_count >= max(2, wo_count * 0.18)),
                "inspection_failure_flag": int(avg_score < 78),
                "make_ready_delay_days": round(avg_delay, 2),
                "resident_impact_incident_flag": int(len(prop_incidents) > 0),
                "vendor_capacity_risk": int(vendor["capacity_index"] < 0.58),
                "synthetic_data": True,
            }
        )
    return rows


def run(
    config: WeatherRiskConfig,
    dataset: dict[str, list[dict[str, Any]]],
    run_id: str,
) -> list[dict[str, Any]]:
    """Local feature stage: build feature rows and fail closed if empty."""
    rows = build_feature_rows(dataset, run_id)
    if not rows:
        raise RuntimeError("Feature stage produced zero rows.")
    return rows


def run_spark(spark, dbutils):  # pragma: no cover - Databricks runtime
    """Databricks feature stage: aggregate synthetic_* tables into gold features."""
    from pyspark.sql import functions as F

    properties = spark.table("synthetic_properties")
    work_orders = spark.table("synthetic_work_orders")
    inspections = spark.table("synthetic_inspections")
    turns = spark.table("synthetic_make_ready_turns")
    incidents = spark.table("synthetic_resident_incidents")
    vendors = spark.table("synthetic_vendors")

    wo_agg = work_orders.groupBy("property_id").agg(
        F.count("*").alias("work_orders_prior_90d"),
        F.sum(F.col("emergency_flag").cast("int")).alias("emergency_work_orders_prior_90d"),
        F.sum(F.col("weather_related_flag").cast("int")).alias("weather_related_work_orders_prior_12m"),
        F.sum(F.col("reopened_flag").cast("int")).alias("reopened_work_orders_prior_12m"),
        F.avg(F.col("sla_breached_flag").cast("int")).alias("sla_breach_rate_prior_12m"),
    )
    insp_agg = inspections.groupBy("property_id").agg(
        F.avg("overall_score").alias("last_inspection_score")
    )
    turn_agg = turns.groupBy("property_id").agg(
        F.avg("delay_days").alias("average_delay_days_prior"),
        F.sum((F.col("delay_days") > 0).cast("int")).alias("make_ready_backlog_prior"),
    )
    incident_agg = incidents.groupBy("property_id").agg(
        F.count("*").alias("resident_impact_incident_count")
    )

    features = (
        properties.join(wo_agg, "property_id", "left")
        .join(insp_agg, "property_id", "left")
        .join(turn_agg, "property_id", "left")
        .join(incident_agg, "property_id", "left")
        .join(
            vendors.select("vendor_id", F.col("capacity_index").alias("vendor_capacity_index")),
            properties.primary_vendor_id == vendors.vendor_id,
            "left",
        )
        .fillna(0)
        .withColumn("property_age", F.lit(2026) - F.col("year_built"))
        .withColumn("work_order_surge_14d_flag", (F.col("weather_sensitivity") > 0.72).cast("int"))
        .withColumn("emergency_maintenance_flag", (F.col("emergency_work_orders_prior_90d") >= 2).cast("int"))
        .withColumn("inspection_failure_flag", (F.col("last_inspection_score") < 78).cast("int"))
        .withColumn("make_ready_delay_days", F.col("average_delay_days_prior"))
        .withColumn("resident_impact_incident_flag", (F.col("resident_impact_incident_count") > 0).cast("int"))
        .withColumn("vendor_capacity_risk", (F.col("vendor_capacity_index") < 0.58).cast("int"))
    )
    if features.count() == 0:
        raise RuntimeError("Feature rows are zero.")
    features.write.mode("overwrite").saveAsTable("gold_property_weather_ops_features")
    return features
