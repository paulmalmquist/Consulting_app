# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry — C-MAPSS FD001 Remaining Useful Life
# MAGIC Trains a RUL regressor on the Gold features for FD001 and evaluates on the held-out TEST
# MAGIC units (predict RUL at each unit's last observed cycle, compare to the official RUL truth).
# MAGIC Reports RMSE + the NASA PHM asymmetric score. No look-ahead: features are the no-look-ahead
# MAGIC rolling features built in the lakehouse; the model never sees test units during training.

# COMMAND ----------
import json
import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
from mlflow.models.signature import infer_signature
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LinearRegression

EXPERIMENT_ID = "3740651530987773"
TEL = "novendor_1.telemetry"
mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

RMSE_GATE = 25.0          # cycles; declared before training
RUL_CAP = 125             # standard C-MAPSS piecewise-linear RUL ceiling

# COMMAND ----------
feat = spark.table(f"{TEL}.gold_cmapss_features").toPandas()
rul_truth = spark.table(f"{TEL}.silver_cmapss_rul").toPandas()
feat = feat[feat.subset == "FD001"].copy()
rul_truth = rul_truth[rul_truth.subset == "FD001"].copy()

FEAT_COLS = [c for c in feat.columns if c.startswith("sensor_")]  # raw + rolling + roc sensor feats
print("FD001 feature rows", len(feat), "| feature cols", len(FEAT_COLS),
      "| test units", rul_truth.unit.nunique())

# COMMAND ----------
train = feat[feat.split == "train"].copy()
test = feat[feat.split == "test"].copy()

# Train target: capped RUL (piecewise-linear convention reduces early-life label noise).
train = train.dropna(subset=FEAT_COLS).copy()
train["y"] = np.minimum(train["rul_target"].to_numpy(), RUL_CAP)

# Test design: one row per unit = its LAST observed cycle; truth = official RUL_FD001.
test_last = test.sort_values(["unit", "cycle"]).groupby("unit").tail(1).copy()
test_last = test_last.merge(rul_truth[["unit", "rul"]], on="unit", how="inner")
test_last["y_true"] = np.minimum(test_last["rul"].to_numpy(), RUL_CAP)
test_last = test_last.dropna(subset=FEAT_COLS).copy()
print("train rows", len(train), "test units evaluated", len(test_last))

Xtr, ytr = train[FEAT_COLS].to_numpy(), train["y"].to_numpy()
Xte, yte = test_last[FEAT_COLS].to_numpy(), test_last["y_true"].to_numpy()

# COMMAND ----------
def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))

def phm_score(y_true, y_pred):
    # NASA PHM'08 asymmetric score: late predictions (pred > true => d>0) penalized more (a=10) than
    # early (a=13). Lower is better.
    d = np.asarray(y_pred) - np.asarray(y_true)
    s = np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)
    return float(np.sum(s))

# ---- Baseline: linear regression on last-cycle features ----
lin = LinearRegression().fit(Xtr, ytr)
pred_lin = np.clip(lin.predict(Xte), 0, RUL_CAP)
m_lin = {"rmse": rmse(yte, pred_lin), "phm": phm_score(yte, pred_lin)}
print("linear baseline", m_lin)
with mlflow.start_run(run_name="rul_linear_baseline") as run:
    mlflow.log_param("model", "linear_regression")
    mlflow.log_param("rul_cap", RUL_CAP)
    mlflow.log_metric("rmse", m_lin["rmse"]); mlflow.log_metric("phm", m_lin["phm"])
    mlflow.sklearn.log_model(lin, artifact_path="model",
                             signature=infer_signature(Xte[:5], pred_lin[:5]), input_example=Xte[:5])
    lin_run_id = run.info.run_id

# ---- Stronger: gradient-boosted regression ----
gbm = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05,
                                subsample=0.8, random_state=0).fit(Xtr, ytr)
pred_gbm = np.clip(gbm.predict(Xte), 0, RUL_CAP)
m_gbm = {"rmse": rmse(yte, pred_gbm), "phm": phm_score(yte, pred_gbm)}
print("gbm", m_gbm)
with mlflow.start_run(run_name="rul_gbm") as run:
    mlflow.log_param("model", "gradient_boosting")
    mlflow.log_param("n_estimators", 300); mlflow.log_param("max_depth", 3)
    mlflow.log_param("learning_rate", 0.05); mlflow.log_param("rul_cap", RUL_CAP)
    mlflow.log_metric("rmse", m_gbm["rmse"]); mlflow.log_metric("phm", m_gbm["phm"])
    mlflow.sklearn.log_model(gbm, artifact_path="model",
                             signature=infer_signature(Xte[:5], pred_gbm[:5]), input_example=Xte[:5])
    gbm_run_id = run.info.run_id

# COMMAND ----------
result = {
    "linear": {"run_id": lin_run_id, **m_lin},
    "gbm": {"run_id": gbm_run_id, **m_gbm},
    "rmse_gate": RMSE_GATE,
    "rul_cap": RUL_CAP,
    "test_units": int(len(test_last)),
    "experiment_id": EXPERIMENT_ID,
}
dbutils.notebook.exit(json.dumps(result))
