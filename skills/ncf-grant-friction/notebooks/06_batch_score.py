# Databricks notebook source
# MAGIC %md
# MAGIC # NCF Grant Friction — 06 Batch Score
# MAGIC
# MAGIC Score open (non-terminal) grants with the latest calibrated model.
# MAGIC Writes to `gold_grant_friction_preds` with SHAP-derived top drivers.

# COMMAND ----------

import json
import numpy as np
import pandas as pd
import mlflow
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, TimestampType,
)

CATALOG = "novendor_1"
SCHEMA = "ncf_ml"
SILVER_FEATURES = f"{CATALOG}.{SCHEMA}.silver_feature_store"
BRONZE_GRANTS = f"{CATALOG}.{SCHEMA}.bronze_grants"
GOLD_PREDS = f"{CATALOG}.{SCHEMA}.gold_grant_friction_preds"

MODEL_NAME = "ncf_grant_friction"
MODEL_STAGE = "Production"  # or "Staging" for demo

# Load latest calibrated model.
model_uri = f"models:/{MODEL_NAME}/{MODEL_STAGE}"
model = mlflow.sklearn.load_model(model_uri)
client = mlflow.MlflowClient()
version_info = client.get_latest_versions(MODEL_NAME, stages=[MODEL_STAGE])[0]
model_version_str = f"{MODEL_NAME}@v{version_info.version}"
run_id = version_info.run_id

# COMMAND ----------

# Open grants only.
open_stages = ["recommended", "qualified", "approved"]
open_grants = spark.table(BRONZE_GRANTS).filter(F.col("stage").isin(open_stages))
features = spark.table(SILVER_FEATURES).join(
    open_grants.select("grant_id", "env_id", "business_id"), "grant_id", "inner",
)

pdf = features.toPandas()
if pdf.empty:
    print("no open grants to score")
    dbutils.notebook.exit("ok")  # type: ignore[name-defined]

# Must match training feature set exactly. Load manifest from the training run if available.
CATEGORICAL = ["grant_reporting_lens"]
NUMERIC = [
    "log_grant_amount",
    "recommendation_month",
    "recommendation_dow",
    "is_fiscal_year_end_window",
    "office_grants_in_flight",
    "office_prior_grants_90d",
    "office_exception_rate_90d",
    "donor_prior_grant_count_365d",
    "donor_prior_exception_rate_365d",
    "days_since_prior_grant",
    "charity_prior_grants_received_365d",
    "charity_prior_exception_rate_365d",
    "prior_exception_on_same_charity",
    "prior_exception_on_same_donor",
]
pdf["days_since_prior_grant"] = pdf["days_since_prior_grant"].fillna(9999)
X = pd.get_dummies(pdf[CATEGORICAL + NUMERIC], columns=CATEGORICAL, dummy_na=True)

# Align to model's expected feature columns (pad missing, drop extras).
expected = getattr(model, "feature_names_in_", None)
if expected is not None:
    for col in expected:
        if col not in X.columns:
            X[col] = 0
    X = X[list(expected)]

p = model.predict_proba(X)[:, 1]

# Bands — thresholds loaded from training run.
run = client.get_run(run_id)
thr = float(run.data.metrics.get("chosen_threshold", 0.5))
WATCH = max(0.0, thr * 0.6)

def band(score: float) -> str:
    if score >= thr:
        return "high"
    if score >= WATCH:
        return "watch"
    return "low"

# SHAP top-3 drivers per row (best-effort; falls back to global importance).
try:
    import shap
    underlying = model.calibrated_classifiers_[0].estimator if hasattr(model, "calibrated_classifiers_") else model
    explainer = shap.TreeExplainer(underlying)
    shap_vals = explainer.shap_values(X)

    def top_drivers(i: int) -> list[dict]:
        contribs = shap_vals[i]
        idx = np.argsort(np.abs(contribs))[::-1][:3]
        return [
            {
                "feature": str(X.columns[j]),
                "direction": "+" if contribs[j] > 0 else "-",
                "contribution": float(abs(contribs[j])),
            }
            for j in idx
        ]
    drivers = [top_drivers(i) for i in range(len(X))]
except Exception as exc:
    print(f"shap unavailable: {exc}; emitting empty drivers")
    drivers = [[] for _ in range(len(X))]

brier = float(run.data.metrics.get("mean_fold0_xgb_brier", 0.0))
now = pd.Timestamp.utcnow()

out = pd.DataFrame({
    "env_id": pdf["env_id"].astype(str),
    "business_id": pdf["business_id"].astype(str),
    "grant_id": pdf["grant_id"].astype(str),
    "risk_score": [round(float(s), 4) for s in p],
    "risk_band": [band(float(s)) for s in p],
    "top_drivers": [json.dumps(d) for d in drivers],
    "prediction_timestamp": now,
    "model_version": model_version_str,
    "model_run_id": run_id,
    "calibration_brier": brier,
    "confidence_note": None,
    "null_reason": None,
})

schema = StructType([
    StructField("env_id", StringType(), False),
    StructField("business_id", StringType(), False),
    StructField("grant_id", StringType(), False),
    StructField("risk_score", DoubleType(), True),
    StructField("risk_band", StringType(), True),
    StructField("top_drivers", StringType(), False),
    StructField("prediction_timestamp", TimestampType(), False),
    StructField("model_version", StringType(), False),
    StructField("model_run_id", StringType(), False),
    StructField("calibration_brier", DoubleType(), True),
    StructField("confidence_note", StringType(), True),
    StructField("null_reason", StringType(), True),
])

spark.createDataFrame(out, schema=schema).write.mode("overwrite").option(
    "overwriteSchema", "true"
).saveAsTable(GOLD_PREDS)

print(f"scored {len(out):,} grants into {GOLD_PREDS}")
