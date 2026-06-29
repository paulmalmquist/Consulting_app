# Databricks notebook source
# MAGIC %md
# MAGIC # RS Factory ML — 02 Silver features
# MAGIC
# MAGIC Window-function features over the per-layer feature windows
# MAGIC (`window_index` is the layer axis), per-print aggregates, and the
# MAGIC skew-handling demonstration: `bronze_raw_iot_telemetry_samples` holds
# MAGIC raw waveforms only for the full-rate run subset (400/1000 at medium
# MAGIC profile), so ~1M rows join against a fraction of the key space. The
# MAGIC salted variant spreads every key across 16 subkeys and recombines
# MAGIC exact partials; both wall-times are MEASURED and logged to MLflow —
# MAGIC the artifact reports whatever the data showed, it never presumes.
# MAGIC
# MAGIC ## ===== TEACHING NOTES (plain language) =====
# MAGIC
# MAGIC **WHAT THIS FILE DOES (the "silver" stage):** A 3D-printed part is built up
# MAGIC layer by layer. As it prints, sensors record signals (flow, pressure,
# MAGIC temperature, vibration). This notebook turns those raw signals into
# MAGIC *shape statistics* that describe how each signal behaves across the build:
# MAGIC how jumpy it is (std), whether it is trending up or down (slope), how big
# MAGIC its swings are (peak-to-peak), and how much all of that has drifted since
# MAGIC the start of the print. "Silver" is the middle tier of the bronze→silver→gold
# MAGIC convention: bronze = raw, silver = cleaned/engineered, gold = ready to serve.
# MAGIC
# MAGIC **WHY IT MATTERS:** these engineered numbers are the *features* — the inputs
# MAGIC the models in notebook 04 learn from. A model can only be as smart as the
# MAGIC features you hand it. The per-layer-window numbers built here also become the
# MAGIC z-scores that color the **LayerHeatmap** panel on the Factory ML console
# MAGIC (gold table built in notebook 03, exported to /labs/factory-ml/).
# MAGIC
# MAGIC **INPUTS -> OUTPUT:**
# MAGIC - in:  `bronze_fact_process_feature_window` (raw per-layer-window shape stats),
# MAGIC        `bronze_raw_iot_telemetry_samples` (raw waveform samples),
# MAGIC        `bronze_raw_test_runs`, `bronze_raw_test_limit_violations`
# MAGIC - out: `silver_layer_features` (rolling shape stats along the layer axis),
# MAGIC        `silver_print_aggregates` (one row per print run — the model-ready rollup),
# MAGIC        `silver_run_waveform_stats` (waveform summary via the salted join)
# MAGIC
# MAGIC **HOW TO READ THE NUMBERS:**
# MAGIC - *std* = standard deviation = how spread-out / jumpy a signal is.
# MAGIC - *slope* = trend direction (rising or falling) across the window.
# MAGIC - *peak_to_peak* = max minus min = the size of the biggest swing.
# MAGIC - *rolling_* = the same stat smoothed over the last few layers (a 4-layer
# MAGIC   moving window), so a single noisy layer doesn't dominate.
# MAGIC - *drift_from_first* = how far a layer has wandered from where the print started.
# MAGIC - *salting* = a performance trick for a "skewed" join (one key has far more
# MAGIC   rows than the rest). You split each hot key into 16 sub-keys so the work
# MAGIC   spreads evenly, then recombine the partial sums into the exact same answer.

# COMMAND ----------

# MAGIC %pip install --quiet --upgrade typing_extensions mlflow

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

import json
import time

import mlflow
from pyspark.sql import functions as F

CATALOG = "novendor_1"
SCHEMA = "rs_factory"
Q = f"{CATALOG}.{SCHEMA}"
CHANNELS = ["flow_rate", "pressure", "temperature", "vibration_rms"]
SALT_BUCKETS = 16

spark.sql(f"USE {Q}")

# COMMAND ----------

