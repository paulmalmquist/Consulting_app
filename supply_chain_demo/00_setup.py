# =============================================================================
# Supply Chain Demo — 00: Environment Setup & Data Seeding
# Medallion lakehouse build on Databricks
#
# Run this notebook first. It creates the catalog, schemas, and seeds all
# mock source data as Delta tables in the bronze layer.
#
# Runtime: < 4 min on a single-node cluster (DBR 15.4 LTS, 8 GB RAM)
# Compatible: Databricks Community Edition (uses hive_metastore fallback)
# =============================================================================

import random
import hashlib
from datetime import date, timedelta
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, DoubleType, BooleanType
)

random.seed(42)  # deterministic for repeatability

# ---------------------------------------------------------------------------
# 1. Catalog / Schema bootstrap
# ---------------------------------------------------------------------------
# Unity Catalog (Standard/Premium): creates supply_chain_demo catalog.
# Community Edition: falls back to hive_metastore with prefixed database names.

USE_UNITY = True

try:
    spark.sql("CREATE CATALOG IF NOT EXISTS supply_chain_demo")
    spark.sql("USE CATALOG supply_chain_demo")
    for schema in ("bronze", "silver", "gold", "semantic"):
        spark.sql(f"CREATE SCHEMA IF NOT EXISTS supply_chain_demo.{schema}")
    print("Unity Catalog ready: supply_chain_demo.{bronze,silver,gold,semantic}")
except Exception as e:
    USE_UNITY = False
    print(f"Unity Catalog unavailable ({type(e).__name__}). Using hive_metastore fallback.")
    for schema in ("bronze", "silver", "gold"):
        spark.sql(f"CREATE DATABASE IF NOT EXISTS supply_chain_demo_{schema}")
    print("hive_metastore ready: supply_chain_demo_{bronze,silver,gold}")


def table_ref(layer: str, name: str) -> str:
    """Return fully-qualified table name for the active catalog mode."""
    if USE_UNITY:
        return f"supply_chain_demo.{layer}.{name}"
    return f"supply_chain_demo_{layer}.{name}"


# ---------------------------------------------------------------------------
# 2. Reference data
# ---------------------------------------------------------------------------

_SUPPLIER_NAMES = [
    "Apex Logistics", "Blue Ridge Manufacturing", "Canton Exports Ltd",
    "Delta Components", "Eastfield Precision", "Fujiyama Parts",
    "Greenleaf Assembly", "Horizon Metals", "Inland Pacific Trading",
    "JKL Electronics", "Keystone Raw Materials", "Lima Fasteners",
    "Meridian Plastics", "Northbrook Steel", "Omega Circuit Works",
    "Pinnacle Textiles", "Quantum Sensors", "Redwood Forest Products",
    "Summit Industrial", "Torchwood Bearings",
]

_COUNTRIES = ["US", "CN", "DE", "MX", "JP", "IN", "KR", "BR", "CA", "FR"]
_CATEGORIES = [
    "Raw Materials", "Components", "Assemblies", "Packaging",
    "MRO", "Electronics", "Textiles", "Metals",
]
_REGIONS = ["NE", "SE", "MW", "SW", "W", "CN", "SC", "NW"]
_SEGMENTS = ["Enterprise", "Mid-Market", "SMB", "Government"]
_CARRIERS = ["FedEx", "UPS", "DHL", "XPO Logistics", "Amazon Freight", "USPS"]
_SYSTEMS = ["SAP_ECC", "ORACLE_PROC", "MANHAT_WMS", "MERCURY_TMS", "ROCKWELL_MES"]


# ---------------------------------------------------------------------------
# 3. Seed data generators
# ---------------------------------------------------------------------------

