# =============================================================================
# Supply Chain Demo — 09: CDC MERGE Example
#
# Demonstrates change-data-capture applied to the supplier dimension.
# Creates a bronze changes table (5 records: 3 updates, 2 inserts) and
# merges it into silver.dim_supplier using Delta Lake MERGE INTO.
#
# Why this matters:
#   - Source ERP systems continuously emit change records (inserts, updates)
#   - MERGE INTO is how you apply those changes without reprocessing the
#     full Bronze table every run
#   - The same pattern works on fact tables for late-arriving events
#
# Run after: 00_setup.py + 02_silver_transform.py (dim_supplier must exist)
# =============================================================================

from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from pyspark.sql import functions as F

# ---------------------------------------------------------------------------
# 1. Catalog mode (reuses the same UC/hive_metastore pattern)
# ---------------------------------------------------------------------------

USE_UNITY = True
try:
    spark.sql("USE CATALOG supply_chain_demo")
except Exception:
    USE_UNITY = False

def table_ref(layer, name):
    if USE_UNITY:
        return f"supply_chain_demo.{layer}.{name}"
    return f"supply_chain_demo_{layer}.{name}"


# ---------------------------------------------------------------------------
# 2. Create bronze changes table
#    In a real pipeline this arrives from a Kafka CDC stream or JDBC
#    change-data-capture table (e.g. Debezium → S3 → Auto Loader).
# ---------------------------------------------------------------------------

changes_data = [
    # 3 updates: reliability_score revised downward after audit
    ("SUP000", "Apex Logistics",            "Electronics", "Northeast", 0.71),
    ("SUP005", "Fujiyama Parts",             "Packaging",   "International", 0.62),
    ("SUP012", "Meridian Plastics",          "Plastics",    "Midwest", 0.58),
    # 2 new suppliers added mid-year
    ("SUP020", "Atlantic Circuit Works",     "Electronics", "Northeast", 0.88),
    ("SUP021", "Pacific Precision Castings", "Metals",      "West", 0.92),
]

changes_schema = StructType([
    StructField("supplier_id",       StringType(), False),
    StructField("supplier_name",     StringType(), True),
    StructField("category",          StringType(), True),
    StructField("region",            StringType(), True),
    StructField("reliability_score", DoubleType(), True),
])

changes_df = spark.createDataFrame(changes_data, changes_schema)
changes_df.write.format("delta").mode("overwrite").saveAsTable(
    table_ref("bronze", "raw_supplier_master_changes")
)
print(f"Created {table_ref('bronze', 'raw_supplier_master_changes')}: {changes_df.count()} change records")


# ---------------------------------------------------------------------------
# 3. Show before-state
# ---------------------------------------------------------------------------

print("\n--- Before MERGE: dim_supplier sample ---")
before = spark.read.table(table_ref("silver", "dim_supplier"))
before_count = before.count()
(before.filter(F.col("supplier_id").isin("SUP000","SUP005","SUP012","SUP020","SUP021"))
       .select("supplier_id", "supplier_name", "reliability_score")
       .orderBy("supplier_id")
       .show())
print(f"Total rows before: {before_count}")


# ---------------------------------------------------------------------------
# 4. MERGE INTO — apply updates and new inserts
# ---------------------------------------------------------------------------

# --- OPTIONAL: run as DLT pipeline (Standard/Premium tier) ---
# @dlt.table(name="dim_supplier", comment="Supplier dimension — CDC merged")
# def dim_supplier():
#     changes = spark.read.table(table_ref("bronze", "raw_supplier_master_changes"))
#     return changes  # DLT handles upsert via SCD Type 1 automatically with applyChanges

# --- ALWAYS: plain-Spark MERGE (Community Edition compatible) ---
target = table_ref("silver", "dim_supplier")
source = table_ref("bronze", "raw_supplier_master_changes")

spark.sql(f"""
MERGE INTO {target} AS t
USING {source}    AS s
ON t.supplier_id = s.supplier_id
WHEN MATCHED THEN
  UPDATE SET
    t.supplier_name     = s.supplier_name,
    t.category          = s.category,
    t.region            = s.region,
    t.reliability_score = s.reliability_score
WHEN NOT MATCHED THEN
  INSERT (supplier_id, supplier_name, category, region, reliability_score)
  VALUES (s.supplier_id, s.supplier_name, s.category, s.region, s.reliability_score)
""")

print("\n✓ MERGE INTO complete")


# ---------------------------------------------------------------------------
# 5. Show after-state and verify
# ---------------------------------------------------------------------------

print("\n--- After MERGE: dim_supplier sample ---")
after = spark.read.table(table_ref("silver", "dim_supplier"))
after_count = after.count()
(after.filter(F.col("supplier_id").isin("SUP000","SUP005","SUP012","SUP020","SUP021"))
      .select("supplier_id", "supplier_name", "reliability_score")
      .orderBy("supplier_id")
      .show())
print(f"Total rows after:  {after_count}  (added {after_count - before_count} new supplier(s))")

# Verify reliability scores were updated
updated = after.filter(F.col("supplier_id").isin("SUP000","SUP005","SUP012"))
print("\nUpdated reliability scores (should match changes table):")
updated.select("supplier_id", "supplier_name", "reliability_score").orderBy("supplier_id").show()


# ---------------------------------------------------------------------------
# 6. Inspect Delta change history (Unity Catalog only)
# ---------------------------------------------------------------------------

if USE_UNITY:
    print("\n--- Delta change history ---")
    spark.sql(f"DESCRIBE HISTORY {target} LIMIT 3").select(
        "version", "timestamp", "operation", "operationParameters"
    ).show(truncate=80)
else:
    print("\n(DESCRIBE HISTORY requires Unity Catalog — skipped on hive_metastore)")


# ---------------------------------------------------------------------------
# Key takeaway
# ---------------------------------------------------------------------------

print("""
Pattern summary:
  1. CDC source (Kafka / JDBC / file drop) → bronze.raw_supplier_master_changes
  2. MERGE INTO silver.dim_supplier ON supplier_id
     - WHEN MATCHED → UPDATE (SCD Type 1: overwrite current values)
     - WHEN NOT MATCHED → INSERT (net-new suppliers)
  3. Downstream gold/semantic aggregations pick up the change on next run
     without reprocessing the full Bronze table

For SCD Type 2 (preserve history), replace the MERGE with:
  - WHEN MATCHED AND row_changed → UPDATE is_current=false, effective_to=now()
  - WHEN NOT MATCHED → INSERT with is_current=true, effective_from=now()
  See docs/supply-chain-lineage.md for the full SCD2 dim_supplier_history pattern.
""")
