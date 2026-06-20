# Databricks notebook source
# MAGIC %md
# MAGIC # RS Factory ML — 04 Train print-quality models
# MAGIC
# MAGIC Two models from `gold_print_quality_train`, following the proven
# MAGIC ncf-grant-friction pattern (XGBoost + calibrated baseline + MLflow + SHAP):
# MAGIC
# MAGIC - **rs_print_strength** — XGBoost regressor predicting
# MAGIC   `min_strength_margin` (tolerance-margin stand-in for tensile strength),
# MAGIC   Ridge baseline.
# MAGIC - **rs_print_passfail** — XGBoost classifier predicting `passed`,
# MAGIC   isotonic-calibrated logistic-regression baseline.
# MAGIC - **rs_run_failure** — XGBoost classifier predicting `run_failed` (the
# MAGIC   test run's own verdict).
# MAGIC
# MAGIC Expected outcome, stated up front: the seed constructs QMS outcomes
# MAGIC independently of telemetry (different generator streams), so the first
# MAGIC two targets should score near chance — and the honest evaluation shows
# MAGIC exactly that instead of laundering it. The run-failure target is where
# MAGIC the digital thread genuinely carries signal (limit violations are seeded
# MAGIC 6x/3x toward pre-failure and failed runs), so it should learn.
# MAGIC
# MAGIC Split: **GroupKFold by part_id** — the seed has no usable event-time for a
# MAGIC walk-forward split, and serials of one part must never straddle folds
# MAGIC (that would leak part-family quality straight into validation).

# COMMAND ----------

# MAGIC %pip install --quiet --upgrade typing_extensions mlflow shap "xgboost==2.0.3"
# (xgboost pinned <2.1: newer versions serialize base_score as a bracketed
#  string that shap's TreeExplainer loader cannot parse)

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

import json

import mlflow
import mlflow.sklearn
import mlflow.xgboost
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    mean_absolute_error,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

CATALOG = "novendor_1"
SCHEMA = "rs_factory"
Q = f"{CATALOG}.{SCHEMA}"
EXPERIMENT = "/Users/paulmalmquist@gmail.com/RSFactoryML"

# Metadata / leakage columns. pattern + template literally encode the seeded
# failure mode; result IS the run verdict; ids identify rather than describe.
EXCLUDED = {
    "run_id", "serial_id", "part_id", "vehicle_id", "scenario_id",
    "pattern", "template", "result", "run_failed",
    "min_strength_margin", "passed", "inspection_count",
    "test_type", "part_family", "criticality",  # categorical, dummied below
    "_loaded_at", "_build_sha",
}
CATEGORICAL = ["test_type", "part_family", "criticality"]

mlflow.set_experiment(EXPERIMENT)

# COMMAND ----------

df = spark.table(f"{Q}.gold_print_quality_train").toPandas()
df = df.dropna(subset=["min_strength_margin", "passed"]).reset_index(drop=True)

numeric = [c for c in df.columns
           if c not in EXCLUDED and pd.api.types.is_numeric_dtype(df[c])]
X = pd.concat(
    [df[numeric].fillna(0.0), pd.get_dummies(df[CATEGORICAL], dummy_na=True)],
    axis=1,
).astype(float)
y_reg = df["min_strength_margin"].astype(float).values
y_clf = df["passed"].astype(bool).astype(int).values
y_run = df["run_failed"].astype(bool).astype(int).values
groups = df["part_id"].values

print(f"n={len(df):,} features={X.shape[1]} pass_rate={y_clf.mean():.3f} "
      f"run_fail_rate={y_run.mean():.3f} margin: mean={y_reg.mean():.3f} min={y_reg.min():.3f}")

gkf = GroupKFold(n_splits=5)

# COMMAND ----------

