"""Pure split-conformal primitives (numpy only — no Databricks, CI-safe).

Shared by compute_rul_conformal.py (which pulls real FD001 data) and the eval test
test_conformal_core.py (which checks coverage on synthetic exchangeable data). Keeping
the math here means the test runs without credentials or a warehouse.
"""

from __future__ import annotations

import numpy as np


def conformal_quantile(scores: np.ndarray, alpha: float) -> float:
    """Finite-sample split-conformal quantile of nonconformity ``scores``.

    Returns the ``ceil((n+1)(1-alpha))/n`` empirical quantile — the standard
    finite-sample-valid threshold. With too few points the index is capped at n
    (the bound degenerates to the max score rather than +inf).
    """
    scores = np.asarray(scores, dtype=float)
    n = len(scores)
    if n == 0:
        raise ValueError("need >= 1 calibration score")
    k = int(np.ceil((n + 1) * (1 - alpha)))
    k = min(k, n)
    return float(np.sort(scores)[k - 1])


def two_sided_interval(pred: np.ndarray, qhat: float, lo: float, hi: float):
    """Symmetric [pred-qhat, pred+qhat], clipped to [lo, hi]."""
    pred = np.asarray(pred, dtype=float)
    return np.clip(pred - qhat, lo, hi), np.clip(pred + qhat, lo, hi)


def lower_bound(pred: np.ndarray, q_lower: float, lo: float, hi: float):
    """One-sided lower bound pred - q_lower, clipped. For a RUL go/no-go this is the
    worst-case remaining-life the calibration supports at the target confidence."""
    pred = np.asarray(pred, dtype=float)
    return np.clip(pred - q_lower, lo, hi)


def gate(value: float, t_nogo: float, t_review: float) -> str:
    """Three-tier clearance band on a remaining-life value (cycles)."""
    if value <= t_nogo:
        return "NO_GO"
    if value <= t_review:
        return "REVIEW"
    return "GO"


def picp(y_true: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> float:
    """Prediction Interval Coverage Probability."""
    y_true = np.asarray(y_true, dtype=float)
    return float(np.mean((y_true >= lower) & (y_true <= upper)))
