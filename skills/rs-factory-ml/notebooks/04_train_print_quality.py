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
# MAGIC
# MAGIC ## ===== TEACHING NOTES (plain language) =====
# MAGIC
# MAGIC **WHAT THIS FILE DOES (the "train" stage):** It teaches three models to
# MAGIC predict print-quality outcomes from the process features, checks how well
# MAGIC they actually do (honestly), records everything to MLflow, and figures out
# MAGIC WHICH inputs drove each prediction. This is the stage that produces the
# MAGIC numbers and bars you see on screen.
# MAGIC
# MAGIC **WHERE YOU SEE THIS (Factory ML console, repo-b/.../telemetry/factory-ml/):**
# MAGIC - **FeatureImportancePanel** — the bars are the SHAP "top drivers" computed
# MAGIC   below; the headline F1 / recall / precision / AUC come from the metrics here.
# MAGIC - **RegistryPanel** — its rows are the three models registered below
# MAGIC   (rs_print_strength, rs_print_passfail, rs_run_failure).
# MAGIC
# MAGIC **INPUTS -> OUTPUT:**
# MAGIC - in:  `gold_print_quality_train` (the feature store from notebook 03).
# MAGIC - out: 3 trained models + fold metrics logged to MLflow; a registry entry per
# MAGIC        model; `gold_feature_importance` table (top drivers); JSON artifacts
# MAGIC        top_features.json + feature_manifest.json. The export script turns these
# MAGIC        into the /labs/factory-ml/*.json receipts the console renders.
# MAGIC
# MAGIC **JARGON, one phrase each:**
# MAGIC - *XGBoost* = a strong "gradient-boosted trees" method — it stacks many small
# MAGIC   decision trees, each fixing the previous one's mistakes. Great on tabular data.
# MAGIC - *baseline* (Ridge / LogisticRegression) = a deliberately simple model run
# MAGIC   alongside XGBoost for an honesty check: if the fancy model barely beats the
# MAGIC   simple one, there isn't much real signal to find.
# MAGIC - *GroupKFold by part_id* = a cross-validation split that keeps all serials of
# MAGIC   the same physical part on ONE side of the train/test divide, so the model
# MAGIC   can't "memorize a part" and then be quizzed on it — that would be cheating.
# MAGIC - *SHAP* = a method that attributes a prediction to its inputs: how much each
# MAGIC   feature pushed the answer up or down. The averaged magnitudes ARE the bars.
# MAGIC - *AUC (ROC-AUC)* = chance a random pass is ranked above a random fail;
# MAGIC   0.5 = coin-flip, 1.0 = perfect ranking.
# MAGIC - *PR-AUC (average precision)* = same idea but focused on the rare/positive
# MAGIC   class — the honest score when failures are uncommon.
# MAGIC - *F1* = the balance of precision (of the things flagged, how many were right)
# MAGIC   and recall (of the real failures, how many we caught); one number, both concerns.
# MAGIC - *Brier* = average squared error of the predicted probabilities — lower means
# MAGIC   the confidence levels are better calibrated (a "70%" really happens ~70% of the time).
# MAGIC - *leakage* = letting a clue to the answer into the inputs; see the EXCLUDED set.
# MAGIC
# MAGIC **HOW TO READ THE RESULTS (and why "near chance" is the honest answer here):**
# MAGIC the synthetic seed builds the pass/strength outcomes from a DIFFERENT random
# MAGIC stream than the telemetry, so there's genuinely no link to learn — those two
# MAGIC models SHOULD land near chance (AUC ~0.5), and the report shows that instead
# MAGIC of faking success. The run-failure target is wired to the telemetry (limit
# MAGIC violations are seeded toward failures), so that model should actually learn.

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

# Metadata / leakage columns — the inputs the model is NOT allowed to see.
# Why each is barred: pattern + template literally encode the seeded failure mode
# (peeking at the answer); result IS the run verdict; the target columns are the
# answers themselves; ids only identify a row, they don't describe the process.
# Letting any of these in would be "leakage" — fake-good scores that collapse in
# real use. The categoricals are excluded here only because they're re-added as
# dummy columns below.
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

# Pull the feature store into pandas and keep only rows that have answers.
df = spark.table(f"{Q}.gold_print_quality_train").toPandas()
df = df.dropna(subset=["min_strength_margin", "passed"]).reset_index(drop=True)

# X = the inputs (features). Numeric columns that aren't on the leakage blocklist,
# plus the category columns turned into 0/1 "dummy" columns (one column per value)
# so a tree model can use them. This X is the same width at train and serve time.
numeric = [c for c in df.columns
           if c not in EXCLUDED and pd.api.types.is_numeric_dtype(df[c])]
X = pd.concat(
    [df[numeric].fillna(0.0), pd.get_dummies(df[CATEGORICAL], dummy_na=True)],
    axis=1,
).astype(float)
# The three targets (answers) the three models predict, one per model.
y_reg = df["min_strength_margin"].astype(float).values   # number: tolerance headroom
y_clf = df["passed"].astype(bool).astype(int).values     # yes/no: did it pass
y_run = df["run_failed"].astype(bool).astype(int).values # yes/no: did the run fail
# groups = which physical part each row belongs to; GroupKFold uses this to keep
# one part entirely on one side of every train/test split (anti-cheating).
groups = df["part_id"].values

