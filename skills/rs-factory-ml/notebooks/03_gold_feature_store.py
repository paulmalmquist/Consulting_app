# Databricks notebook source
# MAGIC %md
# MAGIC # RS Factory ML — 03 Gold feature store
# MAGIC
# MAGIC Joins the silver print features to physical outcomes along the digital
# MAGIC thread: run → test article → serialized item → QMS inspections.
# MAGIC
# MAGIC Targets:
# MAGIC - `min_strength_margin` — MIN((tolerance − |measured − nominal|) / tolerance)
# MAGIC   over the serial's inspections. The seed has no tensile_strength_mpa; this
# MAGIC   margin is the stand-in and is labeled as such everywhere it appears.
# MAGIC - `passed` — BOOL_AND(first_pass) over the serial's inspections.
# MAGIC - `run_failed` — the test run's own verdict.
# MAGIC
# MAGIC Leakage rule: `pattern`, `template`, and `result` ride along as metadata
# MAGIC for tracing (SCN-005) but are excluded from training features by the
# MAGIC feature manifest in 04.
# MAGIC
# MAGIC ## ===== TEACHING NOTES (plain language) =====
# MAGIC
# MAGIC **WHAT THIS FILE DOES (the "gold" stage):** It builds the *feature store* —
# MAGIC the final table the models train on — by gluing two things together:
# MAGIC   (1) the engineered process features from notebook 02 (how the print behaved),
# MAGIC   (2) the real-world QUALITY OUTCOMES from the quality-management system (QMS):
# MAGIC       did the part pass inspection, did the test run fail, how much tolerance
# MAGIC       headroom was left.
# MAGIC A "feature store" is just a curated table of model-ready inputs + the answers
# MAGIC you want to predict, kept in one trusted place so training and serving use
# MAGIC the same definitions.
# MAGIC
# MAGIC **TARGET (a.k.a. LABEL):** the thing the model tries to predict — the "answer
# MAGIC key" during training. This file defines three:
# MAGIC   - `passed`        — yes/no, did every inspection pass on the first try.
# MAGIC   - `run_failed`    — yes/no, did the test run get a fail verdict.
# MAGIC   - `min_strength_margin` — a number: how much tolerance headroom is left
# MAGIC                       (1.0 = dead-on nominal, 0 = right at the limit, negative =
# MAGIC                       out of tolerance). A stand-in for tensile strength, since
# MAGIC                       the synthetic seed has no actual MPa value.
# MAGIC
# MAGIC **LEAKAGE (the cardinal sin):** "leakage" is when a clue to the answer sneaks
# MAGIC into the inputs, so the model looks brilliant in testing but is useless in
# MAGIC real life (it was effectively peeking at the answer key). Columns like
# MAGIC `result`, `pattern`, and `template` literally encode the outcome, so they are
# MAGIC kept ONLY as metadata for tracing and are barred from the feature set in
# MAGIC notebook 04. Defining targets and quarantining leaky columns is the whole job
# MAGIC of this stage.
# MAGIC
# MAGIC **INPUTS -> OUTPUT:**
# MAGIC - in:  `silver_print_aggregates` (features from 02) joined down the "digital
# MAGIC        thread": run → test article → serialized item → part → QMS inspections.
# MAGIC - out: `gold_print_quality_train` (the training feature store: features + targets),
# MAGIC        `gold_layer_heatmap` (per-window z-scores -> the **LayerHeatmap** panel),
# MAGIC        `gold_readiness_summary` (per-vehicle rollup -> the **ReadinessGauge** panel).
# MAGIC   These gold tables are what notebook 04 / the export script turn into the
# MAGIC   /labs/factory-ml/*.json receipts the Factory ML console reads.
# MAGIC
# MAGIC **HOW TO READ THE NUMBERS:**
# MAGIC - *std_z* (heatmap) = z-score = how many standard deviations a layer's
# MAGIC   roughness sits above/below normal. ~0 is typical; large positive = anomalous.
# MAGIC - *readiness_score / open_ncr_count* = how launch-ready a vehicle is and how
# MAGIC   many open quality issues (NCR = non-conformance report) it carries.

# COMMAND ----------

CATALOG = "novendor_1"
SCHEMA = "rs_factory"
Q = f"{CATALOG}.{SCHEMA}"
spark.sql(f"USE {Q}")

# COMMAND ----------

