"""Pure regime-conditioning primitives (numpy only — no Databricks/sklearn, CI-safe).

Shared by compute_regime_anomaly.py (which pulls real FD004 data + fits PCA) and the
eval test test_regime_core.py. The PCA fit itself lives in the compute script (sklearn);
these are the regime-normalization + reconstruction-error + false-positive primitives that
carry the finding, kept dependency-light so the test runs without credentials.
"""

from __future__ import annotations

import numpy as np


def regime_stats(X: np.ndarray, regimes: np.ndarray) -> dict:
    """Per-regime mean/std of each feature, from the fit rows only (no leakage)."""
    stats: dict = {}
    for r in np.unique(regimes):
        rows = X[regimes == r]
        mu = rows.mean(axis=0)
        sd = rows.std(axis=0)
        sd[sd < 1e-9] = 1.0  # constant features within a regime -> no scaling
        stats[int(r)] = (mu, sd)
    return stats


def regime_zscore(X: np.ndarray, regimes: np.ndarray, stats: dict) -> np.ndarray:
    """Standardize each row using its regime's mean/std — removes the operating-condition
    offset so reconstruction error reflects faults, not regime."""
    out = np.array(X, dtype=float, copy=True)
    for r, (mu, sd) in stats.items():
        m = regimes == r
        if m.any():
            out[m] = (out[m] - mu) / sd
    return out


def recon_error(X: np.ndarray, mean: np.ndarray, components: np.ndarray) -> np.ndarray:
    """Squared reconstruction error of X under a linear projection (PCA components, rows =
    components). center -> project -> reconstruct -> squared residual per row."""
    Xc = X - mean
    proj = Xc @ components.T          # (n, k)
    recon = proj @ components         # (n, d)
    return np.sum((Xc - recon) ** 2, axis=1)


def threshold_quantile(errs: np.ndarray, q: float) -> float:
    return float(np.quantile(errs, q))


def per_regime_rate(errs: np.ndarray, regimes: np.ndarray, tau: float) -> dict:
    """Fraction of rows per regime exceeding tau (the false-positive rate on healthy rows)."""
    out: dict = {}
    for r in np.unique(regimes):
        m = regimes == r
        out[int(r)] = float(np.mean(errs[m] > tau)) if m.any() else 0.0
    return out


def spread(rates: dict) -> float:
    """Cross-regime spread of the per-regime rates (max - min)."""
    vals = list(rates.values())
    return float(max(vals) - min(vals)) if vals else 0.0