print(f"n={len(df):,} features={X.shape[1]} pass_rate={y_clf.mean():.3f} "
      f"run_fail_rate={y_run.mean():.3f} margin: mean={y_reg.mean():.3f} min={y_reg.min():.3f}")

# 5-fold cross-validation: train on 4/5 of the data, test on the held-out 1/5,
# rotate 5 times so every row gets graded once on a model that never saw it.
# "Group" means a whole part stays together — never split across train and test.
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

    # Cross-validation loop. Each pass: `tr` = training row indices, `te` = held-out
    # test rows. We fit on tr, predict on te, and score — repeated for all 5 folds.
    fold_metrics: list[dict] = []
    last_te = None
    for fold, (tr, te) in enumerate(gkf.split(X, y_clf, groups=groups)):
        X_tr, X_te = X.iloc[tr], X.iloc[te]
        last_te = te

        # -- regression: predict the strength MARGIN (a number) --
        # Ridge = simple linear baseline (standardized inputs) for the honesty check;
        # XGBoost = the real model. If XGBoost barely beats Ridge, there's little signal.
        ridge = Ridge(alpha=1.0)
        scaler = StandardScaler().fit(X_tr)
        ridge.fit(scaler.transform(X_tr), y_reg[tr])
        p_ridge = ridge.predict(scaler.transform(X_te))

        xgb_reg = xgb.XGBRegressor(
            n_estimators=400, max_depth=5, learning_rate=0.05, tree_method="hist",
        )
        xgb_reg.fit(X_tr, y_reg[tr])
        p_reg = xgb_reg.predict(X_te)

        # -- classification: predict PASS / FAIL (yes/no) --
        # scale_pos_weight tells XGBoost the classes are imbalanced (far more of one
        # outcome than the other) so it doesn't just predict the majority every time.
        # The calibrated logistic regression is the simple baseline; "isotonic"
        # calibration makes its probabilities trustworthy (a "0.7" means ~70%).
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

        # -- classification: predict RUN FAILURE (the target with real signal) --
        # Unlike pass/fail and margin, this outcome IS linked to the telemetry in the
        # seed, so this is the model expected to actually learn something useful.
        scale_run = (len(tr) - y_run[tr].sum()) / max(y_run[tr].sum(), 1)
        xgb_run = xgb.XGBClassifier(
            n_estimators=400, max_depth=5, learning_rate=0.05,
            scale_pos_weight=scale_run, eval_metric="aucpr", tree_method="hist",
        )
        xgb_run.fit(X_tr, y_run[tr])
        p_run = xgb_run.predict_proba(X_te)[:, 1]

        # Score every model on this fold's held-out rows. Quick reader's guide:
        #   mae  = mean absolute error (avg miss, lower is better) — for the number target.
        #   r2   = fraction of variance explained (1.0 perfect, 0 no better than the mean).
        #   auc  = ranking quality, 0.5 = coin-flip, 1.0 = perfect.
        #   pr_auc = ranking quality focused on the rare class (honest when fails are rare).
        #   brier = calibration error of probabilities (lower = better-calibrated confidence).
        # These per-fold numbers, averaged below, become the FeatureImportancePanel headline.
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

    # Average each metric across the 5 folds — the cross-validated headline numbers
    # (these mean_* values are what the FeatureImportancePanel reports as F1/AUC/etc).
    agg = pd.DataFrame(fold_metrics).mean().to_dict()
    mlflow.log_metrics({
        f"mean_{k.split('_', 1)[1]}": float(v)
        for k, v in agg.items()
    })

    # Cross-validation was for HONEST scoring; now retrain each model on ALL rows so
    # the shipped/registered model uses every available example. These are the ones
    # that get saved and become the RegistryPanel rows.
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

    # Save the trained models to MLflow, then register them by name in the model
    # registry. Registration is what makes each model a row in the RegistryPanel
    # (champion/challenger tracking). Registry permissions vary by workspace, so a
    # failure here is logged as a note, not treated as fatal.
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
    # WHICH inputs drove each model? Run SHAP on a sample of rows. SHAP gives every
    # feature a signed push (up/down) per prediction; we take the AVERAGE ABSOLUTE
    # push per feature = its overall importance, and keep the top 15.
    # -> these top-15 magnitudes ARE the bars in the FeatureImportancePanel.
    # If SHAP's loader can't read the model, fall back to XGBoost's own "gain"
    # importance (how much each feature improved the trees' splits) so the panel
    # still gets ranked drivers.
    sample = X.iloc[last_te[: min(1000, len(last_te))]]
    driver_rows = []
    for label, model in (("strength", final_reg), ("passfail", final_clf),
                         ("run_failure", final_run)):
        try:
            import shap

            # TreeExplainer = fast exact SHAP for tree models like XGBoost.
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

    # The manifest is the audit record of exactly what went into training: which
    # features were used, how the split worked, which leaky columns were barred,
    # and what each target means. It makes the run reproducible and reviewable.
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