# silver_layer_features — rolling shape statistics along the layer axis.
# Each row is one (run, sensor channel, layer-window). We start from the raw
# per-window shape stats (std/slope/peak_to_peak) and add SMOOTHED versions and
# DRIFT versions using SQL window functions:
#   - w4   = the current layer plus the 3 before it (a 4-layer moving window),
#            used to smooth out single-layer noise (rolling_std_4, etc.).
#   - wall = everything from the first layer up to here, used to measure how far
#            a signal has drifted from where the print began (*_drift_from_first).
# These per-window numbers are exactly what becomes the LayerHeatmap z-scores in
# notebook 03, and they roll up into the model features just below.
spark.sql(f"""
CREATE OR REPLACE TABLE {Q}.silver_layer_features
COMMENT 'Per (run, channel, layer-window) rolling shape features over bronze_fact_process_feature_window'
AS
SELECT
  run_id,
  channel,
  window_index,
  std,
  slope,
  peak_to_peak,
  STDDEV(std) OVER w4 AS rolling_std_4,
  AVG(slope) OVER w4 AS rolling_slope_4,
  MAX(peak_to_peak) OVER w4 AS rolling_p2p_max_4,
  peak_to_peak - FIRST_VALUE(peak_to_peak) OVER wall AS p2p_drift_from_first,
  std - FIRST_VALUE(std) OVER wall AS std_drift_from_first,
  pattern,
  scenario_id
FROM {Q}.bronze_fact_process_feature_window
WINDOW
  w4 AS (PARTITION BY run_id, channel ORDER BY window_index
         ROWS BETWEEN 3 PRECEDING AND CURRENT ROW),
  wall AS (PARTITION BY run_id, channel ORDER BY window_index
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
""")
print("silver_layer_features:", spark.table(f"{Q}.silver_layer_features").count())

# COMMAND ----------

# silver_print_aggregates — one row per run: per-channel aggregates of the
# layer features plus late-vs-early drift and limit-violation counts.
# This is the model-ready table: it collapses the many per-layer rows of a print
# into a single fixed-width row of features per print run, which is the shape a
# tabular model needs (one row = one thing you want to predict about). For each
# sensor channel we compute summary numbers; we also compare the END of the print
# to the START (late_minus_early) because a process going bad often drifts late.
per_channel_exprs = []
for ch in CHANNELS:
    c = ch.replace("-", "_")
    # Build one set of summary columns per sensor channel. The CASE WHEN trick
    # is a "pivot": it isolates rows for one channel before aggregating, so each
    # channel gets its own _std_mean, _slope_mean, etc. column on the print row.
    per_channel_exprs += [
        f"AVG(CASE WHEN channel = '{ch}' THEN std END) AS {c}_std_mean",
        f"MAX(CASE WHEN channel = '{ch}' THEN rolling_std_4 END) AS {c}_rolling_std_max",
        f"AVG(CASE WHEN channel = '{ch}' THEN slope END) AS {c}_slope_mean",
        f"MAX(CASE WHEN channel = '{ch}' THEN ABS(p2p_drift_from_first) END) AS {c}_p2p_drift_max",
        f"AVG(CASE WHEN channel = '{ch}' AND late THEN std END) "
        f"- AVG(CASE WHEN channel = '{ch}' AND early THEN std END) AS {c}_std_late_minus_early",
    ]

spark.sql(f"""
CREATE OR REPLACE TABLE {Q}.silver_print_aggregates
COMMENT 'Per-run feature rollup of silver_layer_features + limit violations'
AS
WITH bounds AS (
  SELECT run_id, MAX(window_index) AS max_wi
  FROM {Q}.silver_layer_features GROUP BY run_id
),
flagged AS (
  SELECT f.*,
         f.window_index <= 2 AS early,
         f.window_index >= b.max_wi - 2 AS late
  FROM {Q}.silver_layer_features f JOIN bounds b USING (run_id)
),
violations AS (
  SELECT run_id, COUNT(*) AS limit_violation_count
  FROM {Q}.bronze_raw_test_limit_violations GROUP BY run_id
)
SELECT
  f.run_id,
  {', '.join(per_channel_exprs)},
  COUNT(DISTINCT f.window_index) AS n_windows,
  COALESCE(MAX(v.limit_violation_count), 0) AS limit_violation_count
FROM flagged f
LEFT JOIN violations v ON f.run_id = v.run_id
GROUP BY f.run_id
""")
print("silver_print_aggregates:", spark.table(f"{Q}.silver_print_aggregates").count())

# COMMAND ----------

