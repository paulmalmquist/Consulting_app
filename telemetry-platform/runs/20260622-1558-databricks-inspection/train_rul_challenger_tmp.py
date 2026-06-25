# Databricks notebook source
# MAGIC %md
# MAGIC # RUL challenger DIAGNOSTIC (temporary, non-promoting)
# MAGIC Same FD001 protocol as train_rul (capped 125, last cycle per unit, clip [0,125], asymmetric PHM).
# MAGIC Adds what the production notebook lacks: naive baselines, a label-shuffle NEGATIVE CONTROL
# MAGIC (leakage test), per-unit failure cases, and error-by-RUL-regime. Logs ONE challenger MLflow run.
# MAGIC Does NOT register a model, set any alias, or write any table. Safe to run/delete.

# COMMAND ----------
import json
import numpy as np
import mlflow
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LinearRegression

EXPERIMENT_ID = "3740651530987773"
TEL = "novendor_1.telemetry"
RUL_CAP = 125
mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

feat = spark.table(f"{TEL}.gold_cmapss_features").toPandas()
rul_truth = spark.table(f"{TEL}.silver_cmapss_rul").toPandas()
feat = feat[feat.subset == "FD001"].copy()
rul_truth = rul_truth[rul_truth.subset == "FD001"].copy()
FEAT_COLS = [c for c in feat.columns if c.startswith("sensor_")]

train = feat[feat.split == "train"].dropna(subset=FEAT_COLS).copy()
train["y"] = np.minimum(train["rul_target"].to_numpy(), RUL_CAP)
test = feat[feat.split == "test"].copy()
test_last = test.sort_values(["unit", "cycle"]).groupby("unit").tail(1).copy()
test_last = test_last.merge(rul_truth[["unit", "rul"]], on="unit", how="inner")
test_last["y_true"] = np.minimum(test_last["rul"].to_numpy(), RUL_CAP)
test_last = test_last.dropna(subset=FEAT_COLS).copy()

Xtr, ytr = train[FEAT_COLS].to_numpy(), train["y"].to_numpy()
Xte, yte = test_last[FEAT_COLS].to_numpy(), test_last["y_true"].to_numpy()
units = test_last["unit"].to_numpy()


def rmse(a, b): return float(np.sqrt(np.mean((np.asarray(a, float) - np.asarray(b, float)) ** 2)))
def mae(a, b): return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))
def phm(yt, yp):
    d = np.asarray(yp, float) - np.asarray(yt, float)
    return float(np.sum(np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)))

# ── trained models (re-fit, identical config) ──────────────────────────────
lin = LinearRegression().fit(Xtr, ytr)
pred_lin = np.clip(lin.predict(Xte), 0, RUL_CAP)
gbm = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05,
                                subsample=0.8, random_state=0).fit(Xtr, ytr)
pred_gbm = np.clip(gbm.predict(Xte), 0, RUL_CAP)

# ── naive baselines ────────────────────────────────────────────────────────
naive = {
    "predict_train_mean": np.full_like(yte, float(ytr.mean())),
    "predict_train_median": np.full_like(yte, float(np.median(ytr))),
}

# ── NEGATIVE CONTROL: shuffle training labels, refit GBM. No leakage => RMSE collapses to ~naive ──
rng = np.random.RandomState(0)
ytr_shuf = ytr.copy(); rng.shuffle(ytr_shuf)
gbm_shuf = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05,
                                     subsample=0.8, random_state=0).fit(Xtr, ytr_shuf)
pred_shuf = np.clip(gbm_shuf.predict(Xte), 0, RUL_CAP)

models = {
    "linear": pred_lin, "gbm": pred_gbm,
    "predict_train_mean": naive["predict_train_mean"],
    "predict_train_median": naive["predict_train_median"],
    "gbm_SHUFFLED_LABELS_negctrl": pred_shuf,
}
scores = {k: {"rmse": round(rmse(yte, p), 3), "mae": round(mae(yte, p), 3), "phm": round(phm(yte, p), 1)}
          for k, p in models.items()}

# ── failure cases (GBM) + error by RUL regime ──────────────────────────────
err = pred_gbm - yte  # signed: >0 = late (dangerous), <0 = early
order = np.argsort(-np.abs(err))[:10]
worst = [{"unit": int(units[i]), "y_true": float(yte[i]), "pred_gbm": round(float(pred_gbm[i]), 1),
          "signed_err": round(float(err[i]), 1), "late" if err[i] > 0 else "early": True} for i in order]
late_frac = float((err > 0).mean())  # fraction of test units predicted LATE (optimistic / risky)

def regime_rmse(lo, hi):
    m = (yte >= lo) & (yte < hi)
    return {"n": int(m.sum()), "rmse_gbm": round(rmse(yte[m], pred_gbm[m]), 2) if m.any() else None,
            "rmse_linear": round(rmse(yte[m], pred_lin[m]), 2) if m.any() else None}
regimes = {"low_RUL_<50_near_failure": regime_rmse(0, 50),
           "mid_RUL_50_100": regime_rmse(50, 100),
           "high_RUL_>=100_capped": regime_rmse(100, RUL_CAP + 1)}

leakage_ok = scores["gbm_SHUFFLED_LABELS_negctrl"]["rmse"] > 0.8 * scores["predict_train_mean"]["rmse"]

with mlflow.start_run(run_name="rul_challenger_diagnostic") as run:
    mlflow.set_tag("kind", "challenger_diagnostic_non_promoting")
    for k, s in scores.items():
        mlflow.log_metric(f"rmse__{k}", s["rmse"]); mlflow.log_metric(f"phm__{k}", s["phm"])
    mlflow.log_metric("gbm_late_fraction", late_frac)
    mlflow.log_metric("negctrl_leakage_ok", 1.0 if leakage_ok else 0.0)
    rid = run.info.run_id

out = {
    "challenger_run_id": rid, "n_test_units": int(len(yte)),
    "scores": scores,
    "negative_control": {
        "gbm_shuffled_labels_rmse": scores["gbm_SHUFFLED_LABELS_negctrl"]["rmse"],
        "naive_mean_rmse": scores["predict_train_mean"]["rmse"],
        "gbm_real_rmse": scores["gbm"]["rmse"],
        "leakage_ok": leakage_ok,
        "interpretation": "PASS (no target leakage): shuffled-label RMSE collapses toward naive" if leakage_ok else "FAIL: shuffled-label RMSE stayed low -> features may leak target",
    },
    "gbm_late_fraction": round(late_frac, 3),
    "worst_10_units_gbm": worst,
    "error_by_regime": regimes,
    "note": "Diagnostic only. No model registered, no alias moved, no table written.",
}
print(json.dumps(out, indent=2))
dbutils.notebook.exit(json.dumps(out))
