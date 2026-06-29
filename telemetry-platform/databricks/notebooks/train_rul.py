# Databricks notebook source
# MAGIC %md
# MAGIC # Telemetry — C-MAPSS FD001 Remaining Useful Life
# MAGIC Trains a RUL regressor on the Gold features for FD001 and evaluates on the held-out TEST
# MAGIC units (predict RUL at each unit's last observed cycle, compare to the official RUL truth).
# MAGIC Reports RMSE + the NASA PHM asymmetric score. No look-ahead: features are the no-look-ahead
# MAGIC rolling features built in the lakehouse; the model never sees test units during training.
# MAGIC
# MAGIC **PR-1 hardening:** logs naive baselines, late-prediction diagnostics (the dangerous mode for RUL),
# MAGIC PHM-aware metrics, and a label-shuffle leakage control — so `promote_models.py` can gate on more
# MAGIC than RMSE. A model is only called "skillful" when it beats the strongest naive baseline; a model is
# MAGIC only safe to promote when it ALSO keeps late predictions low and clears the leakage control.

# COMMAND ----------
# ===== TEACHING NOTES =====
# WHAT THIS FILE DOES: Trains models that predict RUL — Remaining Useful Life, i.e. how many cycles a
#   jet-engine unit has left before it fails — on NASA C-MAPSS turbofan data. It trains a simple model
#   (linear regression) and a stronger one (gradient boosting), then scores them honestly.
# WHERE YOU SEE THIS: the metrics here feed the frontend "RUL Calibration" page and its calibration
#   evidence (repo-b/src/components/telemetry/RulCalibration.tsx).
# INPUTS -> OUTPUT: Gold engine features (novendor_1.telemetry.gold_cmapss_features) + the official RUL
#   truth table -> two trained, scored, MLflow-logged regressors + per-model "model cards."
# HOW TO READ THE NUMBERS:
#   - RUL = cycles of safe life left before failure (higher = more life remaining).
#   - RMSE = typical prediction error in cycles (lower is better).
#   - PHM score = NASA's official asymmetric error score; LOWER is better, and it punishes "late"
#     predictions harder than "early" ones (see next point) because late is the dangerous direction.
#   - "late rate" = share of predictions that say MORE life remains than really does. That is the unsafe
#     mode (you'd run a failing engine), so we track and cap it separately from RMSE.
#   - naive baseline = a dumb constant guess; a real model must beat it or it isn't actually learning.
#   - leakage control = sanity check: shuffle the answers, retrain; if score stays good, the model was
#     cheating off leaked labels. We require it to collapse.
# ===========================
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

RMSE_GATE = 25.0          # cycles; declared before training (absolute ceiling, kept for reference)
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
# In plain terms: for each test engine, take its most recent snapshot and ask "how many cycles left?",
# then compare to NASA's published answer. This last-cycle-per-unit framing is the calibration evidence.
test_last = test.sort_values(["unit", "cycle"]).groupby("unit").tail(1).copy()
test_last = test_last.merge(rul_truth[["unit", "rul"]], on="unit", how="inner")
test_last["y_true"] = np.minimum(test_last["rul"].to_numpy(), RUL_CAP)
test_last = test_last.dropna(subset=FEAT_COLS).copy()
print("train rows", len(train), "test units evaluated", len(test_last))

Xtr, ytr = train[FEAT_COLS].to_numpy(), train["y"].to_numpy()
Xte, yte = test_last[FEAT_COLS].to_numpy(), test_last["y_true"].to_numpy()
units = test_last["unit"].to_numpy()

# COMMAND ----------
# rmse = root-mean-square error: the typical size of a miss, in cycles. -> the headline error on the
# RUL Calibration page. Lower is better.
def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a, float) - np.asarray(b, float)) ** 2)))

# mae = mean absolute error: average miss size in cycles (less sensitive to big outliers than RMSE).
def mae(a, b):
    return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))

