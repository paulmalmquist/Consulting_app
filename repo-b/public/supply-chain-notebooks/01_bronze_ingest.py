# =============================================================================
# Supply Chain Demo — 01: Bronze Ingestion Patterns
#
# Bronze = raw preservation. No business logic, no transformations.
# Land exactly what the source system sends, add audit columns, stop.
#
# This notebook documents the ingestion *patterns* — how each source type
# maps to a Databricks ingest approach. The data is already in bronze from
# 00_setup.py; in production each block below would be a scheduled job or
# a streaming DLT pipeline.
# =============================================================================

from pyspark.sql import functions as F

try:
    spark.sql("USE CATALOG supply_chain_demo")
    USE_UNITY = True
except Exception:
    USE_UNITY = False


def table_ref(layer: str, name: str) -> str:
    return f"supply_chain_demo.{layer}.{name}" if USE_UNITY else f"supply_chain_demo_{layer}.{name}"


# ---------------------------------------------------------------------------
# Source-system → Ingestion pattern mapping
# ---------------------------------------------------------------------------
#
# Each entry below documents: source, format, Databricks pattern, and the
# audit columns we add at the bronze boundary. In production each is a
# separate Databricks Job or DLT pipeline with its own schedule and checkpoint.
#
# ┌──────────────────────┬──────────────────────────────────────────────────┐
# │ Source               │ Pattern                                          │
# ├──────────────────────┼──────────────────────────────────────────────────┤
# │ SAP ECC (POs, SOs)   │ JDBC batch extract via SAP JCo or RFC connector  │
# │ Oracle Procurement   │ JDBC batch extract, full or incremental          │
# │ Manhattan WMS        │ File drop (CSV/Parquet) to ADLS → Auto Loader    │
# │ MercuryGate TMS      │ REST API poll → write to Delta (append)          │
# │ Rockwell MES         │ Kafka / Event Hub streaming → DLT streaming      │
# └──────────────────────┴──────────────────────────────────────────────────┘

# ---------------------------------------------------------------------------
# Pattern A: JDBC batch (SAP ECC / Oracle Procurement)
# ---------------------------------------------------------------------------
# Uncomment and fill credentials to run against a real source.
#
# jdbc_url = "jdbc:sap://sap-host:30015/SAPHANADB"
# (spark.read
#      .format("jdbc")
#      .option("url", jdbc_url)
#      .option("dbtable", "(SELECT * FROM EKPO WHERE AEDAT >= '20240101') t")
#      .option("user", dbutils.secrets.get("kv-supply", "sap-user"))
#      .option("password", dbutils.secrets.get("kv-supply", "sap-pass"))
#      .option("numPartitions", 8)
#      .option("partitionColumn", "EBELN")   # PO number — even distribution
#      .option("lowerBound", "4500000000")
#      .option("upperBound", "4600000000")
#      .load()
#      .withColumn("_bronze_ingested_at", F.current_timestamp())
#      .withColumn("_bronze_source", F.lit("SAP_ECC"))
#      .write.format("delta").mode("append")
#      .saveAsTable(table_ref("bronze", "raw_purchase_orders")))

# ---------------------------------------------------------------------------
# Pattern B: Auto Loader (Manhattan WMS file drops)
# ---------------------------------------------------------------------------
# Auto Loader watches a cloud storage prefix, discovers new files, and
# processes them exactly once. Ideal for WMS daily extracts.
#
# (spark.readStream
#      .format("cloudFiles")
#      .option("cloudFiles.format", "parquet")
#      .option("cloudFiles.schemaLocation", "/mnt/checkpoints/wms_inventory")
#      .option("cloudFiles.inferColumnTypes", "true")
#      .load("/mnt/raw/wms/inventory_snapshots/")
#      .withColumn("_bronze_ingested_at", F.current_timestamp())
#      .withColumn("_bronze_source", F.lit("MANHAT_WMS"))
#      .writeStream
#      .format("delta")
#      .option("checkpointLocation", "/mnt/checkpoints/wms_inventory_ckpt")
#      .outputMode("append")
#      .trigger(availableNow=True)   # run-once mode for scheduled jobs
#      .toTable(table_ref("bronze", "raw_inventory_snapshots")))

# ---------------------------------------------------------------------------
# Pattern C: REST API polling (MercuryGate TMS)
# ---------------------------------------------------------------------------
# For APIs without a native connector: poll, paginate, write to bronze.
# Schedule as a Databricks Job (Python task) on a 15-min cron.
#
# import requests
# def fetch_tms_shipments(api_key, since_ts):
#     url = "https://api.mercurygate.net/v3/shipments"
#     params = {"updatedAfter": since_ts, "pageSize": 200}
#     headers = {"Authorization": f"Bearer {api_key}"}
#     rows = []
#     while url:
#         r = requests.get(url, params=params, headers=headers)
#         r.raise_for_status()
#         data = r.json()
#         rows.extend(data["shipments"])
#         url = data.get("nextPage")
#     return rows
#
# rows = fetch_tms_shipments(
#     dbutils.secrets.get("kv-supply", "tms-key"),
#     since_ts=dbutils.widgets.get("since_ts")
# )
# spark.createDataFrame(rows).write.format("delta").mode("append") \
#      .saveAsTable(table_ref("bronze", "raw_shipments"))

