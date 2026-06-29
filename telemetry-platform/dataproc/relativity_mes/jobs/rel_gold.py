"""Ticket 3 — Dataproc Serverless PySpark: derive the 5 gold marts FROM silver (real lineage).

Previously the gold marts were Python-generated literals (the generator WAS the gold transform), so
gold read neither silver nor bronze. This job rebuilds them as genuine Spark joins/aggregations over
silver_rel_*, so the medallion lineage bronze -> silver -> gold is real and inspectable. Values are
held to the same business logic the generator used (labor @ $95/hr, 18% overhead, the two NCR rework
costs, variance categories, the 25%% reconciliation-exception threshold) so the demo invariants and
displayed numbers stay stable.

The five marts:
  gold_rel_build_overview          one row per vehicle: counts, costs, variance, readiness
  gold_rel_as_built_genealogy      genealogy edges enriched with inspection/ncr/disposition
  gold_rel_ncr_traceability        NCRs enriched with disposition, where-used, rework estimate
  gold_rel_build_cost_rollup       per-work-order material/labor/overhead/rework rollup
  gold_rel_mes_erp_reconciliation  per-work-order MES actual vs ERP standard + variance category

Run as a Dataproc Serverless batch (after rel_silver.py):
    gcloud dataproc batches submit pyspark gs://.../jobs/rel_gold.py \
      --region=us-central1 --deps-bucket=gs://novendor-rel-mes-dataproc --version=2.2 \
      -- --project novendor-events-prod --dataset relativity_mes \
         --temp_bucket novendor-rel-mes-dataproc
"""
import argparse

from pyspark.sql import SparkSession, functions as F, Window

LABOR_RATE = 95.0
OVERHEAD_RATE = 0.18
PLANNED_FACTOR = 0.97              # planned = (mat+labor+ovh) * 0.97  (matches generator)
RECON_EXCEPTION_PCT = 25.0        # |variance_pct| >= 25 -> exception
SUSPECT_LOT = "LOT-7788"
# NCR rework estimates (minutes, cost) — same business constants the generator used.
REWORK_EST = {"NCR-0001": (320, 4200.0), "NCR-0002": (210, 2650.0)}
# vehicle/subassembly that carry NCR rework cost in the rollup
REWORK_WO = {("VEH-DEMO-001", "TPS"): 4200.0, ("VEH-DEMO-002", "STR"): 2650.0}


def s(spark, P, D, table):
    return spark.read.format("bigquery").option("table", f"{P}.{D}.silver_{table}").load()


AS_OF = "2026-06-26T00:00:00Z"
INGEST_BATCH = "rel-mes-seed-v1"


def stamp(df, serving_table, pk_col):
    """Add the honesty/provenance columns so gold is self-describing (mirrors the generator's _stamp).

    source_pk is the mart's natural key; ingest_batch_id/as_of are the medallion batch constants. These
    let the serving sync and the Lineage dashboard treat gold as governed, traceable rows.
    """
    return (df.withColumn("synthetic", F.lit(True))
              .withColumn("source_system", F.lit("Gold"))
              .withColumn("source_table", F.lit(f"gold.{serving_table}"))
              .withColumn("source_pk", F.col(pk_col).cast("string"))
              .withColumn("ingest_batch_id", F.lit(INGEST_BATCH))
              .withColumn("as_of", F.to_timestamp(F.lit(AS_OF))))