def phm_score(y_true, y_pred):
    # NASA PHM'08 asymmetric score. LOWER IS BETTER. Late predictions (pred > true => d>0) penalized
    # more (a=10) than early (a=13), because over-stating remaining life is the dangerous direction.
    # In words: it's an exam where guessing "too much life left" loses you more points than "too little,"
    # because in the field, optimism is what gets equipment run to failure. -> this is the PHM score on
    # the RUL Calibration evidence.
    d = np.asarray(y_pred, float) - np.asarray(y_true, float)
    s = np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)
    return float(np.sum(s))

def late_diagnostics(y_true, y_pred):
    """RUL 'late' = predicted RUL HIGHER than actual (model thinks more safe life remains than truth).
    That is the dangerous failure mode. Returns a dict of late/early metrics.
    -> rul_late_prediction_rate here is the 'late rate' the promotion gate caps and the RUL Calibration
    page reports: the share of engines the model wrongly judged to have more life left than they do."""
    err = np.asarray(y_pred, float) - np.asarray(y_true, float)   # >0 late (optimistic), <0 early
    late = err > 0
    early = err < 0
    late_err = err[late]
    return {
        "rul_late_prediction_rate": float(late.mean()),
        "rul_early_prediction_rate": float(early.mean()),
        "rul_mean_late_error": float(late_err.mean()) if late_err.size else 0.0,
        "rul_p95_late_error": float(np.percentile(late_err, 95)) if late_err.size else 0.0,
        "rul_late_error_count": int(late.sum()),
    }

def regime_late_rates(y_true, y_pred):
    """Late-prediction rate sliced by RUL regime (single-regime FD001 -> slice by remaining life).
    Plain version: is the model especially unsafe on near-failure engines (low remaining life)? That's
    the slice that matters most, so we break the late rate out by how much life actually remained."""
    err = np.asarray(y_pred, float) - np.asarray(y_true, float)
    out = {}
    for name, lo, hi in [("low_RUL_<50", 0, 50), ("mid_RUL_50_100", 50, 100), ("high_RUL_>=100", 100, RUL_CAP + 1)]:
        m = (y_true >= lo) & (y_true < hi)
        out[name] = {"n": int(m.sum()), "late_rate": round(float((err[m] > 0).mean()), 3) if m.any() else None}
    return out

# COMMAND ----------
# ── Naive baselines (RUL has no last-observed-RUL at the held-out last cycle, so the meaningful naive
# ── predictors are constant remaining-life guesses). We report the MEDIAN baseline the plan requires AND
# ── the MEAN baseline, then use the STRONGEST (lowest-RMSE) naive as the bar a model must beat. A simple
# ── per-unit "linear degradation" naive is NOT well-defined here (no per-unit total-life at last cycle),
# ── so it is intentionally omitted rather than faked.
# Build the "dumb guess" bars: always predict the training mean, or the training median. A real model
# has to beat the best of these or it has learned nothing. -> shown as the baseline on RUL Calibration.
train_mean = float(ytr.mean())
train_median = float(np.median(ytr))
naive_preds = {
    "median": np.full_like(yte, train_median),
    "mean": np.full_like(yte, train_mean),
}
naive_scores = {k: {"rmse": rmse(yte, p), "mae": mae(yte, p), "phm": phm_score(yte, p)}
                for k, p in naive_preds.items()}
# Strongest naive = lowest RMSE (hardest bar). This is what the promotion gate compares against.
best_naive_key = min(naive_scores, key=lambda k: naive_scores[k]["rmse"])
naive = naive_scores[best_naive_key]
print("naive baselines", json.dumps(naive_scores), "| strongest naive:", best_naive_key)

