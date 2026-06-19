"""Feature importance across models — reuses the ML-lab trainers.

Builds one supervised frame (canonical subset + the 6 engineered signature
columns) and runs `hr_ml_demo.trainers` so importances are computed exactly as
the lab computes them (consistent across both surfaces). Deterministic (seed 42).
"""

from __future__ import annotations

import functools
from typing import Any

import numpy as np
import pandas as pd

from app.services.hr_ml_demo.trainers import train_classification, train_regression

from .enrich import signature_series
from .macro_dataset import generate_macro_panel

_SUPERVISED_CANONICAL = [
    "vix_spot", "yield_curve_10y2y", "hy_credit_spread", "btc_mvrv_zscore",
    "crypto_fear_greed", "sp500_drawdown_60d", "term_premium", "move_index",
]
_SIGNATURE_COLS = [
    "yield_curve_10y2y_velocity_30d", "credit_complacency_gap",
    "liquidity_fragmentation_score", "narrative_flow_mismatch",
    "non_event_counterexample_score",
]


def _training_frame(panel: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    frame = panel.copy()
    sigs = signature_series(panel)
    for col in _SIGNATURE_COLS:
        frame[col] = sigs[col]
    features = _SUPERVISED_CANONICAL + _SIGNATURE_COLS
    keep = features + ["forward_return_30d", "risk_event_30d"]
    frame = frame[keep].replace([np.inf, -np.inf], np.nan).dropna().reset_index(drop=True)
    return frame, features


@functools.lru_cache(maxsize=2)
def importance_across_models() -> dict[str, list[dict[str, Any]]]:
    """Per-feature list of {model, importance|coefficient} across RF / logistic / linear."""
    panel = generate_macro_panel()
    frame, features = _training_frame(panel)

    out: dict[str, list[dict[str, Any]]] = {f: [] for f in features}

    rf_demo = {"id": "random_forest", "task_family": "classification",
               "features": features, "target": "risk_event_30d"}
    rf = train_classification(frame, rf_demo, None)
    for item in rf["charts"].get("feature_importance", []):
        out.setdefault(item["feature"], []).append(
            {"model": "random_forest", "importance": item["importance"]})

    lr_demo = {"id": "logistic_regression", "task_family": "classification",
               "features": features, "target": "risk_event_30d"}
    lr = train_classification(frame, lr_demo, None)
    for item in lr["charts"].get("feature_importance", []):
        out.setdefault(item["feature"], []).append(
            {"model": "logistic_regression", "coefficient_abs": item["importance"]})

    lin_demo = {"id": "linear_regression", "task_family": "regression",
                "features": features, "target": "forward_return_30d"}
    lin = train_regression(frame, lin_demo, None)
    for item in lin["charts"].get("coefficient_bar", []):
        out.setdefault(item["feature"], []).append(
            {"model": "linear_regression", "coefficient": item["coefficient"]})

    return out


def importance_for_feature(feature_id: str) -> list[dict[str, Any]]:
    return importance_across_models().get(feature_id, [])