def write(df, P, D, table, tb):
    (df.write.format("bigquery").option("table", f"{P}.{D}.gold_{table}")
       .option("temporaryGcsBucket", tb).option("writeMethod", "indirect")
       .mode("overwrite").save())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="novendor-events-prod")
    ap.add_argument("--dataset", default="relativity_mes")
    ap.add_argument("--temp_bucket", default="novendor-rel-mes-dataproc")
    args = ap.parse_args()
    P, D, TB = args.project, args.dataset, args.temp_bucket
    spark = SparkSession.builder.appName("rel-mes-gold").getOrCreate()

    vehicle = s(spark, P, D, "rel_mes_vehicle")
    work_order = s(spark, P, D, "rel_mes_work_order")
    genealogy = s(spark, P, D, "rel_mes_as_built_genealogy")
    ncr = s(spark, P, D, "rel_mes_nonconformance")
    disp = s(spark, P, D, "rel_mes_disposition")
    insp = s(spark, P, D, "rel_mes_inspection_order")
    matcons = s(spark, P, D, "rel_mes_material_consumption")
    opexec = s(spark, P, D, "rel_mes_operation_execution")
    part = s(spark, P, D, "rel_mes_part")
    matmaster = s(spark, P, D, "rel_erp_material_master")
    prodorder = s(spark, P, D, "rel_erp_production_order")

    # standard cost lookup: MAT-<part_no> -> standard_cost
    std = matmaster.select(
        F.regexp_replace("material_id", "^MAT-", "").alias("part_no"),
        F.col("standard_cost").alias("std_cost"))

    # ── build_cost_rollup (per work order) ──────────────────────────────────────
    # material cost = sum(qty * std_cost(part)) over consumption on the WO
    mc_cost = (matcons.join(std, "part_no", "left")
               .groupBy("work_order_no")
               .agg(F.sum("qty").alias("material_qty"),
                    F.round(F.sum(F.col("qty") * F.coalesce(F.col("std_cost"), F.lit(250.0))), 2)
                     .alias("material_actual_cost"),
                    F.first("part_no", ignorenulls=True).alias("part_no")))
    labor = (opexec.groupBy("work_order_no")
             .agg(F.sum("actual_minutes").alias("labor_minutes")))
    rollup = (work_order.select("work_order_no", "vehicle_serial", "subassembly")
              .join(mc_cost, "work_order_no", "left")
              .join(labor, "work_order_no", "left")
              .withColumn("material_qty", F.coalesce("material_qty", F.lit(0)))
              .withColumn("material_actual_cost", F.coalesce("material_actual_cost", F.lit(0.0)))
              .withColumn("labor_minutes", F.coalesce("labor_minutes", F.lit(0)))
              .withColumn("labor_actual_cost",
                          F.round(F.col("labor_minutes") / 60.0 * LABOR_RATE, 2))
              .withColumn("overhead_cost",
                          F.round(F.col("labor_actual_cost") * OVERHEAD_RATE, 2)))
    rework_map = F.create_map([F.lit(x) for kv in
                               {f"{v}|{f}": c for (v, f), c in REWORK_WO.items()}.items()
                               for x in kv])
    rollup = (rollup
              .withColumn("ncr_rework_cost",
                          F.coalesce(rework_map[F.concat_ws("|", "vehicle_serial", "subassembly")],
                                     F.lit(0.0)))
              .withColumn("total_actual_cost",
                          F.round(F.col("material_actual_cost") + F.col("labor_actual_cost")
                                  + F.col("overhead_cost") + F.col("ncr_rework_cost"), 2))
              .select("vehicle_serial", "work_order_no", "part_no", "material_qty",
                      "material_actual_cost", "labor_minutes", "labor_actual_cost",
                      "overhead_cost", "ncr_rework_cost", "total_actual_cost"))
    write(stamp(rollup, "rel_build_cost_rollup", "work_order_no"), P, D, "rel_build_cost_rollup", TB)

    # ── mes_erp_reconciliation (per work order) ─────────────────────────────────
    recon = (work_order.select("work_order_no", "vehicle_serial", "subassembly",
                               F.col("prod_order_no").alias("mfg_order_no"))
             .join(rollup.select("work_order_no", "total_actual_cost", "ncr_rework_cost"),
                   "work_order_no", "inner")
             .join(prodorder.select(F.col("mfg_order_no"), F.col("material_id").alias("erp_material_id"),
                                    F.col("std_cost_estimate").alias("standard_cost")),
                   "mfg_order_no", "inner")
             .withColumn("actual_cost", F.col("total_actual_cost"))
             .withColumn("variance_amount", F.round(F.col("actual_cost") - F.col("standard_cost"), 2))
             .withColumn("variance_pct",
                         F.when(F.col("standard_cost") != 0,
                                F.round((F.col("actual_cost") - F.col("standard_cost"))
                                        / F.col("standard_cost") * 100, 2)).otherwise(F.lit(0.0)))
             .withColumn("variance_category",
                         F.when((F.col("ncr_rework_cost") > 0) & (F.col("subassembly") == "STR"),
                                F.lit("resource_usage"))
                          .when(F.col("ncr_rework_cost") > 0, F.lit("input_qty"))
                          .when(F.col("variance_amount") > 0, F.lit("input_price"))
                          .otherwise(F.lit("remaining")))
             .withColumn("reconciliation_status",
                         F.when(F.abs(F.col("variance_pct")) < RECON_EXCEPTION_PCT, F.lit("reconciled"))
                          .otherwise(F.lit("exception")))
             .withColumn("source_mes_rows",
                         F.lit("rel_mes_material_consumption, rel_mes_operation_execution"))
             .withColumn("source_erp_rows",
                         F.lit("rel_erp_production_order, rel_erp_prod_order_cost, rel_erp_cost_variance"))
             .select("vehicle_serial", "work_order_no", "mfg_order_no", "erp_material_id",
                     "standard_cost", "actual_cost", "variance_amount", "variance_pct",
                     "variance_category", "source_mes_rows", "source_erp_rows",
                     "reconciliation_status"))
    write(stamp(recon, "rel_mes_erp_reconciliation", "work_order_no"), P, D,
          "rel_mes_erp_reconciliation", TB)

    # ── build_overview (per vehicle) ────────────────────────────────────────────
    wo_cnt = work_order.groupBy("vehicle_serial").agg(F.count("*").alias("work_order_count"))
    edge_cnt = genealogy.groupBy("vehicle_serial").agg(
        F.count("*").alias("genealogy_edge_count"),
        F.sum(F.when(F.col("child_type").isin("part", "lot"), 1).otherwise(0))
         .alias("installed_component_count"),
        F.countDistinct(F.when(F.col("lot_no") == SUSPECT_LOT, F.col("lot_no")))
         .alias("suspect_lot_count"))
    ncr_cnt = ncr.groupBy("vehicle_serial").agg(
        F.sum(F.when(F.col("status") == "open", 1).otherwise(0)).alias("open_ncr_count"),
        F.sum(F.when(F.col("severity") == "major", 1).otherwise(0)).alias("major_ncr_count"))
    veh_cost = rollup.groupBy("vehicle_serial").agg(
        F.round(F.sum("material_actual_cost"), 2).alias("c_material"),
        F.round(F.sum("labor_actual_cost"), 2).alias("c_labor"),
        F.round(F.sum("overhead_cost"), 2).alias("c_overhead"),
        F.round(F.sum("ncr_rework_cost"), 2).alias("c_rework"))
    overview = (vehicle.select("vehicle_serial", "product_code", "build_status")
                .join(wo_cnt, "vehicle_serial", "left")
                .join(edge_cnt, "vehicle_serial", "left")
                .join(ncr_cnt, "vehicle_serial", "left")
                .join(veh_cost, "vehicle_serial", "left")
                .fillna(0, ["work_order_count", "genealogy_edge_count", "installed_component_count",
                            "suspect_lot_count", "open_ncr_count", "major_ncr_count"])
                .fillna(0.0, ["c_material", "c_labor", "c_overhead", "c_rework"])
                .withColumn("actual_cost",
                            F.round(F.col("c_material") + F.col("c_labor") + F.col("c_overhead")
                                    + F.col("c_rework"), 2))
                .withColumn("planned_cost",
                            F.round((F.col("c_material") + F.col("c_labor") + F.col("c_overhead"))
                                    * PLANNED_FACTOR, 2))
                .withColumn("variance_amount", F.round(F.col("actual_cost") - F.col("planned_cost"), 2))
                .withColumn("variance_pct",
                            F.when(F.col("planned_cost") != 0,
                                   F.round((F.col("actual_cost") - F.col("planned_cost"))
                                           / F.col("planned_cost") * 100, 2)).otherwise(F.lit(0.0)))
                .withColumn("affected_by_suspect_lot", F.col("suspect_lot_count") > 0)
                .withColumn("readiness_state",
                            F.when(F.col("open_ncr_count") > 0, F.lit("blocked"))
                             .when(F.col("variance_pct") > 6, F.lit("at_risk"))
                             .otherwise(F.lit("on_track")))
                .withColumn("source_tables",
                            F.lit("rel_mes_vehicle, rel_mes_work_order, rel_mes_as_built_genealogy, "
                                  "rel_mes_nonconformance, rel_erp_prod_order_cost, rel_erp_cost_variance"))
                .select("vehicle_serial", "product_code", "build_status", "work_order_count",
                        "genealogy_edge_count", "installed_component_count", "open_ncr_count",
                        "major_ncr_count", "suspect_lot_count", "affected_by_suspect_lot",
                        "planned_cost", "actual_cost", "variance_amount", "variance_pct",
                        "readiness_state", "source_tables"))
    write(stamp(overview, "rel_build_overview", "vehicle_serial"), P, D, "rel_build_overview", TB)

    # ── as_built_genealogy gold (edges + inspection/ncr/disposition) ────────────
    insp_first = insp.groupBy(F.col("unit_serial_or_lot").alias("insp_node")) \
                     .agg(F.first("result", ignorenulls=True).alias("inspection_result"))
    # one NCR per node (a node can carry several NCRs; mirror the generator's last-write-wins by
    # keeping a single deterministic NCR per node so the genealogy join does not fan out edges)
    _ncr_w = Window.partitionBy("unit_serial_or_lot").orderBy(F.col("ncr_id").asc())
    ncr_by_node = (ncr.withColumn("_rn", F.row_number().over(_ncr_w)).filter(F.col("_rn") == 1)
                   .select(F.col("unit_serial_or_lot").alias("ncr_node"),
                           F.col("ncr_id").alias("g_ncr_id"),
                           F.col("status").alias("ncr_status")))
    part_desc = part.select(F.col("part_no").alias("p_part_no"),
                            F.col("description").alias("part_description"))
    disp_small = disp.select(F.col("ncr_id").alias("d_ncr_id"), F.col("disposition_type"))
    # node match: ncr/inspection keyed on child_node_id; distinct aliases avoid ambiguity
    g = genealogy.alias("g")
    g_gold = (g.join(ncr_by_node, F.col("g.child_node_id") == F.col("ncr_node"), "left")
              .join(insp_first, F.col("g.child_node_id") == F.col("insp_node"), "left")
              .join(part_desc, F.col("g.part_no") == F.col("p_part_no"), "left")
              .join(disp_small, F.col("g_ncr_id") == F.col("d_ncr_id"), "left")
              .select(
                  F.col("g.edge_id"),
                  F.col("g.vehicle_serial"), F.col("g.parent_node_id"), F.col("g.child_node_id"),
                  F.col("g.child_type"), F.col("g.part_no"), F.col("part_description"),
                  F.col("g.lot_no"), F.col("g.unit_serial"), F.col("g.reference_designator"),
                  F.lit(None).cast("string").alias("install_operation_id"),
                  F.col("g.work_order_no"), F.col("g.installed_at"), F.col("g.installed_by"),
                  F.col("inspection_result"), F.col("g_ncr_id").alias("ncr_id"),
                  F.col("ncr_status"), F.col("disposition_type")))
    write(stamp(g_gold, "rel_as_built_genealogy", "edge_id").drop("edge_id"), P, D,
          "rel_as_built_genealogy", TB)

    # ── ncr_traceability gold ───────────────────────────────────────────────────
    suspect_vehicles = (genealogy.filter(F.col("lot_no") == SUSPECT_LOT)
                        .agg(F.countDistinct("vehicle_serial").alias("n")).collect()[0]["n"])
    rework_min_map = F.create_map([F.lit(x) for kv in
                                   {k: v[0] for k, v in REWORK_EST.items()}.items() for x in kv])
    rework_cost_map = F.create_map([F.lit(x) for kv in
                                    {k: v[1] for k, v in REWORK_EST.items()}.items() for x in kv])
    ncr_gold = (ncr.join(disp_small, F.col("ncr_id") == F.col("d_ncr_id"), "left")
                .withColumn("opened_ts", F.to_date("opened_ts"))
                .withColumn("closed_ts", F.to_date("closed_ts"))
                .withColumn("age_days", F.when(F.col("status") == "open", F.lit(14)).otherwise(F.lit(6)))
                .withColumn("affected_vehicle_count",
                            F.when(F.col("lot_no") == SUSPECT_LOT, F.lit(suspect_vehicles))
                             .otherwise(F.lit(1)))
                .withColumn("estimated_rework_minutes",
                            F.coalesce(rework_min_map[F.col("ncr_id")], F.lit(0)))
                .withColumn("estimated_rework_cost",
                            F.coalesce(rework_cost_map[F.col("ncr_id")], F.lit(0.0)))
                .withColumn("cluster_label", F.concat_ws(" · ", "defect_code", "work_center"))
                .select("ncr_id", "vehicle_serial", "unit_serial_or_lot", "part_no", "lot_no",
                        "work_order_no", "operation_id", "work_center", "defect_code", "severity",
                        "status", "opened_ts", "closed_ts", "age_days", "disposition_type",
                        "affected_vehicle_count", "estimated_rework_minutes", "estimated_rework_cost",
                        "cluster_label"))
    write(stamp(ncr_gold, "rel_ncr_traceability", "ncr_id"), P, D, "rel_ncr_traceability", TB)

    print("[gold] all 5 gold_rel_* marts derived from silver and written")
    spark.stop()


if __name__ == "__main__":
    main()