# ── NEGATIVE CONTROL (diagnostic only; never trains/influences the champion): shuffle TRAIN labels,
# ── refit GBM. With no target leakage, performance must collapse toward naive/random.
# Leakage sanity check: scramble the answers so features no longer match their true RUL, then retrain.
# If the model still scores well, it was secretly reading the answer through the features (leakage); a
# clean setup makes the scrambled model collapse to roughly the dumb-guess level.
rng = np.random.RandomState(0)
ytr_shuf = ytr.copy(); rng.shuffle(ytr_shuf)
gbm_shuf = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05,
                                     subsample=0.8, random_state=0).fit(Xtr, ytr_shuf)
pred_shuf = np.clip(gbm_shuf.predict(Xte), 0, RUL_CAP)
shuffle_rmse = rmse(yte, pred_shuf)
shuffle_vs_naive_delta = abs(shuffle_rmse - naive["rmse"])
# Passes when shuffled-label RMSE collapses to within ~20% of the (best) naive RMSE.
leakage_control_passed = bool(shuffle_rmse >= 0.80 * naive["rmse"])
print(f"leakage control: shuffle_rmse={shuffle_rmse:.3f} naive_rmse={naive['rmse']:.3f} "
      f"delta={shuffle_vs_naive_delta:.3f} passed={leakage_control_passed}")

# ── Shared diagnostics logged on EVERY model run (so the gate can read them regardless of the winner).
SHARED = {
    "rul_naive_rmse": round(naive["rmse"], 4),
    "rul_naive_mae": round(naive["mae"], 4),
    "rul_naive_phm_score": round(naive["phm"], 4),
    "rul_naive_median_rmse": round(naive_scores["median"]["rmse"], 4),
    "rul_naive_median_phm_score": round(naive_scores["median"]["phm"], 4),
    "rul_naive_mean_rmse": round(naive_scores["mean"]["rmse"], 4),
    "rul_naive_mean_phm_score": round(naive_scores["mean"]["phm"], 4),
    "rul_label_shuffle_rmse": round(shuffle_rmse, 4),
    "rul_label_shuffle_vs_naive_delta": round(shuffle_vs_naive_delta, 4),
    "rul_leakage_control_passed": 1.0 if leakage_control_passed else 0.0,
}

UNSAFE_USE = "autonomous launch, flight-safety, or maintenance authorization"
APPROVED_USE = "telemetry demo / maintenance-risk investigation support"


def model_card(model_label, m, late, regimes):
    return {
        "model_name": "tel_rul_regressor",
        "candidate": model_label,
        "target_definition": f"Remaining Useful Life (cycles) at a unit's last observed cycle, "
                             f"capped at {RUL_CAP}; truth = official RUL_FD001.",
        "baseline_comparison": {
            "naive_strongest": best_naive_key,
            "naive_rmse": round(naive["rmse"], 3), "naive_phm": round(naive["phm"], 3),
            "model_rmse": round(m["rmse"], 3), "model_phm": round(m["phm"], 3),
            "rmse_ratio_model_over_naive": round(m["rmse"] / naive["rmse"], 3),
            "beats_naive_rmse": bool(m["rmse"] < naive["rmse"]),
        },
        "phm_score": round(m["phm"], 3),
        "phm_note": "NASA PHM'08 asymmetric score; LOWER is better; late predictions penalized harder.",
        "late_prediction_rate": round(late["rul_late_prediction_rate"], 3),
        "late_error_risk": {"mean_late_error": round(late["rul_mean_late_error"], 2),
                            "p95_late_error": round(late["rul_p95_late_error"], 2),
                            "late_count": late["rul_late_error_count"],
                            "by_regime": regimes},
        "label_shuffle_leakage_control": {"shuffle_rmse": round(shuffle_rmse, 3),
                                          "naive_rmse": round(naive["rmse"], 3),
                                          "passed": leakage_control_passed},
        "known_unsafe_failure_mode": "Over-predicting remaining life (late) on near-failure units: implies "
                                     "more safe life remains than is true. Captured by PHM + late_prediction_rate.",
        "approved_use": f"Approved use: {APPROVED_USE}.",
        "not_approved_use": f"Not approved use: {UNSAFE_USE}.",
        "calibration": "Point predictions only — NO prediction interval / coverage guarantee. Do not "
                       "present as a calibrated probability of failure.",
        "promotion_state": "model_not_promoted",  # fail-closed; promote_models.py decides against the gate
    }


