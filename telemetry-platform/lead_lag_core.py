"""Pure lead-lag / subsystem-attribution primitives (numpy only — CI-safe).

Shared by compute_lead_lag_attribution.py (real C-MAPSS data) and test_lead_lag_core.py.
The finding: under physical coupling (all sensors measure the same degrading engine), counting
which channels deviate at failure is redundant — many co-move. Onset timing + cross-correlation
lag separate the sensors that move FIRST (the root signal) from the downstream responders.
"""

from __future__ import annotations

import numpy as np


def smooth(x: np.ndarray, w: int = 5) -> np.ndarray:
    """Causal moving average (past-only) to denoise an onset signal."""
    x = np.asarray(x, dtype=float)
    if w <= 1 or len(x) < w:
        return x
    k = np.ones(w) / w
    pad = np.concatenate([np.full(w - 1, x[0]), x])
    return np.convolve(pad, k, mode="valid")


def onset_index(series: np.ndarray, baseline_n: int, k_sigma: float, persist: int = 3) -> int | None:
    """First index where the (smoothed) series stays > k_sigma from its early-life baseline for
    `persist` consecutive points. None if it never does. Baseline = first `baseline_n` points."""
    s = smooth(np.asarray(series, dtype=float))
    if len(s) <= baseline_n + persist:
        return None
    mu, sd = s[:baseline_n].mean(), (s[:baseline_n].std() or 1.0)
    dev = np.abs(s - mu) > k_sigma * sd
    run = 0
    for i in range(baseline_n, len(s)):
        run = run + 1 if dev[i] else 0
        if run >= persist:
            return i - persist + 1
    return None


def cross_correlation_lag(a: np.ndarray, b: np.ndarray, max_lag: int) -> int:
    """Lag L (in samples) maximizing correlation of b shifted against a, over [-max_lag, max_lag].
    Positive L => b follows a by L (a leads). Series are z-normalized first."""
    a = np.asarray(a, dtype=float); b = np.asarray(b, dtype=float)
    a = (a - a.mean()) / (a.std() or 1.0)
    b = (b - b.mean()) / (b.std() or 1.0)
    n = min(len(a), len(b))
    a, b = a[:n], b[:n]
    best_lag, best_corr = 0, -np.inf
    for lag in range(-max_lag, max_lag + 1):
        # positive lag => b follows a by `lag` (a leads): correlate a[i] with b[i+lag].
        if lag >= 0:
            x, y = a[:n - lag], b[lag:]
        else:
            x, y = a[-lag:], b[:n + lag]
        if len(x) < 3:
            continue
        c = float(np.mean(x * y))
        if c > best_corr:
            best_corr, best_lag = c, lag
    return best_lag


def count_deviating(values: np.ndarray, baseline_n: int, k_sigma: float) -> int:
    """How many of the LAST few points exceed k_sigma from baseline (channel-level attribution
    'redundancy' at failure: many coupled sensors flag at once)."""
    n_dev = 0
    for col in range(values.shape[1]):
        s = smooth(values[:, col])
        mu, sd = s[:baseline_n].mean(), (s[:baseline_n].std() or 1.0)
        if np.abs(s[-1] - mu) > k_sigma * sd:
            n_dev += 1
    return n_dev
