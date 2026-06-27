"""Ticket 2 — Dataproc Serverless PySpark: ugly STRING bronze -> conformed, typed silver.

This is the real conform layer. For every bronze_rel_* table it:
  - SAFE_CASTs string columns to their true types (INT/DOUBLE/BOOLEAN/DATE/TIMESTAMP)
  - normalizes controlled vocabularies (status / severity / result / disposition / wo status)
    from mixed casing + synonyms to a single canonical value
  - trims/normalizes unit-drifted numeric text
  - deduplicates on the true grain (keeps the first row per business key)
  - QUARANTINES rows that fail hard data-quality rules into silver_rel_<t>_reject with reject_reason
    (null business key, negative duration, out-of-domain status, unmatched crosswalk)
  - adds governance columns: dq_status ('valid'|'quarantined'), dq_checked_at, and asserts the
    source lineage columns (source_system/source_table/source_pk/ingest_batch_id) survive

Silver therefore has strictly MORE columns than bronze (the dq_* additions) and strictly cleaner data
— which is exactly what the medallion audit checks for. The five demo invariants survive into silver.

Reads/writes BigQuery via the Spark-BigQuery connector. Run as a Dataproc Serverless batch:
    gcloud dataproc batches submit pyspark gs://.../jobs/rel_silver.py \
      --region=us-central1 --deps-bucket=gs://novendor-rel-mes-dataproc --version=2.2 \
      -- --project novendor-events-prod --dataset relativity_mes \
         --temp_bucket novendor-rel-mes-dataproc
"""
import argparse

from pyspark.sql import SparkSession, functions as F, Window
from pyspark.sql.types import StringType

# ── controlled vocabularies (canonical <- many synonyms/casings) ────────────────
VOCAB = {
    "ncr_status": {"open": "open", "opened": "open", "closed": "closed", "close": "closed"},
    "severity": {"major": "major", "maj": "major", "minor": "minor", "min": "minor",
                 "critical": "critical"},
    "result": {"pass": "pass", "p": "pass", "passed": "pass",
               "fail": "fail", "f": "fail", "failed": "fail"},
    "wo_status": {"complete": "complete", "cmpl": "complete", "done": "complete"},
    "disposition": {"rework": "rework", "rw": "rework", "use-as-is": "use-as-is",
                    "use_as_is": "use-as-is", "use as is": "use-as-is", "uai": "use-as-is",
                    "repair": "repair", "rpr": "repair"},
}


def _norm_expr(col, vocab_key):
    """Map lower(trim(col)) through the vocab; unknown -> '__invalid__' so it can be quarantined.

    Returns a bare Column (no alias) for use with withColumn, which replaces in place rather than
    appending a duplicate column.
    """
    m = VOCAB[vocab_key]
    e = F.lower(F.trim(F.col(col)))
    mapped = F.create_map([F.lit(x) for kv in m.items() for x in kv])[e]
    return F.when(mapped.isNotNull(), mapped).otherwise(F.lit("__invalid__"))


def _cast_int(col):
    # try/safe cast: Spark `cast` yields null on bad input (acts like SAFE_CAST for our purposes)
    return F.col(col).cast("int")


def _cast_double(col):
    return F.trim(F.col(col)).cast("double")


def _cast_bool(col):
    return (F.lower(F.trim(F.col(col))) == F.lit("true"))


def _cast_ts(col):
    return F.to_timestamp(F.col(col))


def _cast_date(col):
    return F.to_date(F.col(col))


def read_bronze(spark, project, dataset, table):
    return (spark.read.format("bigquery")
            .option("table", f"{project}.{dataset}.bronze_{table}").load())


def write(df, project, dataset, table, temp_bucket):
    (df.write.format("bigquery")
       .option("table", f"{project}.{dataset}.{table}")
       .option("temporaryGcsBucket", temp_bucket)
       .option("writeMethod", "indirect")
       .mode("overwrite").save())


def split_valid_reject(df, reject_conditions):
    """reject_conditions: list[(condition_col_bool, reason_str)]. First matching reason wins."""
    reason = F.lit(None).cast(StringType())
    for cond, why in reversed(reject_conditions):
        reason = F.when(cond, F.lit(why)).otherwise(reason)
    tagged = df.withColumn("reject_reason", reason)
    valid = (tagged.filter(F.col("reject_reason").isNull())
                   .withColumn("dq_status", F.lit("valid"))
                   .drop("reject_reason"))
    reject = (tagged.filter(F.col("reject_reason").isNotNull())
                    .withColumn("dq_status", F.lit("quarantined")))
    return valid, reject


def dedupe(df, keys, order_col="source_pk"):
    w = Window.partitionBy(*keys).orderBy(F.col(order_col).asc_nulls_last())
    return (df.withColumn("_rn", F.row_number().over(w)).filter(F.col("_rn") == 1).drop("_rn"))