# Train one model, score it on the held-out engines, compute the safety diagnostics, and log everything
# to MLflow so promote_models.py can later read the numbers and the RUL Calibration page can show them.
def fit_log(model_label, run_name, estimator):
    estimator.fit(Xtr, ytr)
    # clip predictions to the valid 0..RUL_CAP range (negative or absurdly large life is meaningless)
    pred = np.clip(estimator.predict(Xte), 0, RUL_CAP)
    m = {"rmse": rmse(yte, pred), "mae": mae(yte, pred), "phm": phm_score(yte, pred)}
    late = late_diagnostics(yte, pred)
    regimes = regime_late_rates(yte, pred)
    phm_improvement = naive["phm"] - m["phm"]                       # >0 means better than naive
    card = model_card(model_label, m, late, regimes)
    with mlflow.start_run(run_name=run_name) as run:
        mlflow.log_param("model", model_label)
        mlflow.log_param("rul_cap", RUL_CAP)
        if isinstance(estimator, GradientBoostingRegressor):
            mlflow.log_param("n_estimators", 300); mlflow.log_param("max_depth", 3)
            mlflow.log_param("learning_rate", 0.05)
        # Core
        mlflow.log_metric("rmse", m["rmse"]); mlflow.log_metric("mae", m["mae"]); mlflow.log_metric("phm", m["phm"])
        # PHM-aware
        mlflow.log_metric("rul_phm_score", m["phm"])
        mlflow.log_metric("rul_phm_improvement", phm_improvement)   # naive_phm - model_phm (>0 = better)
        # Naive comparison + shared diagnostics
        for k, v in SHARED.items():
            mlflow.log_metric(k, v)
        mlflow.log_metric("rul_model_vs_naive_rmse_ratio", m["rmse"] / naive["rmse"])
        # Late-prediction diagnostics (the dangerous mode)
        for k, v in late.items():
            mlflow.log_metric(k, v)
        # Model card artifact
        mlflow.log_dict(card, "rul_model_card.json")
        rid = run.info.run_id
    print(f"{run_name}: rmse={m['rmse']:.3f} phm={m['phm']:.1f} late_rate={late['rul_late_prediction_rate']:.3f} "
          f"vs_naive_rmse={m['rmse']/naive['rmse']:.3f}")
    return rid, m, late, card

# COMMAND ----------
# Train both candidates: the simple linear baseline and the stronger gradient-boosted model. The
# promotion gate (promote_models.py) later picks the SAFEST one that clears every threshold.
lin_run_id, m_lin, late_lin, card_lin = fit_log("linear_regression", "rul_linear_baseline", LinearRegression())
gbm_run_id, m_gbm, late_gbm, card_gbm = fit_log(
    "gradient_boosting", "rul_gbm",
    GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=0))

# COMMAND ----------
result = {
    "linear": {"run_id": lin_run_id, **m_lin, "late_prediction_rate": round(late_lin["rul_late_prediction_rate"], 3)},
    "gbm": {"run_id": gbm_run_id, **m_gbm, "late_prediction_rate": round(late_gbm["rul_late_prediction_rate"], 3)},
    "naive_baselines": naive_scores,
    "strongest_naive": best_naive_key,
    "leakage_control": {"shuffle_rmse": round(shuffle_rmse, 3), "naive_rmse": round(naive["rmse"], 3),
                        "passed": leakage_control_passed},
    "rmse_gate": RMSE_GATE,
    "rul_cap": RUL_CAP,
    "test_units": int(len(test_last)),
    "experiment_id": EXPERIMENT_ID,
    "model_cards": {"linear": card_lin, "gbm": card_gbm},
}
dbutils.notebook.exit(json.dumps(result))