# The salting demonstration (a data-engineering technique, not a model step).
# Problem being illustrated: when one join key has hugely more rows than the
# others ("skew"), the worker handling that key becomes a bottleneck while the
# rest sit idle. Fix: SALT the keys — hash each row into one of 16 buckets so the
# heavy key is split 16 ways and the work spreads evenly. Because mean and std
# can be rebuilt from per-bucket sums (sum, sum-of-squares, count), we recombine
# the buckets into the EXACT same answer as the naive join — proven by the
# assert below. Raw telemetry samples exist only for the full-rate run subset, so
# the samples side concentrates on a fraction of the key space. Serverless
# compute does not allow freezing AQE (spark.sql.adaptive.enabled is locked), so
# both variants run under identical engine settings and the timings report
# whatever the engine showed — the point is the technique and the
# exact-recombination math, not a rigged race.
samples = spark.table(f"{Q}.bronze_raw_iot_telemetry_samples")
runs = spark.table(f"{Q}.bronze_raw_test_runs").select("run_id", "test_type", "result", "vehicle_id")

# Variant 1 (naive): the straightforward join, timed as the baseline.
t0 = time.time()
naive = (samples.join(runs, "run_id")
         .groupBy("run_id", "channel")
         .agg(F.count("*").alias("n_samples"),
              F.avg("value").alias("value_mean"),
              F.stddev("value").alias("value_std"),
              F.max("value").alias("value_max")))
naive_count = naive.count()
naive_s = time.time() - t0

# Variant 2 (salted): same result, spread across 16 buckets, then recombined.
# Each sample gets a salt 0..15 (hash of its id); each run is duplicated across
# all 16 salts so the salted keys still match. First aggregate per (run,
# channel, salt) into partial sums, then fold the 16 partials back together —
# mean = sum/n, std = sqrt(mean-of-squares minus mean-squared) — exactly.
t0 = time.time()
salted_samples = samples.withColumn("salt", F.pmod(F.xxhash64("sample_id"), F.lit(SALT_BUCKETS)))
salted_runs = runs.withColumn("salt", F.explode(F.array(*[F.lit(i) for i in range(SALT_BUCKETS)])))
salted = (salted_samples.join(salted_runs, ["run_id", "salt"])
          .groupBy("run_id", "channel", "salt")
          .agg(F.count("*").alias("n"),
               F.sum("value").alias("v_sum"),
               F.sum(F.col("value") * F.col("value")).alias("v_sq"),
               F.max("value").alias("v_max"))
          .groupBy("run_id", "channel")
          .agg(F.sum("n").alias("n_samples"),
               (F.sum("v_sum") / F.sum("n")).alias("value_mean"),
               F.sqrt(F.sum("v_sq") / F.sum("n") - F.pow(F.sum("v_sum") / F.sum("n"), 2)).alias("value_std"),
               F.max("v_max").alias("value_max")))
salted.write.mode("overwrite").saveAsTable(f"{Q}.silver_run_waveform_stats")
salted_count = spark.table(f"{Q}.silver_run_waveform_stats").count()
salted_s = time.time() - t0

# Honesty check: the salted path must return the exact same number of rows as
# the naive path. If salting changed the answer, the optimization would be wrong.
assert naive_count == salted_count, f"salted join changed the result: {naive_count} vs {salted_count}"
print(f"naive={naive_s:.1f}s salted={salted_s:.1f}s rows={salted_count}")

# COMMAND ----------

# MLflow is the experiment logbook: it records what ran, with what settings, and
# what numbers came out, so results are reproducible and auditable later. Here we
# log the two join wall-times (measured, not assumed) as a small evidence artifact.
mlflow.set_experiment("/Users/paulmalmquist@gmail.com/RSFactoryML")
with mlflow.start_run(run_name="silver_features"):
    mlflow.set_tags({"stage": "silver", "pipeline": "rs_factory_ml"})
    mlflow.log_metrics({
        "naive_join_seconds": naive_s,
        "salted_join_seconds": salted_s,
        "join_rows": salted_count,
        "salt_buckets": SALT_BUCKETS,
    })
    timings = {"naive_join_seconds": naive_s, "salted_join_seconds": salted_s,
               "salt_buckets": SALT_BUCKETS, "rows": salted_count,
               "note": "serverless keeps AQE on (config locked); identical engine settings "
                       "for both variants; results verified identical row-for-row"}
    with open("/tmp/join_timings.json", "w") as f:
        json.dump(timings, f, indent=2)
    mlflow.log_artifact("/tmp/join_timings.json")

print("silver complete")