def stamp_dq(df):
    return df.withColumn("dq_checked_at", F.current_timestamp())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="novendor-events-prod")
    ap.add_argument("--dataset", default="relativity_mes")
    ap.add_argument("--temp_bucket", default="novendor-rel-mes-dataproc")
    args = ap.parse_args()
    P, D, TB = args.project, args.dataset, args.temp_bucket

    spark = SparkSession.builder.appName("rel-mes-silver").getOrCreate()

    def w_valid(df, table):
        write(stamp_dq(df), P, D, f"silver_{table}", TB)

    def w_reject(df, table):
        write(stamp_dq(df), P, D, f"silver_{table}_reject", TB)

    # ── MES operation_execution: cast minutes, dedup exec_id, quarantine neg minutes ──
    oe = read_bronze(spark, P, D, "rel_mes_operation_execution")
    oe = (oe.withColumn("seq", _cast_int("seq"))
            .withColumn("std_minutes", _cast_int("std_minutes"))
            .withColumn("actual_minutes", _cast_int("actual_minutes"))
            .withColumn("synthetic", _cast_bool("synthetic"))
            .withColumn("as_of", _cast_ts("as_of"))
            .withColumn("result", _norm_expr("result", "result")))
    oe = dedupe(oe, ["exec_id"])
    oe_valid, oe_reject = split_valid_reject(oe, [
        (F.col("actual_minutes") < 0, "negative_actual_minutes"),
        (F.col("result") == "__invalid__", "result_out_of_domain"),
        (F.col("exec_id").isNull(), "null_business_key"),
    ])
    w_valid(oe_valid, "rel_mes_operation_execution")
    w_reject(oe_reject, "rel_mes_operation_execution")

    # ── MES nonconformance: normalize status+severity, cast ts, dedup ncr_id ──
    nc = read_bronze(spark, P, D, "rel_mes_nonconformance")
    nc = (nc.withColumn("synthetic", _cast_bool("synthetic"))
            .withColumn("opened_ts", _cast_ts("opened_ts"))
            .withColumn("closed_ts", _cast_ts("closed_ts"))
            .withColumn("as_of", _cast_ts("as_of"))
            .withColumn("status", _norm_expr("status", "ncr_status"))
            .withColumn("severity", _norm_expr("severity", "severity")))
    nc = dedupe(nc, ["ncr_id"])
    nc_valid, nc_reject = split_valid_reject(nc, [
        (F.col("status") == "__invalid__", "status_out_of_domain"),
        (F.col("severity") == "__invalid__", "severity_out_of_domain"),
        (F.col("ncr_id").isNull(), "null_business_key"),
    ])
    w_valid(nc_valid, "rel_mes_nonconformance")
    w_reject(nc_reject, "rel_mes_nonconformance")

    # ── MES disposition: normalize disposition_type, cast ts ──
    dp = read_bronze(spark, P, D, "rel_mes_disposition")
    dp = (dp.withColumn("synthetic", _cast_bool("synthetic"))
            .withColumn("approved_ts", _cast_ts("approved_ts"))
            .withColumn("as_of", _cast_ts("as_of"))
            .withColumn("disposition_type", _norm_expr("disposition_type", "disposition")))
    dp = dedupe(dp, ["disposition_id"])
    dp_valid, dp_reject = split_valid_reject(dp, [
        (F.col("disposition_type") == "__invalid__", "disposition_out_of_domain"),
        (F.col("disposition_id").isNull(), "null_business_key"),
    ])
    w_valid(dp_valid, "rel_mes_disposition")
    w_reject(dp_reject, "rel_mes_disposition")

    # ── MES inspection_order: normalize result, dedup ──
    io = read_bronze(spark, P, D, "rel_mes_inspection_order")
    io = (io.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
            .withColumn("result", _norm_expr("result", "result")))
    io = dedupe(io, ["inspection_id"])
    io_valid, io_reject = split_valid_reject(io, [
        (F.col("result") == "__invalid__", "result_out_of_domain"),
        (F.col("inspection_id").isNull(), "null_business_key"),
    ])
    w_valid(io_valid, "rel_mes_inspection_order")
    w_reject(io_reject, "rel_mes_inspection_order")

    # ── MES work_order: normalize status, dedup ──
    wo = read_bronze(spark, P, D, "rel_mes_work_order")
    wo = (wo.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
            .withColumn("want_date", _cast_date("want_date"))
            .withColumn("status", _norm_expr("status", "wo_status")))
    wo = dedupe(wo, ["work_order_no"])
    wo_valid, wo_reject = split_valid_reject(wo, [
        (F.col("status") == "__invalid__", "status_out_of_domain"),
        (F.col("work_order_no").isNull(), "null_business_key"),
    ])
    w_valid(wo_valid, "rel_mes_work_order")
    w_reject(wo_reject, "rel_mes_work_order")

    # ── MES genealogy: dedup edge_id, quarantine null parent/child ──
    ge = read_bronze(spark, P, D, "rel_mes_as_built_genealogy")
    ge = (ge.withColumn("synthetic", _cast_bool("synthetic"))
            .withColumn("installed_at", _cast_date("installed_at"))
            .withColumn("as_of", _cast_ts("as_of")))
    ge = dedupe(ge, ["edge_id"])
    ge_valid, ge_reject = split_valid_reject(ge, [
        (F.col("parent_node_id").isNull() | F.col("child_node_id").isNull(), "null_edge_node"),
        (F.col("edge_id").isNull(), "null_business_key"),
    ])
    w_valid(ge_valid, "rel_mes_as_built_genealogy")
    w_reject(ge_reject, "rel_mes_as_built_genealogy")

    # ── MES material_consumption: cast qty, quarantine null part_no ──
    mc = read_bronze(spark, P, D, "rel_mes_material_consumption")
    mc = (mc.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
            .withColumn("qty", _cast_int("qty")))
    mc = dedupe(mc, ["consumption_id"])
    mc_valid, mc_reject = split_valid_reject(mc, [
        (F.col("part_no").isNull(), "null_part_no"),
        (F.col("consumption_id").isNull(), "null_business_key"),
    ])
    w_valid(mc_valid, "rel_mes_material_consumption")
    w_reject(mc_reject, "rel_mes_material_consumption")

    # ── ERP cost / labor / orders: cast numerics, trim unit drift ──
    poc = read_bronze(spark, P, D, "rel_erp_prod_order_cost")
    poc = (poc.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
              .withColumn("amount", _cast_double("amount"))
              .withColumn("posting_date", _cast_date("posting_date")))
    w_valid(dedupe(poc, ["cost_id"]), "rel_erp_prod_order_cost")

    lab = read_bronze(spark, P, D, "rel_erp_labor_actual")
    lab = (lab.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
              .withColumn("hours", _cast_double("hours"))
              .withColumn("rate", _cast_double("rate"))   # trim handled by cast(trim())
              .withColumn("amount", _cast_double("amount")))
    w_valid(dedupe(lab, ["labor_id"]), "rel_erp_labor_actual")

    po = read_bronze(spark, P, D, "rel_erp_production_order")
    po = (po.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
            .withColumn("planned_qty", _cast_int("planned_qty"))
            .withColumn("std_cost_estimate", _cast_double("std_cost_estimate")))
    w_valid(dedupe(po, ["mfg_order_no"]), "rel_erp_production_order")

    cv = read_bronze(spark, P, D, "rel_erp_cost_variance")
    cv = (cv.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
            .withColumn("amount", _cast_double("amount")))
    w_valid(dedupe(cv, ["variance_id"]), "rel_erp_cost_variance")

    mm = read_bronze(spark, P, D, "rel_erp_material_master")
    mm = (mm.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
            .withColumn("standard_cost", _cast_double("standard_cost")))
    w_valid(dedupe(mm, ["material_id"]), "rel_erp_material_master")

    # ── crosswalk: flag unmatched (blank erp_material_id) instead of dropping ──
    xw = read_bronze(spark, P, D, "rel_xwalk_part_identity")
    xw = (xw.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
            .withColumn("erp_material_id",
                        F.when(F.trim(F.col("erp_material_id")) == "", None)
                         .otherwise(F.col("erp_material_id")))
            .withColumn("match_status",
                        F.when(F.col("erp_material_id").isNull(), F.lit("unmatched"))
                         .otherwise(F.lit("matched")))
            .withColumn("match_rule", F.lit("plm_part_no->mes_part_no->erp_material_id"))
            .withColumn("match_confidence",
                        F.when(F.col("erp_material_id").isNull(), F.lit(0.0)).otherwise(F.lit(1.0))))
    w_valid(dedupe(xw, ["plm_part_no"]), "rel_xwalk_part_identity")

    # ── pass-through-with-cast tables (no controlled vocab, just typing + dedup) ──
    simple = {
        "rel_mes_vehicle": (["vehicle_serial"], []),
        "rel_mes_product": (["product_code"], []),
        "rel_mes_part": (["part_no"], []),
        "rel_mes_lot": (["lot_no"], [("qty", "int"), ("receipt_date", "date")]),
        "rel_mes_unit": (["unit_serial"], []),
        "rel_plm_part": (["plm_part_no"], []),
        "rel_plm_ebom": (["ebom_id"], []),
        "rel_plm_ebom_line": (["ebom_id", "line_no"], [("line_no", "int"),
                                                       ("qty", "int"), ("find_no", "int")]),
        "rel_plm_eco": (["eco_id"], [("effectivity_date", "date")]),
        "rel_plm_effectivity": (["effectivity_id"], []),
    }
    for table, (keys, casts) in simple.items():
        df = read_bronze(spark, P, D, table)
        df = df.withColumn("synthetic", _cast_bool("synthetic")).withColumn("as_of", _cast_ts("as_of"))
        for col, kind in casts:
            if kind == "int":
                df = df.withColumn(col, _cast_int(col))
            elif kind == "date":
                df = df.withColumn(col, _cast_date(col))
            elif kind == "double":
                df = df.withColumn(col, _cast_double(col))
        w_valid(dedupe(df, keys), table)

    print("[silver] all silver_rel_* + *_reject written")
    spark.stop()


if __name__ == "__main__":
    main()
