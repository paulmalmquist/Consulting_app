# =============================================================================
# Supply Chain Demo — 02: Silver Transformation
#
# Silver = clean, conformed, deduplicated. Business logic starts here.
# Every write enforces expectations. Violations route to quarantine tables.
#
# DLT-style expectations are shown as the primary approach (Standard/Premium).
# Each DLT block is immediately followed by a plain-Spark fallback that runs
# on Community Edition and produces identical output.
# =============================================================================

from pyspark.sql import functions as F, Window
from pyspark.sql.types import DateType, DecimalType, IntegerType

try:
    spark.sql("USE CATALOG supply_chain_demo")
    USE_UNITY = True
except Exception:
    USE_UNITY = False


def table_ref(layer: str, name: str) -> str:
    return f"supply_chain_demo.{layer}.{name}" if USE_UNITY else f"supply_chain_demo_{layer}.{name}"


def bronze(name: str):
    return spark.table(table_ref("bronze", name))


def write_silver(name: str, df, *, mode: str = "overwrite") -> int:
    ref = table_ref("silver", name)
    df.write.format("delta").mode(mode).option("overwriteSchema", "true").saveAsTable(ref)
    count = spark.table(ref).count()
    print(f"  ✓ {ref}  →  {count:,} rows")
    return count


def write_quarantine(name: str, df) -> int:
    """Quarantine tables hold rows that failed expectations."""
    ref = table_ref("bronze", f"{name}_quarantine")
    if df.count() > 0:
        df.withColumn("_quarantine_ts", F.current_timestamp()) \
          .write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(ref)
    count = df.count()
    print(f"  ↳ quarantine {ref}: {count:,} rows rejected")
    return count


# ---------------------------------------------------------------------------
# 1. Silver Purchase Orders
# ---------------------------------------------------------------------------
# Expectations:
#   valid_po_date    — po_date must not be null          (warn: quarantine)
#   positive_qty     — ordered_qty must be > 0           (drop: quarantine)
#   unique_po_number — keep latest record per po_number  (dedup)

print("Building silver_purchase_orders...")

raw_po = (
    bronze("raw_purchase_orders")
    .withColumn("po_date_parsed", F.to_date("po_date", "yyyy-MM-dd"))
    .withColumn("expected_delivery_date_parsed", F.to_date("expected_delivery_date", "yyyy-MM-dd"))
    # Standardize supplier_name casing from mixed-case SAP extract
    .withColumn("source_system_clean", F.upper(F.trim("source_system")))
)

# --- OPTIONAL: DLT pipeline (Standard/Premium tier) ---
#
# import dlt
#
# @dlt.table(name="silver_purchase_orders", comment="Cleaned and deduplicated purchase orders")
# @dlt.expect("valid_po_date", "po_date_parsed IS NOT NULL")
# @dlt.expect_or_drop("positive_qty", "ordered_qty > 0")
# def silver_purchase_orders():
#     raw = dlt.read("raw_purchase_orders")
#     ... (same transforms as below)
#
# --- ALWAYS: plain-Spark fallback ---

# Expectation: positive_qty — drop rows with negative/zero quantity
valid_qty = raw_po.filter(F.col("ordered_qty") > 0)
rejected_qty = raw_po.filter(F.col("ordered_qty") <= 0)
write_quarantine("raw_purchase_orders_negqty", rejected_qty)

# Expectation: valid_po_date — quarantine null-date rows but keep them in silver
# (warn, not drop) so they appear in the quality dashboard
null_date = valid_qty.filter(F.col("po_date_parsed").isNull())
write_quarantine("raw_purchase_orders_nulldate", null_date)

# Dedup: keep the row with the highest row_number per po_number
# (simulates "last CDC version wins" semantics)
w = Window.partitionBy("po_number").orderBy(F.col("ingested_at").desc())
silver_po = (
    valid_qty
    .withColumn("_rn", F.row_number().over(w))
    .filter(F.col("_rn") == 1)
    .drop("_rn", "po_date", "expected_delivery_date", "source_system")
    .withColumnRenamed("po_date_parsed", "po_date")
    .withColumnRenamed("expected_delivery_date_parsed", "expected_delivery_date")
    .withColumnRenamed("source_system_clean", "source_system")
    .withColumn("ordered_qty", F.col("ordered_qty").cast(IntegerType()))
    .withColumn("unit_cost_usd", F.col("unit_cost_usd").cast(DecimalType(18, 4)))
    .withColumn("_silver_transformed_at", F.current_timestamp())
)
write_silver("silver_purchase_orders", silver_po)

# ---------------------------------------------------------------------------
# 2. Silver Shipments → fact_shipment_event
# ---------------------------------------------------------------------------
# This is the central fact table. OTIF is computed here.
# Expectations:
#   valid_ship_date   — ship_date must parse as a date
#   shipped_qty_pos   — shipped_qty must be > 0

print("\nBuilding silver_fact_shipment_event...")

