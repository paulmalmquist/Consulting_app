# Template: historyrhymes_regime_classifier
# Databricks notebook source
# =============================================================================
# Regime Classifier — Foundation Model
# Classifies current market regime from multi-signal input
# Priority 1 model — feeds all other models
# =============================================================================

import mlflow
import mlflow.xgboost
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

# --- Config ---
EXPERIMENT_ID = "3740651530987773"
CATALOG = "novendor_1"
SCHEMA = "historyrhymes"

mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

# --- Regime Labels ---
REGIME_LABELS = [
    "RISK_ON_MOMENTUM",     # Strong trend, lean into momentum
    "RISK_ON_BROADENING",   # Rotation favors quality and breadth
    "RISK_OFF_DEFENSIVE",   # Prioritize risk management
    "RISK_OFF_PANIC",       # Correlations → 1, focus on liquidity/hedging
    "TRANSITION_UP",        # Early recovery, look for leaders
    "TRANSITION_DOWN",      # Late cycle, tighten risk
    "RANGE_BOUND",          # Mean reversion, premium selling
]

# --- Feature Selection ---
# Based on Two Sigma's 17-factor GMM approach + research enhancements
REGIME_FEATURES = [
    # Equity signals
    "sp500_return_1m", "sp500_return_3m", "sp500_vol_20d",
    "equity_breadth", "sp500_momentum_score",

    # Rates & Credit
    "yield_curve_10y2y", "yield_curve_slope", "credit_spread_hy",
    "real_rate_10y",

    # Macro
    "pmi_manufacturing", "cpi_yoy", "m2_growth_yoy",

    # Volatility
    "vix_level", "vix_percentile",

    # Cross-asset
    "btc_spx_correlation", "stock_bond_correlation", "dxy_level",

    # Crypto (6th pillar addition)
    "btc_mvrv_zscore", "crypto_fear_greed",

    # History Rhymes (6th pillar)
    "top_rhyme_score", "trap_probability", "crowding_score",
]


def prepare_training_data(features_df: pd.DataFrame) -> tuple:
    """
    Prepare regime classification training data.

    CRITICAL: Walk-forward only. Never use future regime labels.
    """
    # Sort by date
    features_df = features_df.sort_values("snapshot_date")

    # Drop rows with missing regime labels
    labeled = features_df.dropna(subset=["regime_label"])

    X = labeled[REGIME_FEATURES].fillna(0)
    y = labeled["regime_label"]

    return X, y


def train_regime_classifier(X: pd.DataFrame, y: pd.Series, run_name: str = None):
    """
    Train XGBoost regime classifier with walk-forward validation.

    Uses TimeSeriesSplit to prevent look-ahead bias.
    Evaluates per-regime accuracy (model may work in RISK_ON but fail in RISK_OFF).
    """
    import xgboost as xgb
    from sklearn.preprocessing import LabelEncoder

    le = LabelEncoder()
    y_encoded = le.fit_transform(y)

    # Walk-forward cross-validation
    tscv = TimeSeriesSplit(n_splits=5)

    all_preds = []
    all_actuals = []
    fold_metrics = []

    run_name = run_name or f"regime_classifier_{datetime.now().strftime('%Y-%m-%d')}"

    with mlflow.start_run(run_name=run_name):
        # Log parameters
        params = {
            "model_type": "xgboost",
            "n_features": len(REGIME_FEATURES),
            "n_regimes": len(REGIME_LABELS),
            "cv_splits": 5,
            "cv_method": "TimeSeriesSplit",
            "max_depth": 6,
            "n_estimators": 200,
            "learning_rate": 0.1,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
        }
        mlflow.log_params(params)

        for fold_idx, (train_idx, test_idx) in enumerate(tscv.split(X)):
            X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
            y_train, y_test = y_encoded[train_idx], y_encoded[test_idx]

            model = xgb.XGBClassifier(
                max_depth=6,
                n_estimators=200,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                objective="multi:softprob",
                num_class=len(REGIME_LABELS),
                eval_metric="mlogloss",
                use_label_encoder=False,
                random_state=42,
            )

            model.fit(
                X_train, y_train,
                eval_set=[(X_test, y_test)],
                verbose=False,
            )

            preds = model.predict(X_test)
            acc = accuracy_score(y_test, preds)

            fold_metrics.append(acc)
            all_preds.extend(preds)
            all_actuals.extend(y_test)

            mlflow.log_metric(f"fold_{fold_idx}_accuracy", acc, step=fold_idx)

        # Overall metrics
        overall_acc = accuracy_score(all_actuals, all_preds)
        mlflow.log_metric("overall_accuracy", overall_acc)
        mlflow.log_metric("mean_cv_accuracy", np.mean(fold_metrics))
        mlflow.log_metric("std_cv_accuracy", np.std(fold_metrics))

        # Per-regime accuracy
        report = classification_report(
            all_actuals, all_preds,
            target_names=le.classes_,
            output_dict=True
        )
        for regime, metrics in report.items():
            if isinstance(metrics, dict):
                for metric_name, value in metrics.items():
                    mlflow.log_metric(
                        f"regime_{regime}_{metric_name}".replace(" ", "_"),
                        value
                    )

        # Train final model on all data
        final_model = xgb.XGBClassifier(
            max_depth=6,
            n_estimators=200,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            objective="multi:softprob",
            num_class=len(REGIME_LABELS),
            use_label_encoder=False,
            random_state=42,
        )
        final_model.fit(X, y_encoded)

        # Log model
        mlflow.xgboost.log_model(final_model, "regime_classifier")

        # Feature importance
        importance = dict(zip(REGIME_FEATURES, final_model.feature_importances_))
        mlflow.log_dict(importance, "feature_importance.json")

        # Log label encoder classes
        mlflow.log_dict(
            {"classes": le.classes_.tolist()},
            "label_encoder.json"
        )

        return final_model, le, overall_acc


# --- Main ---
# Uncomment when running in Databricks:

# # Load features
# features_df = spark.read.table(f"{CATALOG}.{SCHEMA}.feature_snapshots").toPandas()
#
# # Prepare data
# X, y = prepare_training_data(features_df)
#
# # Train
# model, label_encoder, accuracy = train_regime_classifier(X, y)
#
# # Record in model_performance
# performance_record = {
#     "model_name": "regime_classifier",
#     "model_version": 1,
#     "evaluation_date": datetime.now().strftime("%Y-%m-%d"),
#     "metric_name": "walk_forward_accuracy",
#     "metric_value": accuracy,
#     "dataset_split": "walk_forward_5fold",
#     "regime_label": "all",
#     "notes": f"Trained on {len(X)} samples, {len(REGIME_FEATURES)} features"
# }
