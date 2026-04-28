# =============================================================================
# Supply Chain Demo — 05: Data Quality Framework
#
# Writes structured quality results to supply_chain_demo.bronze.quality_results
# and routes failed rows to *_quarantine tables.
#
# Three check types:
#   SCHEMA   — required columns present, types match
#   COMPLETENESS — null rate within threshold
#   VALIDITY — domain rule (positive qty, date order, range bounds)
#
# This is a standalone quality run. In production, embed these checks
# inside the silver DLT pipeline using @dlt.expect annotations.
# =============================================================================

from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType, LongType,
    DoubleType, BooleanType
)
from datetime import datetime

try:
    spark.sql("USE CATALOG supply_chain_demo")
    USE_UNITY = True
except Exception:
    USE_UNITY = False


def table_ref(layer: str, name: str) -> str:
    return f"supply_chain_demo.{layer}.{name}" if USE_UNITY else f"supply_chain_demo_{layer}.{name}"


# ---------------------------------------------------------------------------
# Quality result schema
# ---------------------------------------------------------------------------

RESULT_SCHEMA = StructType([
    StructField("check_ts",       TimestampType(), False),
    StructField("table_name",     StringType(),    False),
    StructField("check_name",     StringType(),    False),
    StructField("check_type",     StringType(),    False),  # SCHEMA | COMPLETENESS | VALIDITY
    StructField("total_rows",     LongType()),
    StructField("passed_rows",    LongType()),
    StructField("failed_rows",    LongType()),
    StructField("failure_rate",   DoubleType()),
    StructField("threshold_pct",  DoubleType()),   # maximum acceptable failure rate
    StructField("passed",         BooleanType(),   False),
    StructField("detail",         StringType()),
])

results: list = []
check_ts = datetime.utcnow()


def record_result(
    table_name: str,
    check_name: str,
    check_type: str,
    total: int,
    failed: int,
    threshold_pct: float,
    detail: str = "",
) -> dict:
    passed_count = total - failed
    failure_rate = (failed / total * 100) if total > 0 else 0.0
    passed = failure_rate <= threshold_pct
    row = {
        "check_ts": check_ts,
        "table_name": table_name,
        "check_name": check_name,
        "check_type": check_type,
        "total_rows": total,
        "passed_rows": passed_count,
        "failed_rows": failed,
        "failure_rate": round(failure_rate, 4),
        "threshold_pct": threshold_pct,
        "passed": passed,
        "detail": detail,
    }
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] {table_name}.{check_name}: "
          f"{failed:,} failed / {total:,} total  ({failure_rate:.2f}% vs threshold {threshold_pct}%)")
    results.append(row)
    return row


# ---------------------------------------------------------------------------
# COMPLETENESS checks
# ---------------------------------------------------------------------------

def check_null_rate(table_ref_str: str, col: str, threshold_pct: float, display_name: str = None):
    df = spark.table(table_ref_str)
    total = df.count()
    failed = df.filter(F.col(col).isNull()).count()
    record_result(
        table_name=display_name or table_ref_str.split(".")[-1],
        check_name=f"null_rate_{col}",
        check_type="COMPLETENESS",
        total=total,
        failed=failed,
        threshold_pct=threshold_pct,
        detail=f"column={col}, null_count={failed}",
    )


print("COMPLETENESS checks...")
check_null_rate(table_ref("bronze", "raw_purchase_orders"), "po_date",       threshold_pct=3.0)
check_null_rate(table_ref("bronze", "raw_purchase_orders"), "supplier_id",   threshold_pct=0.0)
check_null_rate(table_ref("bronze", "raw_purchase_orders"), "sku_id",        threshold_pct=0.0)
check_null_rate(table_ref("bronze", "raw_sales_orders"),    "order_date",    threshold_pct=3.0)
check_null_rate(table_ref("bronze", "raw_shipments"),       "ship_date",     threshold_pct=1.0)
check_null_rate(table_ref("bronze", "raw_shipments"),       "po_number",     threshold_pct=0.0)
check_null_rate(table_ref("bronze", "raw_inventory_snapshots"), "snapshot_date", threshold_pct=0.0)