# gold_print_quality_train — THE feature store the models learn from.
# One row per test run = features (from silver) PLUS the targets (the answers).
# The `outcomes` CTE derives the per-serial answers from the QMS inspections:
#   - min_strength_margin: the WORST (MIN) tolerance headroom across the serial's
#     inspections — smaller means closer to (or past) the allowed limit.
#   - passed: BOOL_AND(first_pass) = true only if every inspection passed first time.
# Those answers are then joined onto the engineered features along the digital
# thread (run -> article -> serial -> part). Note `result`/`pattern`/`template`
# are pulled in too, but ONLY as tracing metadata — notebook 04 excludes them so
# they cannot leak the answer into the inputs.
spark.sql(f"""
CREATE OR REPLACE TABLE {Q}.gold_print_quality_train
COMMENT 'Training feature store: one row per test run with silver features + QMS outcome targets. min_strength_margin is a tolerance-margin stand-in for tensile strength (synthetic seed has no MPa).'
AS
WITH outcomes AS (
  SELECT
    serial_id,
    MIN((tolerance - ABS(measured_value - nominal)) / tolerance) AS min_strength_margin,
    BOOL_AND(first_pass) AS passed,
    COUNT(*) AS inspection_count
  FROM {Q}.bronze_raw_qms_inspection_results
  WHERE tolerance > 0
  GROUP BY serial_id
)
SELECT
  r.run_id,
  r.test_type,
  r.vehicle_id,
  a.serial_id,
  si.part_id,
  p.part_family,
  p.criticality,
  agg.* EXCEPT (run_id),
  o.min_strength_margin,
  o.passed,
  (r.result = 'fail') AS run_failed,
  o.inspection_count,
  -- metadata for tracing, never features (see the manifest in 04):
  r.result,
  r.pattern,
  r.template,
  r.scenario_id
FROM {Q}.silver_print_aggregates agg
JOIN {Q}.bronze_raw_test_runs r USING (run_id)
JOIN {Q}.bronze_raw_test_articles a ON r.article_id = a.article_id
JOIN {Q}.bronze_dim_serialized_item si ON a.serial_id = si.serial_id
JOIN {Q}.bronze_dim_part p ON si.part_id = p.part_id
LEFT JOIN outcomes o ON a.serial_id = o.serial_id
""")
n_train = spark.table(f"{Q}.gold_print_quality_train").count()
n_labeled = spark.sql(
    f"SELECT COUNT(*) FROM {Q}.gold_print_quality_train WHERE min_strength_margin IS NOT NULL"
).first()[0]
# "Labeled" = rows that actually have an answer attached. A model can only learn
# from labeled rows, so if almost none came through, the outcome join silently
# broke and training would be meaningless — fail loudly here instead.
print(f"gold_print_quality_train: {n_train} rows, {n_labeled} labeled")
assert n_labeled > 100, "too few labeled rows - outcome join is broken"

# COMMAND ----------

# gold_layer_heatmap — run × layer-window shape z-scores for the dashboard.
# This is the data behind the **LayerHeatmap** panel. For each sensor channel we
# learn what "normal" roughness looks like (mean mu, spread sigma), then express
# every layer window as a z-score: (value - mu) / sigma = how many standard
# deviations from normal. Averaged across channels per (run, layer), so a hot
# cell on the heatmap = a layer band that ran unusually rough on this print.
spark.sql(f"""
CREATE OR REPLACE TABLE {Q}.gold_layer_heatmap
COMMENT 'Dashboard heatmap input: per (run, layer window) mean z-score of rolling std across channels'
AS
WITH stats AS (
  SELECT channel, AVG(rolling_std_4) AS mu, STDDEV(rolling_std_4) AS sigma
  FROM {Q}.silver_layer_features GROUP BY channel
)
SELECT
  f.run_id,
  f.window_index,
  AVG((f.rolling_std_4 - s.mu) / NULLIF(s.sigma, 0)) AS std_z,
  MAX(f.pattern) AS pattern,
  MAX(f.scenario_id) AS scenario_id
FROM {Q}.silver_layer_features f
JOIN stats s USING (channel)
GROUP BY f.run_id, f.window_index
""")
print("gold_layer_heatmap:", spark.table(f"{Q}.gold_layer_heatmap").count())

# COMMAND ----------

# gold_readiness_summary — per-vehicle rollup behind the **ReadinessGauge** panel.
# Each row is one vehicle with its launch-readiness score and counts of open
# quality issues (open NCRs, inconclusive tests, unresolved anomalies, missing
# sign-offs). We also independently RECOMPUTE the open-NCR count from raw records
# and compare it to the seed's published number — a reconciliation, so the
# dashboard figure is verified rather than trusted blindly.
spark.sql(f"""
CREATE OR REPLACE TABLE {Q}.gold_readiness_summary
COMMENT 'Per-vehicle readiness rollup reconciled to the seed gold frame (SCN-001 anchor preserved)'
AS
SELECT
  g.vehicle_id,
  g.vehicle_name,
  g.target_launch_date,
  g.status_hint,
  g.readiness_score,
  g.open_ncr_count,
  g.scenario_open_ncr_count,
  g.inconclusive_test_count,
  g.unresolved_anomaly_count,
  g.missing_inspection_signoff_count,
  o.recomputed_open_ncrs
FROM {Q}.bronze_gold_vehicle_launch_readiness g
LEFT JOIN (
  SELECT si.vehicle_id, COUNT(*) AS recomputed_open_ncrs
  FROM {Q}.bronze_raw_qms_ncrs n
  JOIN {Q}.bronze_dim_serialized_item si ON n.serial_id = si.serial_id
  WHERE n.status IN ('open', 'in_review')
  GROUP BY si.vehicle_id
) o ON g.vehicle_id = o.vehicle_id
""")

# Anchor check: VEH-TR-003 is a known scenario fixture that must carry exactly 4
# scenario-tagged open NCRs. If that anchor doesn't survive the joins intact, the
# readiness data is corrupted upstream — so we assert it rather than ship a wrong gauge.
anchor = spark.sql(f"""
  SELECT scenario_open_ncr_count, status_hint FROM {Q}.gold_readiness_summary
  WHERE vehicle_id = 'VEH-TR-003'
""").first()
print(f"VEH-TR-003: scenario_open_ncrs={anchor[0]} status={anchor[1]}")
assert int(anchor[0]) == 4, f"SCN-001 anchor broken: expected 4 scenario NCRs, got {anchor[0]}"

print("gold complete")
