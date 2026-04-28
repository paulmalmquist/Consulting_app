# =============================================================================
# Supply Chain Demo — 03: Gold KPI Computation
#
# Gold = certified business metrics. No raw data here — only aggregates that
# a business owner has signed off on. Five KPIs:
#
#   1. OTIF (On-Time In-Full)    — primary delivery performance metric
#   2. Fill Rate                 — shipped qty / ordered qty by SKU
#   3. Days of Supply            — inventory / daily demand ratio
#   4. Supplier Scorecard        — composite OTIF + lead time + quality
#   5. Inventory Turns           — COGS / average inventory value
#
# Outputs write to gold schema. Semantic views in 04_semantic_views.sql
# layer on top of these tables as the single source of truth for BI tools.
# =============================================================================

from pyspark.sql import functions as F
from pyspark.sql.types import DecimalType

try:
    spark.sql("USE CATALOG supply_chain_demo")
    USE_UNITY = True
except Exception:
    USE_UNITY = False


def table_ref(layer: str, name: str) -> str:
    return f"supply_chain_demo.{layer}.{name}" if USE_UNITY else f"supply_chain_demo_{layer}.{name}"


def silver(name: str):
    return spark.table(table_ref("silver", name))


def write_gold(name: str, df) -> int:
    ref = table_ref("gold", name)
    df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(ref)
    count = spark.table(ref).count()
    print(f"  ✓ {ref}  →  {count:,} rows")
    return count


# ---------------------------------------------------------------------------
# 1. OTIF — On-Time In-Full Delivery Rate
# ---------------------------------------------------------------------------
# Definition:
#   OTIF = (shipments where on_time = true AND in_full = true) / total shipments
#
# Grain: supplier × calendar month
# Lineage:
#   bronze.raw_shipments → silver.silver_fact_shipment_event → gold.supplier_otif_scorecard

print("Building gold: OTIF scorecard...")

shipments = silver("silver_fact_shipment_event")
suppliers = silver("silver_suppliers").select("supplier_id", "supplier_name", "tier", "country")

otif_base = (
    shipments
    .withColumn("period_month", F.date_trunc("month", F.col("ship_date")))
    .groupBy("supplier_id", "period_month")
    .agg(
        F.count("*").alias("total_shipments"),
        F.sum(F.when(F.col("otif"), 1).otherwise(0)).alias("otif_shipments"),
        F.sum(F.when(F.col("on_time"), 1).otherwise(0)).alias("on_time_shipments"),
        F.sum(F.when(F.col("in_full"), 1).otherwise(0)).alias("in_full_shipments"),
        F.avg("lead_time_days").alias("avg_lead_time_days"),
        F.stddev("lead_time_days").alias("stddev_lead_time_days"),
    )
    .withColumn("otif_pct", (F.col("otif_shipments") / F.col("total_shipments") * 100)
                             .cast(DecimalType(6, 2)))
    .withColumn("on_time_pct", (F.col("on_time_shipments") / F.col("total_shipments") * 100)
                                .cast(DecimalType(6, 2)))
    .withColumn("in_full_pct", (F.col("in_full_shipments") / F.col("total_shipments") * 100)
                                .cast(DecimalType(6, 2)))
    .withColumn("_gold_computed_at", F.current_timestamp())
)

otif_gold = otif_base.join(suppliers, on="supplier_id", how="left")
write_gold("supplier_otif_scorecard", otif_gold)

# ---------------------------------------------------------------------------
# 2. Fill Rate — Shipped Qty / Ordered Qty by SKU
# ---------------------------------------------------------------------------
# Definition:
#   Fill Rate = SUM(shipped_qty) / SUM(ordered_qty) × 100
#
# Grain: sku × calendar month
# Note: fill rate > 100% is possible if shipments span multiple POs.

print("\nBuilding gold: fill rate by SKU...")

skus = silver("silver_skus").select("sku_id", "description", "category")

fill_rate = (
    shipments
    .filter(F.col("ordered_qty").isNotNull())  # inner join guard
    .withColumn("period_month", F.date_trunc("month", F.col("ship_date")))
    .groupBy("sku_id", "period_month")
    .agg(
        F.sum("shipped_qty").alias("total_shipped_qty"),
        F.sum("ordered_qty").alias("total_ordered_qty"),
        F.count("*").alias("shipment_count"),
    )
    .withColumn(
        "fill_rate_pct",
        (F.col("total_shipped_qty") / F.col("total_ordered_qty") * 100).cast(DecimalType(7, 2))
    )
    .withColumn("_gold_computed_at", F.current_timestamp())
    .join(skus, on="sku_id", how="left")
)
write_gold("fill_rate_by_sku", fill_rate)

# ---------------------------------------------------------------------------
# 3. Days of Supply — On-Hand Inventory / Daily Demand
# ---------------------------------------------------------------------------
# Definition:
#   Days of Supply = AVG(on_hand_units) / AVG(daily_demand_units)
#
# Daily demand is approximated from silver SO shipped qty across the snapshot window.
# Grain: sku × warehouse × calendar month

print("\nBuilding gold: days of supply...")

inventory = silver("silver_inventory_snapshot")
so_demand = (
    silver("silver_fact_shipment_event")
    .withColumn("snapshot_date", F.col("ship_date"))  # align grain
    .groupBy("sku_id", "fulfillment_warehouse_id", "snapshot_date")
    .agg(F.sum("shipped_qty").alias("daily_shipped_qty"))
    .withColumn("fulfillment_warehouse_id",
                F.col("fulfillment_warehouse_id"))  # explicit col ref
)

