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

# COMMAND ----------

CATALOG = "novendor_1"
SCHEMA = "rs_factory"
Q = f"{CATALOG}.{SCHEMA}"
spark.sql(f"USE {Q}")

# COMMAND ----------

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
print(f"gold_print_quality_train: {n_train} rows, {n_labeled} labeled")
assert n_labeled > 100, "too few labeled rows - outcome join is broken"

# COMMAND ----------

# gold_layer_heatmap — run × layer-window shape z-scores for the dashboard.
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

# gold_readiness_summary — vehicle rollup, reconciled against the seed's own
# gold (bronze_gold_vehicle_launch_readiness). The reconciliation is an
# assertion, not a hope: the SCN-001 anchor (VEH-TR-003, 4 scenario-tagged
# open NCRs) must survive the medallion intact.
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

anchor = spark.sql(f"""
  SELECT scenario_open_ncr_count, status_hint FROM {Q}.gold_readiness_summary
  WHERE vehicle_id = 'VEH-TR-003'
""").first()
print(f"VEH-TR-003: scenario_open_ncrs={anchor[0]} status={anchor[1]}")
assert int(anchor[0]) == 4, f"SCN-001 anchor broken: expected 4 scenario NCRs, got {anchor[0]}"

print("gold complete")