def gen_suppliers(n: int = 20) -> list:
    rows = []
    for i in range(n):
        rows.append({
            "supplier_id": f"SUP-{i + 1:04d}",
            "supplier_name": _SUPPLIER_NAMES[i],
            "country": random.choice(_COUNTRIES),
            "tier": random.choice([1, 1, 1, 2, 2, 3]),
            "lead_time_days": random.randint(5, 45),
            "payment_terms_days": random.choice([30, 45, 60, 90]),
            "quality_rating": round(random.uniform(2.5, 5.0), 2),
            "on_boarding_date": str(date(2022, 1, 1) + timedelta(days=random.randint(0, 730))),
        })
    return rows


def gen_skus(n: int = 200) -> list:
    rows = []
    for i in range(n):
        cat = random.choice(_CATEGORIES)
        rows.append({
            "sku_id": f"SKU-{i + 1:05d}",
            "description": f"{cat} Item {i + 1:03d}",
            "category": cat,
            "unit_cost_usd": round(random.uniform(1.5, 500.0), 2),
            "unit_weight_kg": round(random.uniform(0.05, 50.0), 3),
            "reorder_point_units": random.randint(50, 500),
            "lead_time_days": random.randint(3, 30),
        })
    return rows


def gen_warehouses(n: int = 10) -> list:
    rows = []
    for i in range(n):
        region = _REGIONS[i % len(_REGIONS)]
        rows.append({
            "warehouse_id": f"WH-{i + 1:03d}",
            "warehouse_name": f"{region} Distribution Center",
            "region": region,
            "country": "US",
            "capacity_units": random.randint(5_000, 50_000),
            "operating_cost_usd_day": round(random.uniform(1_000.0, 10_000.0), 2),
        })
    return rows


def gen_customers(n: int = 500) -> list:
    rows = []
    for i in range(n):
        rows.append({
            "customer_id": f"CUST-{i + 1:05d}",
            "customer_name": f"Customer {i + 1:04d}",
            "segment": random.choice(_SEGMENTS),
            "region": random.choice(_REGIONS),
            "credit_limit_usd": float(random.choice([10_000, 25_000, 50_000, 100_000, 250_000])),
            "account_open_date": str(date(2020, 1, 1) + timedelta(days=random.randint(0, 1460))),
        })
    return rows


def gen_purchase_orders(supplier_ids: list, sku_ids: list, n: int = 10_000) -> list:
    """
    Deliberate dirtiness:
      ~2% null po_date / expected_delivery_date  (missing dates from source)
      ~1% negative ordered_qty                   (SAP sign reversal on returns)
      ~0.5% duplicate po_number                  (CDC re-delivery)
    """
    rows = []
    base = date(2024, 1, 1)
    used_po_numbers = []

    for i in range(n):
        null_date = random.random() < 0.02
        neg_qty = random.random() < 0.01
        is_dup = used_po_numbers and random.random() < 0.005

        po_num = random.choice(used_po_numbers) if is_dup else f"PO-{i + 1:06d}"
        used_po_numbers.append(po_num)

        rows.append({
            "po_number": po_num,
            "supplier_id": random.choice(supplier_ids),
            "sku_id": random.choice(sku_ids),
            "po_date": None if null_date else str(base + timedelta(days=random.randint(0, 364))),
            "expected_delivery_date": None if null_date else str(
                base + timedelta(days=random.randint(10, 400))
            ),
            "ordered_qty": -random.randint(1, 10) if neg_qty else random.randint(10, 500),
            "unit_cost_usd": round(random.uniform(1.5, 500.0), 2),
            "po_status": random.choice(["open", "open", "open", "fulfilled", "cancelled"]),
            "source_system": random.choice(["SAP_ECC", "ORACLE_PROC"]),
            "ingested_at": str(date.today()),
        })
    return rows


