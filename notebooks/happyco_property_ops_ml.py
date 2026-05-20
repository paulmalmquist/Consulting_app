# Databricks notebook source
# MAGIC %md
# MAGIC # HappyCo Property Ops ML Proof
# MAGIC
# MAGIC Synthetic demo notebook for the HappyCo Property Ops Intelligence Kit.
# MAGIC
# MAGIC This notebook is Databricks-ready but does not claim a live Databricks run
# MAGIC unless executed in a workspace and paired with `databricks_run_receipt.json`.
# MAGIC
# MAGIC Architecture:
# MAGIC
# MAGIC Bronze operational extracts -> Silver canonical property ops records ->
# MAGIC Gold benchmark/features -> ML feature table -> model training -> batch
# MAGIC inference -> product/API predictions.

# COMMAND ----------

# MAGIC %md
# MAGIC ## 00. Setup
# MAGIC
# MAGIC In Databricks, install or attach runtime packages that include:
# MAGIC
# MAGIC - scikit-learn
# MAGIC - numpy
# MAGIC
# MAGIC The local fallback command is:
# MAGIC
# MAGIC ```powershell
# MAGIC python scripts/happyco/train_property_ops_ml.py --fixture backend/app/fixtures/winston_demo/happyco_property_ops_seed.json --out artifacts/happyco/ml
# MAGIC ```

# COMMAND ----------

from pathlib import Path
import sys

REPO_ROOT = Path.cwd()
if (REPO_ROOT / "backend").exists():
    sys.path.insert(0, str(REPO_ROOT / "backend"))
elif (REPO_ROOT.parent / "backend").exists():
    REPO_ROOT = REPO_ROOT.parent
    sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services import operator_property_ops as property_ops_svc

# COMMAND ----------

# MAGIC %md
# MAGIC ## 01. Bronze operational extracts
# MAGIC
# MAGIC The synthetic fixture stands in for operational extracts from:
# MAGIC
# MAGIC - Happy Property
# MAGIC - Legacy inspections
# MAGIC - Vendor portal
# MAGIC - Resident ops
# MAGIC - CMMS export
# MAGIC
# MAGIC In production, this layer would be Delta bronze tables with raw source
# MAGIC payloads, ingestion timestamps, source file/job identifiers, and data-quality
# MAGIC expectations.

# COMMAND ----------

dataset = property_ops_svc.get_dataset()
dataset["metadata"]

# COMMAND ----------

# MAGIC %md
# MAGIC ## 02. Silver canonical property operations records
# MAGIC
# MAGIC The service materializes canonical operators, properties, buildings, units,
# MAGIC inspections, findings, work orders, vendors, resolution events, resident
# MAGIC impact events, and entity-resolution records.

# COMMAND ----------

{
    "operators": len(dataset["operators"]),
    "properties": len(dataset["properties"]),
    "buildings": len(dataset["buildings"]),
    "units": len(dataset["units"]),
    "inspections": len(dataset["inspections"]),
    "findings": len(dataset["findings"]),
    "work_orders": len(dataset["work_orders"]),
    "vendors": len(dataset["vendors"]),
    "resolution_events": len(dataset["resolution_events"]),
    "resident_impact_events": len(dataset["resident_impact_events"]),
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## 03. Gold benchmark and feature tables
# MAGIC
# MAGIC The ML feature rows are derived from canonical entities and benchmark-ready
# MAGIC operational metrics. Missing source values remain explicit; the local model
# MAGIC script applies simple numeric imputation only for model fitting and records
# MAGIC the caveat in the model card.

# COMMAND ----------

feature_rows = property_ops_svc.ml_feature_rows()
feature_rows[:3]

# COMMAND ----------

# MAGIC %md
# MAGIC ## 04. Local fallback training
# MAGIC
# MAGIC For local execution, run the checked-in script from the repository root.
# MAGIC In Databricks, either:
# MAGIC
# MAGIC 1. port the helper logic into notebook cells, or
# MAGIC 2. use a repo checkout and call `scripts/happyco/train_property_ops_ml.py`.
# MAGIC
# MAGIC Outputs:
# MAGIC
# MAGIC - `artifacts/happyco/ml/feature_table.csv`
# MAGIC - `artifacts/happyco/ml/predictions.csv`
# MAGIC - `artifacts/happyco/ml/model_metrics.json`
# MAGIC - `artifacts/happyco/ml/feature_importance.csv`
# MAGIC - `artifacts/happyco/ml/model_card.md`
# MAGIC - `artifacts/happyco/ml/model_registry_record.json`
# MAGIC - `artifacts/happyco/databricks/databricks_run_receipt.json` after a
# MAGIC   verified Databricks job/notebook execution

# COMMAND ----------

# MAGIC %md
# MAGIC ## 05. Model honesty
# MAGIC
# MAGIC This is a synthetic demo model. If deterministic labels create unusually high
# MAGIC metrics, the model card must state that clearly. The proof is the platform
# MAGIC workflow and product integration pattern, not the accuracy number.

# COMMAND ----------

print("Databricks-ready notebook loaded. Run the local fallback script to generate artifacts.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 06. Live Databricks receipt contract
# MAGIC
# MAGIC After this notebook is executed as a Databricks notebook/job, export a receipt
# MAGIC with these fields:
# MAGIC
# MAGIC - `demo_mode: true`
# MAGIC - `data_source: synthetic_demo`
# MAGIC - `databricks_executed: true`
# MAGIC - `workspace_user`
# MAGIC - `job_id` if a job was used
# MAGIC - `run_id`
# MAGIC - `run_page_url`
# MAGIC - `notebook_path`
# MAGIC - `started_at`
# MAGIC - `finished_at`
# MAGIC - `status`
# MAGIC - `output_paths`
# MAGIC - `model_name`
# MAGIC - `model_version`
# MAGIC - `caveat: Synthetic demo data. Not HappyCo production data.`
# MAGIC - `claim_allowed: Databricks ML training run executed on synthetic property operations data.`
# MAGIC - `claim_not_allowed: Production HappyCo model trained/deployed.`
# MAGIC
# MAGIC The Winston API/UI only shows "Databricks run completed" when that receipt
# MAGIC exists and records a successful Databricks execution.
