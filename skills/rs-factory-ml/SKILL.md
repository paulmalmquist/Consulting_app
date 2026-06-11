---
id: rs-factory-ml
kind: skill
status: active
source_of_truth: true
topic: rs-factory-ml
owners:
  - data
intent_tags:
  - databricks
  - medallion
  - mlflow
  - rs-analytics
entrypoint: false
handoff_to:
  - feature-dev
when_to_use: "Use for the RS Factory flight-readiness ML pipeline: loading rs_factory_seed builds into novendor_1.rs_factory, the silver/gold medallion, XGBoost training with MLflow, the Delta time-travel demo, and the factory-ml dashboard exports."
when_not_to_use: "Not for the historyrhymes or ncf_ml schemas (separate pipelines, never cross-write), not for editing rs_factory_seed (owned by the generator PRs), not for streaming telemetry (that is the Stargate lane)."
name: rs-factory-ml
description: "Databricks medallion + ML over the deterministic rs_factory_seed build: bronze loader with fail-closed manifest counts, PySpark silver features with an explicit salted join, gold feature store joining QMS outcomes, XGBoost + MLflow training with GroupKFold and SHAP, Delta time travel, and static JSON exports for the factory-ml dashboard."
---

# RS Factory ML

Batch ML lane of the RS demo campaign (Epic #497 / Feature #531). Everything
runs against catalog `novendor_1`, schema `rs_factory` — never the
historyrhymes or ncf_ml schemas. The Databricks REST client is the
historyrhymes one, wrapped (not copied) in `scripts/databricks_client.py`.

## Connection

- Workspace `https://dbc-2504bec5-b5ab.cloud.databricks.com` (AWS), SQL
  warehouse `0e56420fb707d861` (Small, auto-stop 15 min).
- Auth: `DATABRICKS_PAT` env var. Pull it with the repo's standard flow:
  `vercel env pull --environment production` (key `DATABRICKS_PAT`).
- MLflow experiment `/Users/paulmalmquist@gmail.com/RSFactoryML`; notebooks
  imported under `/Users/paulmalmquist@gmail.com/rs_factory_ml` and run as
  serverless jobs.

## Pipeline

```
python -m rs_factory_seed build --profile medium     # fixture (in rs_factory_seed/)
python run_pipeline.py                               # load -> silver -> gold -> train -> export
python scripts/time_travel_demo.py                   # the Delta rollback transcript
python -m pytest skills/rs-factory-ml/tests -q       # local checks (no Databricks)
```

Stages:

1. **load** — parquet → UC volume (`--transport dbfs` fallback) →
   `bronze_<table>` CTAS with `_loaded_at` + `_build_sha` (the manifest's
   sqlite dump sha). Fail closed: COUNT(*) must equal the manifest row_count.
2. **silver** — `silver_layer_features` (rolling window stats along
   `window_index`, the layer axis), `silver_print_aggregates`, and
   `silver_run_waveform_stats` via the explicit 16-bucket salted join against
   the sparse raw-sample table (waveforms exist only for the full-rate run
   subset); naive-vs-salted timings are measured and logged to MLflow
   (`join_timings.json`) — reported, never presumed.
3. **gold** — `gold_print_quality_train` (run → article → serial → QMS
   outcomes; targets `min_strength_margin` — a tolerance-margin stand-in for
   tensile strength, stated as such — and `passed`), `gold_layer_heatmap`,
   `gold_readiness_summary` (asserts the SCN-001 anchor: VEH-TR-003 with 4
   scenario NCRs).
4. **train** — XGBoost regressor + classifier with Ridge / calibrated-LR
   baselines, **GroupKFold by part_id** (no event-time in the seed; grouped CV
   is the honest split), SHAP top-15, leakage-exclusion manifest (`pattern`,
   `template`, `result` never enter features), models registered as
   `novendor_1.rs_factory.rs_print_strength` / `rs_print_passfail`.
5. **export** — static JSON to `repo-b/public/labs/factory-ml/` for the
   factory-ml page. Committed on purpose: deterministic seed → reviewable
   diffs. Live serving via `backend/app/data/databricks_source.py` is a
   documented follow-up, not part of this lane.

## Banned patterns

```
- Writing to novendor_1.historyrhymes or novendor_1.ncf_ml
- Editing rs_factory_seed/** (read-only fixture; rebuild, never patch)
- Leaving the SQL warehouse running after a pipeline run
- Training features that include pattern, template, or result (leakage)
- Presenting min_strength_margin as real tensile strength (it is a stated stand-in)
```