# ---------------------------------------------------------------------------
# Pattern D: Kafka streaming (Rockwell MES — production events)
# ---------------------------------------------------------------------------
# Optional DLT streaming pipeline. Replace with plain readStream if not
# using DLT.
#
# --- OPTIONAL: DLT streaming pipeline (Standard/Premium tier) ---
# import dlt
#
# @dlt.table(name="raw_production_events", comment="MES production events, append-only")
# def raw_production_events():
#     return (spark.readStream
#                  .format("kafka")
#                  .option("kafka.bootstrap.servers", kafka_brokers)
#                  .option("subscribe", "mes.production_events")
#                  .option("startingOffsets", "latest")
#                  .load()
#                  .select(
#                      F.col("timestamp").alias("event_ts"),
#                      F.from_json(F.col("value").cast("string"), mes_schema).alias("payload")
#                  )
#                  .select("event_ts", "payload.*"))
#
# --- ALWAYS: plain Structured Streaming fallback ---
# (spark.readStream
#      .format("kafka")
#      .option("kafka.bootstrap.servers", kafka_brokers)
#      .option("subscribe", "mes.production_events")
#      .load()
#      .writeStream.format("delta")
#      .option("checkpointLocation", "/mnt/checkpoints/mes_events")
#      .outputMode("append")
#      .toTable(table_ref("bronze", "raw_production_events")))

# ---------------------------------------------------------------------------
# Audit: verify bronze tables are present and carry expected audit columns
# ---------------------------------------------------------------------------

EXPECTED_AUDIT_COLS = {"source_system", "ingested_at"}

BRONZE_TABLES = [
    "raw_suppliers",
    "raw_skus",
    "raw_warehouses",
    "raw_customers",
    "raw_purchase_orders",
    "raw_sales_orders",
    "raw_shipments",
    "raw_inventory_snapshots",
]

print("Bronze table audit:\n")
all_ok = True
for tbl in BRONZE_TABLES:
    ref = table_ref("bronze", tbl)
    try:
        df = spark.table(ref)
        count = df.count()
        cols = set(df.columns)
        missing = EXPECTED_AUDIT_COLS - cols
        status = "OK" if not missing else f"MISSING {missing}"
        print(f"  {'✓' if not missing else '✗'} {tbl:35s} {count:>8,} rows   {status}")
        if missing:
            all_ok = False
    except Exception as e:
        print(f"  ✗ {tbl:35s} ERROR: {e}")
        all_ok = False

if all_ok:
    print("\nAll bronze tables present with required audit columns.")
else:
    print("\nWARNING: some tables missing. Re-run 00_setup.py.")

# ---------------------------------------------------------------------------
# Demonstrate: CDC append (simulates a SAP delta extract arriving)
# ---------------------------------------------------------------------------
# In production this cell is the body of a scheduled Databricks Job.
# Here we append 50 new POs to show the pattern is idempotent (existing
# rows are unaffected; Delta log captures the new micro-batch).

import random
from datetime import date
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType

random.seed(99)  # different seed so rows differ from setup batch

SUP_IDS = [f"SUP-{i:04d}" for i in range(1, 21)]
SKU_IDS = [f"SKU-{i:05d}" for i in range(1, 201)]

delta_rows = [
    {
        "po_number": f"PO-DELTA-{i + 1:04d}",
        "supplier_id": random.choice(SUP_IDS),
        "sku_id": random.choice(SKU_IDS),
        "po_date": str(date.today()),
        "expected_delivery_date": str(date(2025, 9, 30)),
        "ordered_qty": random.randint(50, 300),
        "unit_cost_usd": round(random.uniform(10.0, 200.0), 2),
        "po_status": "open",
        "source_system": "SAP_ECC",
        "ingested_at": str(date.today()),
    }
    for i in range(50)
]

delta_schema = StructType([
    StructField("po_number", StringType()),
    StructField("supplier_id", StringType()),
    StructField("sku_id", StringType()),
    StructField("po_date", StringType()),
    StructField("expected_delivery_date", StringType()),
    StructField("ordered_qty", IntegerType()),
    StructField("unit_cost_usd", DoubleType()),
    StructField("po_status", StringType()),
    StructField("source_system", StringType()),
    StructField("ingested_at", StringType()),
])

po_ref = table_ref("bronze", "raw_purchase_orders")
before_count = spark.table(po_ref).count()
spark.createDataFrame(delta_rows, delta_schema).write.format("delta").mode("append").saveAsTable(po_ref)
after_count = spark.table(po_ref).count()

print(f"\nCDC append: {po_ref}")
print(f"  Before: {before_count:,}  →  After: {after_count:,}  (+{after_count - before_count})")
print("\nNext: 02_silver_transform.py")
