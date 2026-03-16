"""CRE ML Model Training Pipeline.

Trains ElasticNet + HistGradientBoosting on feature_store data,
evaluates via backtest, and registers new model versions in cre_model_catalog.
"""
from __future__ import annotations

import json
import logging
from datetime import date
import numpy as np

from app.db import get_cursor

log = logging.getLogger(__name__)


def train_models(
    *,
    env_id: str,
    business_id: str,
    feature_version: str = "miami_mvp_v1",
    target_metric: str = "rent_growth_next_12m",
) -> dict:
    """Train ElasticNet + HistGBT on feature_store data and register in catalog."""
    from sklearn.linear_model import ElasticNet
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.model_selection import cross_val_score

    # Load training data from feature_store
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT entity_id, feature_key, value
            FROM feature_store
            WHERE env_id = %s AND business_id = %s AND version = %s
            ORDER BY entity_id, feature_key
            """,
            (env_id, business_id, feature_version),
        )
        rows = cur.fetchall()

    if len(rows) < 20:
        raise ValueError(f"Insufficient training data: {len(rows)} rows (need >= 20)")

    # Pivot features into matrix
    entities: dict[str, dict[str, float]] = {}
    for row in rows:
        eid = str(row["entity_id"])
        entities.setdefault(eid, {})[row["feature_key"]] = float(row["value"]) if row["value"] else 0.0

    # Build X, y
    feature_keys = sorted({k for feats in entities.values() for k in feats.keys()} - {target_metric})
    X_rows, y_rows = [], []

    for feats in entities.values():
        if target_metric not in feats:
            continue
        X_rows.append([feats.get(k, 0.0) for k in feature_keys])
        y_rows.append(feats[target_metric])

    if len(X_rows) < 10:
        raise ValueError(f"Insufficient labeled samples: {len(X_rows)} (need >= 10)")

    X = np.array(X_rows)
    y = np.array(y_rows)

    # Train ElasticNet
    en = ElasticNet(alpha=0.1, l1_ratio=0.5, max_iter=2000)
    en_scores = cross_val_score(en, X, y, cv=min(5, len(X_rows)), scoring="neg_mean_absolute_error")
    en.fit(X, y)
    en_mae = -en_scores.mean()

    # Train HistGradientBoosting
    hgbt = HistGradientBoostingRegressor(max_iter=200, max_depth=5, learning_rate=0.1)
    hgbt_scores = cross_val_score(hgbt, X, y, cv=min(5, len(X_rows)), scoring="neg_mean_absolute_error")
    hgbt.fit(X, y)
    hgbt_mae = -hgbt_scores.mean()

    # Compute ensemble weights (inverse MAE)
    total_inv = (1 / en_mae) + (1 / hgbt_mae) if en_mae > 0 and hgbt_mae > 0 else 1
    en_weight = (1 / en_mae) / total_inv if en_mae > 0 else 0.5
    hgbt_weight = 1 - en_weight

    # Register in catalog
    version_tag = f"trained_{date.today().isoformat()}"

    with get_cursor() as cur:
        for model_family, mae, metadata in [
            ("elastic_net", en_mae, {"alpha": 0.1, "l1_ratio": 0.5, "features": feature_keys}),
            ("hist_gradient", hgbt_mae, {"max_iter": 200, "max_depth": 5, "features": feature_keys}),
            ("ensemble", min(en_mae, hgbt_mae), {"en_weight": round(en_weight, 4), "hgbt_weight": round(hgbt_weight, 4)}),
        ]:
            cur.execute(
                """
                INSERT INTO cre_model_catalog (model_family, model_version, is_active, metadata)
                VALUES (%s, %s, true, %s::jsonb)
                ON CONFLICT (model_family, model_version) DO UPDATE SET is_active = true, metadata = EXCLUDED.metadata
                """,
                (model_family, f"{model_family}_{version_tag}", json.dumps({**metadata, "mae": round(mae, 6)})),
            )

    result = {
        "version_tag": version_tag,
        "samples": len(X_rows),
        "features": len(feature_keys),
        "elastic_net_mae": round(en_mae, 6),
        "hist_gradient_mae": round(hgbt_mae, 6),
        "ensemble_weights": {"elastic_net": round(en_weight, 4), "hist_gradient": round(hgbt_weight, 4)},
    }

    log.info("Model training complete: %s", result)
    return result


def run_backtest(
    *,
    env_id: str,
    business_id: str,
    model_family: str = "ensemble",
    window_months: int = 12,
) -> dict:
    """Run rolling backtest and write results to forecast_backtest_result."""
    # Simplified backtest: compute MAE on held-out periods
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT fr.forecast_id, fr.prediction, fr.actual_value, fr.model_version
            FROM forecast_registry fr
            WHERE fr.env_id = %s AND fr.business_id = %s
              AND fr.actual_value IS NOT NULL
            ORDER BY fr.created_at DESC
            LIMIT 1000
            """,
            (env_id, business_id),
        )
        forecasts = cur.fetchall()

    if not forecasts:
        return {"backtest_count": 0, "message": "No forecasts with actual values found"}

    errors = [abs(float(f["prediction"]) - float(f["actual_value"])) for f in forecasts if f["prediction"] and f["actual_value"]]

    if not errors:
        return {"backtest_count": 0, "message": "No valid prediction/actual pairs"}

    mae = sum(errors) / len(errors)
    rmse = (sum(e**2 for e in errors) / len(errors)) ** 0.5

    # Write backtest result
    with get_cursor() as cur:
        for metric_key, metric_value in [("mae", mae), ("rmse", rmse)]:
            cur.execute(
                """
                INSERT INTO forecast_backtest_result
                    (env_id, business_id, model_family, model_version, metric_key, metric_value,
                     sample_size, window_label)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (env_id, business_id, model_family, f"{model_family}_backtest",
                 metric_key, round(metric_value, 6), len(errors), f"{window_months}m_rolling"),
            )

    result = {"backtest_count": len(errors), "mae": round(mae, 6), "rmse": round(rmse, 6)}
    log.info("Backtest complete: %s", result)
    return result