def gen_sales_orders(customer_ids: list, sku_ids: list, warehouse_ids: list,
                     n: int = 10_000) -> list:
    rows = []
    base = date(2024, 1, 1)
    for i in range(n):
        null_date = random.random() < 0.02
        order_date = None if null_date else str(base + timedelta(days=random.randint(0, 364)))
        rows.append({
            "so_number": f"SO-{i + 1:06d}",
            "customer_id": random.choice(customer_ids),
            "sku_id": random.choice(sku_ids),
            "fulfillment_warehouse_id": random.choice(warehouse_ids),
            "order_date": order_date,
            "requested_ship_date": None if null_date else str(
                base + timedelta(days=random.randint(5, 370))
            ),
            "ordered_qty": random.randint(1, 200),
            "unit_price_usd": round(random.uniform(2.0, 600.0), 2),
            "so_status": random.choice(["open", "open", "shipped", "shipped", "cancelled"]),
            "source_system": random.choice(["SAP_ECC", "MANHAT_WMS"]),
            "ingested_at": str(date.today()),
        })
    return rows


def gen_shipments(po_numbers: list, n: int = 20_000) -> list:
    """
    Delay distribution is weighted toward on-time delivery (~75% OTIF baseline)
    with a long tail of late shipments to make the scorecard interesting.
    """
    rows = []
    base = date(2024, 1, 1)
    # delay_days: negative = early, 0 = on time, positive = late
    delay_pool = [-2, -1, 0, 0, 0, 0, 0, 1, 2, 3, 7, 14, 21]

    for i in range(n):
        ship_date = base + timedelta(days=random.randint(0, 364))
        transit_days = random.randint(3, 21)
        promised = ship_date + timedelta(days=transit_days)
        delay = random.choice(delay_pool)
        actual = promised + timedelta(days=delay)
        delivered = random.random() > 0.03  # 3% never arrive (data lag / lost)

        rows.append({
            "shipment_id": f"SHIP-{i + 1:07d}",
            "po_number": random.choice(po_numbers),
            "carrier": random.choice(_CARRIERS),
            "ship_date": str(ship_date),
            "promised_delivery_date": str(promised),
            "actual_delivery_date": str(actual) if delivered else None,
            "shipped_qty": random.randint(5, 300),
            "on_time": delivered and actual <= promised,
            "in_full": random.random() > 0.12,  # ~88% in-full baseline
            "carrier_tracking_number": hashlib.md5(
                f"SHIP-{i}".encode()
            ).hexdigest()[:12].upper(),
            "source_system": "MERCURY_TMS",
            "ingested_at": str(date.today()),
        })
    return rows


def gen_inventory_snapshots(sku_ids: list, warehouse_ids: list, days: int = 90) -> list:
    """
    90-day daily snapshots. Samples 20 SKUs per warehouse per day
    to keep volume manageable (~18K rows vs. 200 SKUs × 10 WH × 90 days = 180K).
    """
    rows = []
    base = date(2024, 7, 1)
    sampled_skus = random.sample(sku_ids, 20)

    for d in range(days):
        snap_date = base + timedelta(days=d)
        for wh_id in warehouse_ids:
            for sku_id in sampled_skus:
                on_hand = max(0, random.randint(-20, 1_000))  # rare negatives = data issue
                rows.append({
                    "snapshot_date": str(snap_date),
                    "warehouse_id": wh_id,
                    "sku_id": sku_id,
                    "on_hand_units": on_hand,
                    "on_order_units": random.randint(0, 500),
                    "reserved_units": random.randint(0, min(200, on_hand)),
                    "unit_cost_usd": round(random.uniform(1.5, 500.0), 2),
                    "source_system": "MANHAT_WMS",
                    "ingested_at": str(snap_date),
                })
    return rows


# ---------------------------------------------------------------------------
# 4. Write to Delta (bronze layer)
# ---------------------------------------------------------------------------

def write_bronze(name: str, rows: list, schema: StructType) -> None:
    df = spark.createDataFrame(rows, schema)
    ref = table_ref("bronze", name)
    df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(ref)
    count = spark.table(ref).count()
    print(f"  ✓ {ref}  →  {count:,} rows")


print("\nSeeding bronze layer...")

# Materialize reference sets (used across generators)
suppliers = gen_suppliers(20)
skus = gen_skus(200)
warehouses = gen_warehouses(10)
customers = gen_customers(500)