dos = (
    inventory
    .join(
        so_demand.withColumnRenamed("fulfillment_warehouse_id", "warehouse_id"),
        on=["sku_id", "warehouse_id", "snapshot_date"],
        how="left"
    )
    .withColumn("daily_demand_units",
                F.coalesce(F.col("daily_shipped_qty"), F.lit(0)).cast(DecimalType(18, 4)))
    .withColumn("period_month", F.date_trunc("month", F.col("snapshot_date")))
    .groupBy("sku_id", "warehouse_id", "period_month")
    .agg(
        F.avg("on_hand_units").alias("avg_on_hand_units"),
        F.avg("daily_demand_units").alias("avg_daily_demand_units"),
        F.avg("available_units").alias("avg_available_units"),
    )
    .withColumn(
        "days_of_supply",
        F.when(
            F.col("avg_daily_demand_units") > 0,
            (F.col("avg_on_hand_units") / F.col("avg_daily_demand_units")).cast(DecimalType(8, 1))
        ).otherwise(None)  # NULL when no demand — stock is not consumed
    )
    .withColumn("_gold_computed_at", F.current_timestamp())
)
write_gold("days_of_supply_by_warehouse", dos)

# ---------------------------------------------------------------------------
# 4. Supplier Scorecard — Composite Performance Index
# ---------------------------------------------------------------------------
# Definition (weighted composite, weights sum to 1.0):
#   Scorecard = 0.40 × OTIF
#             + 0.30 × Lead-Time Score    (1 - normalized variance)
#             + 0.30 × Quality Rating     (from silver_suppliers, scaled 0–100)
#
# Grain: supplier × calendar month

print("\nBuilding gold: supplier scorecard...")

# Lead-time variance score: invert stddev so lower variance → higher score.
# Normalize stddev to 0–1 range using min-max within the window.
otif_with_lt = spark.table(table_ref("gold", "supplier_otif_scorecard"))

lt_stats = otif_with_lt.agg(
    F.min("stddev_lead_time_days").alias("lt_stddev_min"),
    F.max("stddev_lead_time_days").alias("lt_stddev_max"),
).collect()[0]

lt_range = lt_stats["lt_stddev_max"] - lt_stats["lt_stddev_min"]
lt_range = lt_range if lt_range > 0 else 1.0

scorecard = (
    otif_with_lt
    .join(
        suppliers.select("supplier_id", "quality_rating"),
        on="supplier_id", how="left"
    )
    .withColumn(
        "lt_score",
        (1 - (F.col("stddev_lead_time_days") - lt_stats["lt_stddev_min"]) / lt_range) * 100
    )
    .withColumn("quality_score", F.col("quality_rating") * 20)  # scale 0–5 → 0–100
    .withColumn(
        "composite_score",
        (F.col("otif_pct") * 0.40
         + F.col("lt_score") * 0.30
         + F.col("quality_score") * 0.30).cast(DecimalType(6, 2))
    )
    .withColumn(
        "score_tier",
        F.when(F.col("composite_score") >= 90, "A")
         .when(F.col("composite_score") >= 75, "B")
         .when(F.col("composite_score") >= 60, "C")
         .otherwise("D")
    )
    .select(
        "supplier_id", "supplier_name", "tier", "country",
        "period_month", "total_shipments", "otif_pct",
        "on_time_pct", "in_full_pct", "avg_lead_time_days",
        "lt_score", "quality_score", "composite_score", "score_tier",
        "_gold_computed_at",
    )
)
write_gold("supplier_scorecard", scorecard)

# ---------------------------------------------------------------------------
# 5. Inventory Turns
# ---------------------------------------------------------------------------
# Definition:
#   Inventory Turns = COGS / Average Inventory Value (annualized)
#
# COGS is approximated from shipments × unit_cost.
# Grain: warehouse × calendar month (then annualized)

print("\nBuilding gold: inventory turns...")

cogs = (
    shipments
    .join(silver("silver_skus").select("sku_id", "unit_cost_usd"), on="sku_id", how="left")
    .withColumn("cogs_usd", (F.col("shipped_qty") * F.col("unit_cost_usd")).cast(DecimalType(18, 2)))
    .withColumn("period_month", F.date_trunc("month", F.col("ship_date")))
    .groupBy("fulfillment_warehouse_id", "period_month")
    .agg(F.sum("cogs_usd").alias("monthly_cogs_usd"))
    .withColumnRenamed("fulfillment_warehouse_id", "warehouse_id")
)

avg_inv_value = (
    inventory
    .withColumn("period_month", F.date_trunc("month", F.col("snapshot_date")))
    .groupBy("warehouse_id", "period_month")
    .agg(F.avg("inventory_value_usd").alias("avg_inventory_value_usd"))
)

turns = (
    cogs
    .join(avg_inv_value, on=["warehouse_id", "period_month"], how="left")
    .withColumn(
        "monthly_inventory_turns",
        F.when(
            F.col("avg_inventory_value_usd") > 0,
            (F.col("monthly_cogs_usd") / F.col("avg_inventory_value_usd")).cast(DecimalType(8, 2))
        ).otherwise(None)
    )
    .withColumn("annualized_turns", (F.col("monthly_inventory_turns") * 12).cast(DecimalType(8, 2)))
    .withColumn("_gold_computed_at", F.current_timestamp())
)
write_gold("inventory_turns_by_warehouse", turns)

print("\nGold layer complete.")
print("Next: run 04_semantic_views.sql to create the semantic layer.")