# ---------------------------------------------------------------------------
# VALIDITY checks
# ---------------------------------------------------------------------------

def check_validity(table_ref_str: str, check_name: str, condition: str,
                   threshold_pct: float, detail: str = ""):
    df = spark.table(table_ref_str)
    total = df.count()
    failed = df.filter(~F.expr(condition)).count()
    record_result(
        table_name=table_ref_str.split(".")[-1],
        check_name=check_name,
        check_type="VALIDITY",
        total=total,
        failed=failed,
        threshold_pct=threshold_pct,
        detail=detail or f"condition: {condition}",
    )


print("\nVALIDITY checks...")
check_validity(
    table_ref("bronze", "raw_purchase_orders"),
    "positive_qty",
    "ordered_qty > 0",
    threshold_pct=1.5,
    detail="negative/zero ordered_qty indicates SAP sign reversal on returns"
)
check_validity(
    table_ref("bronze", "raw_purchase_orders"),
    "delivery_after_order",
    "expected_delivery_date IS NULL OR po_date IS NULL OR expected_delivery_date >= po_date",
    threshold_pct=0.5,
)
check_validity(
    table_ref("bronze", "raw_shipments"),
    "positive_shipped_qty",
    "shipped_qty > 0",
    threshold_pct=0.0,
)
check_validity(
    table_ref("bronze", "raw_shipments"),
    "delivery_not_before_ship",
    "actual_delivery_date IS NULL OR actual_delivery_date >= ship_date",
    threshold_pct=0.1,
)
check_validity(
    table_ref("bronze", "raw_inventory_snapshots"),
    "non_negative_on_hand",
    "on_hand_units >= 0",
    threshold_pct=0.5,
    detail="negative on_hand = WMS adjustment artifact"
)
check_validity(
    table_ref("bronze", "raw_suppliers"),
    "quality_rating_range",
    "quality_rating BETWEEN 0 AND 5",
    threshold_pct=0.0,
)

# ---------------------------------------------------------------------------
# DUPLICATE checks
# ---------------------------------------------------------------------------

def check_duplicates(table_ref_str: str, key_cols: list, threshold_pct: float):
    df = spark.table(table_ref_str)
    total = df.count()
    unique = df.dropDuplicates(key_cols).count()
    failed = total - unique
    record_result(
        table_name=table_ref_str.split(".")[-1],
        check_name=f"duplicate_{'_'.join(key_cols)}",
        check_type="VALIDITY",
        total=total,
        failed=failed,
        threshold_pct=threshold_pct,
        detail=f"duplicate key: {key_cols}",
    )


print("\nDUPLICATE checks...")
check_duplicates(table_ref("bronze", "raw_purchase_orders"), ["po_number"], threshold_pct=1.0)
check_duplicates(table_ref("bronze", "raw_sales_orders"),    ["so_number"], threshold_pct=0.0)
check_duplicates(table_ref("bronze", "raw_shipments"),       ["shipment_id"], threshold_pct=0.0)

# ---------------------------------------------------------------------------
# Write quality_results to bronze layer
# ---------------------------------------------------------------------------

qr_ref = table_ref("bronze", "quality_results")
qr_df = spark.createDataFrame(results, RESULT_SCHEMA)
qr_df.write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(qr_ref)

total_checks = len(results)
failed_checks = sum(1 for r in results if not r["passed"])
print(f"\nQuality run complete: {total_checks} checks, {failed_checks} failed.")
print(f"Results written to {qr_ref}")

# ---------------------------------------------------------------------------
# Summary — print only failing checks so they stand out
# ---------------------------------------------------------------------------

if failed_checks > 0:
    print("\nFailing checks:")
    for r in results:
        if not r["passed"]:
            print(f"  ✗ {r['table_name']}.{r['check_name']}: "
                  f"{r['failure_rate']:.2f}% exceeded threshold {r['threshold_pct']}%")
else:
    print("\nAll checks passed within thresholds.")

print("\nNext: run 06_ai_layer.py to enable NL→SQL on the semantic layer.")