sup_ids = [s["supplier_id"] for s in suppliers]
sku_ids = [s["sku_id"] for s in skus]
wh_ids = [w["warehouse_id"] for w in warehouses]
cust_ids = [c["customer_id"] for c in customers]

write_bronze("raw_suppliers", suppliers, StructType([
    StructField("supplier_id", StringType(), False),
    StructField("supplier_name", StringType()),
    StructField("country", StringType()),
    StructField("tier", IntegerType()),
    StructField("lead_time_days", IntegerType()),
    StructField("payment_terms_days", IntegerType()),
    StructField("quality_rating", DoubleType()),
    StructField("on_boarding_date", StringType()),
]))

write_bronze("raw_skus", skus, StructType([
    StructField("sku_id", StringType(), False),
    StructField("description", StringType()),
    StructField("category", StringType()),
    StructField("unit_cost_usd", DoubleType()),
    StructField("unit_weight_kg", DoubleType()),
    StructField("reorder_point_units", IntegerType()),
    StructField("lead_time_days", IntegerType()),
]))

write_bronze("raw_warehouses", warehouses, StructType([
    StructField("warehouse_id", StringType(), False),
    StructField("warehouse_name", StringType()),
    StructField("region", StringType()),
    StructField("country", StringType()),
    StructField("capacity_units", IntegerType()),
    StructField("operating_cost_usd_day", DoubleType()),
]))

write_bronze("raw_customers", customers, StructType([
    StructField("customer_id", StringType(), False),
    StructField("customer_name", StringType()),
    StructField("segment", StringType()),
    StructField("region", StringType()),
    StructField("credit_limit_usd", DoubleType()),
    StructField("account_open_date", StringType()),
]))

pos = gen_purchase_orders(sup_ids, sku_ids, 10_000)
write_bronze("raw_purchase_orders", pos, StructType([
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
]))

sos = gen_sales_orders(cust_ids, sku_ids, wh_ids, 10_000)
write_bronze("raw_sales_orders", sos, StructType([
    StructField("so_number", StringType(), False),
    StructField("customer_id", StringType()),
    StructField("sku_id", StringType()),
    StructField("fulfillment_warehouse_id", StringType()),
    StructField("order_date", StringType()),
    StructField("requested_ship_date", StringType()),
    StructField("ordered_qty", IntegerType()),
    StructField("unit_price_usd", DoubleType()),
    StructField("so_status", StringType()),
    StructField("source_system", StringType()),
    StructField("ingested_at", StringType()),
]))

po_numbers = [p["po_number"] for p in pos]
write_bronze("raw_shipments", gen_shipments(po_numbers, 20_000), StructType([
    StructField("shipment_id", StringType(), False),
    StructField("po_number", StringType()),
    StructField("carrier", StringType()),
    StructField("ship_date", StringType()),
    StructField("promised_delivery_date", StringType()),
    StructField("actual_delivery_date", StringType()),
    StructField("shipped_qty", IntegerType()),
    StructField("on_time", BooleanType()),
    StructField("in_full", BooleanType()),
    StructField("carrier_tracking_number", StringType()),
    StructField("source_system", StringType()),
    StructField("ingested_at", StringType()),
]))

write_bronze("raw_inventory_snapshots", gen_inventory_snapshots(sku_ids, wh_ids, 90), StructType([
    StructField("snapshot_date", StringType()),
    StructField("warehouse_id", StringType()),
    StructField("sku_id", StringType()),
    StructField("on_hand_units", IntegerType()),
    StructField("on_order_units", IntegerType()),
    StructField("reserved_units", IntegerType()),
    StructField("unit_cost_usd", DoubleType()),
    StructField("source_system", StringType()),
    StructField("ingested_at", StringType()),
]))

print("\nSetup complete.")
print("Next: run 01_bronze_ingest.py to review ingestion patterns,")
print("      then 02_silver_transform.py to begin the quality layer.")