with mlflow.start_run(run_name="rs_print_quality_v1") as run:
    mlflow.log_params({
        "model_family": "xgboost + ridge/lr baselines",
        "split": "GroupKFold(part_id, 5)",
        "feature_count": X.shape[1],
        "train_rows": len(df),
        "pass_rate": float(y_clf.mean()),
        "target_note": "min_strength_margin is a tolerance-margin stand-in (no MPa in seed)",
    })
    mlflow.set_tags({"model_name": "rs_print_quality", "env": "rs_factory", "stage": "v1"})

    fold_metrics: list[dict] = []
    last_te = None
    for fold, (tr, te) in enumerate(gkf.split(X, y_clf, groups=groups)):
        X_tr, X_te = X.iloc[tr], X.iloc[te]
        last_te = te

        # -- regression: margin --
        ridge = Ridge(alpha=1.0)
        scaler = StandardScaler().fit(X_tr)
        ridge.fit(scaler.transform(X_tr), y_reg[tr])
        p_ridge = ridge.predict(scaler.transform(X_te))

        xgb_reg = xgb.XGBRegressor(
            n_estimators=400, max_depth=5, learning_rate=0.05, tree_method="hist",
        )
        xgb_reg.fit(X_tr, y_reg[tr])
        p_reg = xgb_reg.predict(X_te)

        # -- classification: pass/fail --
        scale = (len(tr) - y_clf[tr].sum()) / max(y_clf[tr].sum(), 1)
        lr = CalibratedClassifierCV(
            LogisticRegression(max_iter=1000, class_weight="balanced"),
            method="isotonic", cv=3,
        )
        lr.fit(scaler.transform(X_tr), y_clf[tr])
        p_lr = lr.predict_proba(scaler.transform(X_te))[:, 1]

        xgb_clf = xgb.XGBClassifier(
            n_estimators=400, max_depth=5, learning_rate=0.05,
            scale_pos_weight=scale, eval_metric="aucpr", tree_method="hist",
        )
        xgb_clf.fit(X_tr, y_clf[tr])
        p_clf = xgb_clf.predict_proba(X_te)[:, 1]

        # -- classification: run failure (the target with real signal) --
        scale_run = (len(tr) - y_run[tr].sum()) / max(y_run[tr].sum(), 1)
        xgb_run = xgb.XGBClassifier(
            n_estimators=400, max_depth=5, learning_rate=0.05,
            scale_pos_weight=scale_run, eval_metric="aucpr", tree_method="hist",
        )
        xgb_run.fit(X_tr, y_run[tr])
        p_run = xgb_run.predict_proba(X_te)[:, 1]

        m = {
            f"fold{fold}_ridge_mae": mean_absolute_error(y_reg[te], p_ridge),
            f"fold{fold}_xgbreg_mae": mean_absolute_error(y_reg[te], p_reg),
            f"fold{fold}_xgbreg_r2": r2_score(y_reg[te], p_reg),
            f"fold{fold}_lr_auc": roc_auc_score(y_clf[te], p_lr),
            f"fold{fold}_xgbclf_auc": roc_auc_score(y_clf[te], p_clf),
            f"fold{fold}_xgbclf_pr_auc": average_precision_score(y_clf[te], p_clf),
            f"fold{fold}_xgbclf_brier": brier_score_loss(y_clf[te], p_clf),
            f"fold{fold}_xgbrun_auc": roc_auc_score(y_run[te], p_run),
            f"fold{fold}_xgbrun_pr_auc": average_precision_score(y_run[te], p_run),
        }
        mlflow.log_metrics(m)
        fold_metrics.append(m)

    agg = pd.DataFrame(fold_metrics).mean().to_dict()
    mlflow.log_metrics({
        f"mean_{k.split('_', 1)[1]}": float(v)
        for k, v in agg.items()
    })

    # Final fits on all rows.
    final_reg = xgb.XGBRegressor(n_estimators=400, max_depth=5, learning_rate=0.05, tree_method="hist")
    final_reg.fit(X, y_reg)
    scale_all = (len(y_clf) - y_clf.sum()) / max(y_clf.sum(), 1)
    final_clf = xgb.XGBClassifier(n_estimators=400, max_depth=5, learning_rate=0.05,
                                  scale_pos_weight=scale_all, tree_method="hist")
    final_clf.fit(X, y_clf)
    scale_run_all = (len(y_run) - y_run.sum()) / max(y_run.sum(), 1)
    final_run = xgb.XGBClassifier(n_estimators=400, max_depth=5, learning_rate=0.05,
                                  scale_pos_weight=scale_run_all, tree_method="hist")
    final_run.fit(X, y_run)

    mlflow.xgboost.log_model(final_reg, "model_strength")
    mlflow.xgboost.log_model(final_clf, "model_passfail")
    mlflow.xgboost.log_model(final_run, "model_run_failure")
    try:
        mlflow.register_model(f"runs:/{run.info.run_id}/model_strength", f"{Q}.rs_print_strength")
        mlflow.register_model(f"runs:/{run.info.run_id}/model_passfail", f"{Q}.rs_print_passfail")
        mlflow.register_model(f"runs:/{run.info.run_id}/model_run_failure", f"{Q}.rs_run_failure")
    except Exception as exc:  # registry permissions are environmental, not fatal
        mlflow.set_tag("registry_note", f"registration skipped: {exc}")

    # Top drivers per model: SHAP when the loader cooperates, native gain
    # importances otherwise. Written to a gold table (not only an MLflow
    # artifact) because this workspace blocks DBFS artifact download — the
    # export script reads tables, the one serving path everything else uses.
    sample = X.iloc[last_te[: min(1000, len(last_te))]]
    driver_rows = []
    for label, model in (("strength", final_reg), ("passfail", final_clf),
                         ("run_failure", final_run)):
        try:
            import shap

            vals = shap.TreeExplainer(model).shap_values(sample)
            top = (pd.DataFrame(np.abs(vals), columns=X.columns).mean()
                   .sort_values(ascending=False).head(15))
            method = "shap_tree_explainer"
        except Exception as exc:
            top = (pd.Series(model.feature_importances_, index=X.columns)
                   .sort_values(ascending=False).head(15))
            method = f"xgboost_gain_importance (shap failed: {type(exc).__name__})"
        for rank, (feature, impact) in enumerate(top.items(), start=1):
            driver_rows.append((run.info.run_id, label, method, rank, feature, float(impact)))
    spark.createDataFrame(
        driver_rows,
        "run_id string, model string, method string, rank int, feature string, impact double",
    ).write.mode("overwrite").saveAsTable(f"{Q}.gold_feature_importance")
    with open("/tmp/top_features.json", "w") as f:
        json.dump([{"model": r[1], "feature": r[4], "impact": r[5]} for r in driver_rows], f, indent=2)
    mlflow.log_artifact("/tmp/top_features.json")

    feature_manifest = {
        "features": list(X.columns),
        "split": "GroupKFold by part_id - serials of one part never straddle folds",
        "excluded_leakage_cols": sorted(EXCLUDED),
        "target_regression": "min_strength_margin (tolerance margin; MPa stand-in, stated)",
        "target_classification": "passed = BOOL_AND(first_pass) per serial",
    }
    with open("/tmp/feature_manifest.json", "w") as f:
        json.dump(feature_manifest, f, indent=2)
    mlflow.log_artifact("/tmp/feature_manifest.json")

    print(f"run_id={run.info.run_id}")
