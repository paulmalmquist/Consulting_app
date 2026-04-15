# Databricks notebook source
# MAGIC %md
# MAGIC # NCF Grant Friction — 05 Train (LR baseline + XGBoost + MLflow)
# MAGIC
# MAGIC Walk-forward TimeSeriesSplit (5 folds expanding window) on `recommended_at`.
# MAGIC Isotonic calibration on the last fold. SHAP top drivers logged as artifact.
# MAGIC Threshold chosen on the PR curve at precision >= 0.40, recall >= 0.50.
# MAGIC
# MAGIC Mirrors the pattern in `skills/historyrhymes/templates/regime_classifier.py`.

# COMMAND ----------

import json
import numpy as np
import pandas as pd
import mlflow
import mlflow.xgboost
import mlflow.sklearn
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import (
    roc_auc_score,
    brier_score_loss,
    precision_recall_curve,
    average_precision_score,
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import StandardScaler

mlflow.set_experiment("/Users/paulmalmquist@gmail.com/NCFGrantFriction")

CATALOG = "novendor_1"
SCHEMA = "ncf_ml"
GOLD_TRAIN = f"{CATALOG}.{SCHEMA}.gold_grant_friction_train"

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
TARGET = "had_friction"
DATE_COL = "recommended_at"

# COMMAND ----------

df = spark.table(GOLD_TRAIN).toPandas()
df = df.dropna(subset=[DATE_COL, TARGET]).sort_values(DATE_COL).reset_index(drop=True)
df["days_since_prior_grant"] = df["days_since_prior_grant"].fillna(9999)  # "never" sentinel

X = pd.get_dummies(df[CATEGORICAL + NUMERIC], columns=CATEGORICAL, dummy_na=True)
y = df[TARGET].astype(int).values

print(f"n={len(df):,} features={X.shape[1]} positive_rate={y.mean():.4f}")

tscv = TimeSeriesSplit(n_splits=5)

# COMMAND ----------

with mlflow.start_run(run_name="grant_friction_v1") as run:
    mlflow.log_params({
        "model_family": "xgboost+lr_baseline",
        "n_splits": 5,
        "feature_count": X.shape[1],
        "train_rows": len(df),
        "positive_rate": float(y.mean()),
        "training_window_start": str(df[DATE_COL].min()),
        "training_window_end": str(df[DATE_COL].max()),
    })
    mlflow.set_tags({
        "model_name": "ncf_grant_friction",
        "env": "ncf",
        "stage": "v1",
    })

    fold_metrics: list[dict] = []
    last_te_idx = None
    for fold, (tr, te) in enumerate(tscv.split(X)):
        X_tr, X_te = X.iloc[tr], X.iloc[te]
        y_tr, y_te = y[tr], y[te]
        last_te_idx = te
        scale = (len(y_tr) - y_tr.sum()) / max(y_tr.sum(), 1)

        # LR baseline with isotonic calibration.
        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_tr)
        X_te_s = scaler.transform(X_te)
        lr = CalibratedClassifierCV(
            LogisticRegression(max_iter=1000, class_weight="balanced"),
            method="isotonic",
            cv=3,
        )
        lr.fit(X_tr_s, y_tr)
        p_lr = lr.predict_proba(X_te_s)[:, 1]

        # XGBoost.
        xgb_clf = xgb.XGBClassifier(
            n_estimators=500,
            max_depth=5,
            learning_rate=0.05,
            scale_pos_weight=scale,
            eval_metric="aucpr",
            early_stopping_rounds=30,
            tree_method="hist",
        )
        xgb_clf.fit(X_tr, y_tr, eval_set=[(X_te, y_te)], verbose=False)
        p_xgb = xgb_clf.predict_proba(X_te)[:, 1]

        m = {
            f"fold{fold}_lr_auc": roc_auc_score(y_te, p_lr),
            f"fold{fold}_lr_pr_auc": average_precision_score(y_te, p_lr),
            f"fold{fold}_lr_brier": brier_score_loss(y_te, p_lr),
            f"fold{fold}_xgb_auc": roc_auc_score(y_te, p_xgb),
            f"fold{fold}_xgb_pr_auc": average_precision_score(y_te, p_xgb),
            f"fold{fold}_xgb_brier": brier_score_loss(y_te, p_xgb),
        }
        mlflow.log_metrics(m)
        fold_metrics.append(m)

    # Aggregate means — the headline numbers.
    agg = pd.DataFrame(fold_metrics).mean().to_dict()
    mlflow.log_metrics({f"mean_{k}": float(v) for k, v in agg.items()})

    # Final fit on all data; calibrate on last fold as prefit.
    scale_final = (len(y) - y.sum()) / max(y.sum(), 1)
    final = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.05,
        scale_pos_weight=scale_final,
        tree_method="hist",
    )
    final.fit(X, y)
    calibrated = CalibratedClassifierCV(final, method="isotonic", cv="prefit")
    calibrated.fit(X.iloc[last_te_idx], y[last_te_idx])

    mlflow.xgboost.log_model(final, "model_uncalibrated")
    mlflow.sklearn.log_model(calibrated, "model_calibrated")

    # SHAP top drivers (sampled for speed).
    try:
        import shap
        explainer = shap.TreeExplainer(final)
        sample_idx = last_te_idx[: min(1000, len(last_te_idx))]
        shap_vals = explainer.shap_values(X.iloc[sample_idx])
        top = (
            pd.DataFrame(np.abs(shap_vals), columns=X.columns)
            .mean()
            .sort_values(ascending=False)
            .head(15)
        )
        top.to_json("/tmp/top_features.json")
        mlflow.log_artifact("/tmp/top_features.json")
    except ImportError:
        print("shap not installed; skipping driver logging")

    # Threshold selection on PR curve.
    p_final = calibrated.predict_proba(X.iloc[last_te_idx])[:, 1]
    prec, rec, thr = precision_recall_curve(y[last_te_idx], p_final)
    viable = (prec[:-1] >= 0.40) & (rec[:-1] >= 0.50)
    if viable.any():
        chosen = int(np.argmax(viable))
        mlflow.log_metrics({
            "chosen_threshold": float(thr[chosen]),
            "chosen_precision": float(prec[chosen]),
            "chosen_recall": float(rec[chosen]),
        })
    else:
        # No point hits the floor — fall back to F1-optimal and log a note.
        f1 = (2 * prec[:-1] * rec[:-1]) / np.maximum(prec[:-1] + rec[:-1], 1e-9)
        chosen = int(np.argmax(f1))
        mlflow.log_metrics({
            "chosen_threshold": float(thr[chosen]),
            "chosen_precision": float(prec[chosen]),
            "chosen_recall": float(rec[chosen]),
            "chosen_fallback_f1_mode": 1.0,
        })

    # Feature list with as_of semantics — governance artifact.
    feature_manifest = {
        "features": list(X.columns),
        "as_of_rule": "all rolling aggregates use window.end < recommended_at",
        "excluded_leakage_cols": ["approved_at", "paid_at", "stage"],
    }
    with open("/tmp/feature_manifest.json", "w") as f:
        json.dump(feature_manifest, f, indent=2)
    mlflow.log_artifact("/tmp/feature_manifest.json")

    print(f"run_id={run.info.run_id}")

# COMMAND ----------

# MAGIC %md
# MAGIC Next: register the calibrated model to `ncf_grant_friction` in the Model Registry,
# MAGIC then run `06_batch_score.py` to score open grants and `07_sync_to_postgres.py`.