raw_ship = (
    bronze("raw_shipments")
    .withColumn("ship_date_parsed", F.to_date("ship_date", "yyyy-MM-dd"))
    .withColumn("promised_delivery_date_parsed", F.to_date("promised_delivery_date", "yyyy-MM-dd"))
    .withColumn("actual_delivery_date_parsed", F.to_date("actual_delivery_date", "yyyy-MM-dd"))
)

# --- OPTIONAL: DLT pipeline ---
#
# @dlt.table(name="silver_fact_shipment_event",
#            comment="Cleansed shipment events. Basis for OTIF and fill rate.")
# @dlt.expect("valid_ship_date", "ship_date_parsed IS NOT NULL")
# @dlt.expect_or_drop("shipped_qty_pos", "shipped_qty > 0")
# def silver_fact_shipment_event():
#     ...

# --- ALWAYS: plain-Spark ---
valid_ship = raw_ship.filter(
    F.col("ship_date_parsed").isNotNull() & (F.col("shipped_qty") > 0)
)
rejected_ship = raw_ship.filter(
    F.col("ship_date_parsed").isNull() | (F.col("shipped_qty") <= 0)
)
write_quarantine("raw_shipments", rejected_ship)

# Enrich with supplier_id by joining through silver POs
silver_po_lookup = spark.table(table_ref("silver", "silver_purchase_orders")) \
    .select("po_number", "supplier_id", "sku_id", "ordered_qty")

silver_ship = (
    valid_ship
    .join(silver_po_lookup, on="po_number", how="left")
    # OTIF: on_time AND in_full both must be true
    .withColumn("otif", F.col("on_time") & F.col("in_full"))
    # Lead time in calendar days
    .withColumn(
        "lead_time_days",
        F.datediff(
            F.col("actual_delivery_date_parsed"),
            F.col("ship_date_parsed")
        )
    )
    .drop("ship_date", "promised_delivery_date", "actual_delivery_date")
    .withColumnRenamed("ship_date_parsed", "ship_date")
    .withColumnRenamed("promised_delivery_date_parsed", "promised_delivery_date")
    .withColumnRenamed("actual_delivery_date_parsed", "actual_delivery_date")
    .withColumn("_silver_transformed_at", F.current_timestamp())
)
write_silver("silver_fact_shipment_event", silver_ship)

# ---------------------------------------------------------------------------
# 3. Silver Inventory Snapshots
# ---------------------------------------------------------------------------
# Expectations:
#   non_negative_on_hand — on_hand_units >= 0 (quarantine negatives)
#   valid_snapshot_date  — snapshot_date must parse

print("\nBuilding silver_inventory_snapshot...")

raw_inv = (
    bronze("raw_inventory_snapshots")
    .withColumn("snapshot_date_parsed", F.to_date("snapshot_date", "yyyy-MM-dd"))
)

# --- OPTIONAL: DLT ---
# @dlt.table(name="silver_inventory_snapshot", comment="Cleansed daily inventory positions")
# @dlt.expect_or_drop("non_negative_on_hand", "on_hand_units >= 0")
# @dlt.expect("valid_snapshot_date", "snapshot_date_parsed IS NOT NULL")
# def silver_inventory_snapshot(): ...

# --- ALWAYS: plain-Spark ---
valid_inv = raw_inv.filter(
    (F.col("on_hand_units") >= 0) & F.col("snapshot_date_parsed").isNotNull()
)
rejected_inv = raw_inv.filter(
    (F.col("on_hand_units") < 0) | F.col("snapshot_date_parsed").isNull()
)
write_quarantine("raw_inventory_snapshots", rejected_inv)

silver_inv = (
    valid_inv
    .drop("snapshot_date")
    .withColumnRenamed("snapshot_date_parsed", "snapshot_date")
    .withColumn("available_units", F.col("on_hand_units") - F.col("reserved_units"))
    .withColumn("inventory_value_usd",
                (F.col("on_hand_units") * F.col("unit_cost_usd")).cast(DecimalType(18, 2)))
    .withColumn("_silver_transformed_at", F.current_timestamp())
)
write_silver("silver_inventory_snapshot", silver_inv)

# ---------------------------------------------------------------------------
# 4. Silver Suppliers (pass-through with type normalization)
# ---------------------------------------------------------------------------
print("\nBuilding silver_suppliers...")

silver_sup = (
    bronze("raw_suppliers")
    .withColumn("on_boarding_date", F.to_date("on_boarding_date", "yyyy-MM-dd"))
    .withColumn("quality_rating", F.col("quality_rating").cast(DecimalType(4, 2)))
    .withColumn("_silver_transformed_at", F.current_timestamp())
)
write_silver("silver_suppliers", silver_sup)

# ---------------------------------------------------------------------------
# 5. Silver SKUs
# ---------------------------------------------------------------------------
print("\nBuilding silver_skus...")

silver_skus = (
    bronze("raw_skus")
    .withColumn("unit_cost_usd", F.col("unit_cost_usd").cast(DecimalType(18, 4)))
    .withColumn("category", F.initcap(F.trim("category")))  # normalize casing
    .withColumn("_silver_transformed_at", F.current_timestamp())
)
write_silver("silver_skus", silver_skus)

print("\nSilver layer complete. Run 03_gold_kpis.py next.")
