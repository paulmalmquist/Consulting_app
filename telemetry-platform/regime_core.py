"""Pure regime-conditioning primitives (numpy only — no Databricks/sklearn, CI-safe).

WHAT THIS FILE DOES: the small, shared math used to judge a machine as "normal relative to
the operating mode it's in right now" instead of "normal on one global scale". A "regime" is a
distinct operating condition (e.g. cruise vs climb). These functions standardize per regime,
measure how badly a reconstruction model misses, and turn that into a false-alarm rate.

WHERE YOU SEE THIS: the numbers these produce flow up to the frontend RegimeAnomalyCard
(per-regime false-positive rates; global detector vs regime-conditioned detector).

INPUTS -> OUTPUT: sensor rows + a regime label per row -> per-regime false-positive rates and
spreads (consumed by compute_regime_anomaly.py, which writes regime_anomaly_evidence.json).

HOW TO READ THE NUMBERS:
  - reconstruction error = how far a row is from what a simple model expected (big = surprising).
  - false-positive rate = fraction of KNOWN-HEALTHY rows the detector wrongly flagged (lower is better).
  - cross-regime spread = max minus min false-positive rate across regimes (lower = fairer across modes).

Shared by compute_regime_anomaly.py (which pulls real FD004 data + fits PCA) and the
eval test test_regime_core.py. The PCA fit itself lives in the compute script (sklearn);
these are the regime-normalization + reconstruction-error + false-positive primitives that
carry the finding, kept dependency-light so the test runs without credentials.
"""

from __future__ import annotations

import numpy as np


# Learn, separately for each operating mode, what a typical sensor reading looks like (its
# average and how much it normally wobbles). This is the reference point used later to ask
# "is this row unusual FOR ITS REGIME?" rather than "unusual on one global scale?".
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


# Re-express every row as "how many standard deviations from normal FOR ITS OWN REGIME".
# This is the core trick: after this, a healthy cruise row and a healthy climb row both look
# ~average, so the detector stops flagging a machine just because it switched modes.
def regime_zscore(X: np.ndarray, regimes: np.ndarray, stats: dict) -> np.ndarray:
    """Standardize each row using its regime's mean/std — removes the operating-condition
    offset so reconstruction error reflects faults, not regime."""
    out = np.array(X, dtype=float, copy=True)
    for r, (mu, sd) in stats.items():
        m = regimes == r
        if m.any():
            out[m] = (out[m] - mu) / sd
    return out


# The anomaly score itself. PCA learns the handful of patterns that explain healthy data; we
# squash each row down to those patterns and rebuild it. A healthy row rebuilds almost
# perfectly (small error); a faulty/odd row can't be rebuilt from healthy patterns (large
# error). The per-row number returned here is what gets compared against the alarm threshold.
def recon_error(X: np.ndarray, mean: np.ndarray, components: np.ndarray) -> np.ndarray:
    """Squared reconstruction error of X under a linear projection (PCA components, rows =
    components). center -> project -> reconstruct -> squared residual per row."""
    Xc = X - mean
    proj = Xc @ components.T          # (n, k)
    recon = proj @ components         # (n, d)
    return np.sum((Xc - recon) ** 2, axis=1)


# Set the alarm line. Pick the error level that, say, 95% of healthy training rows fall under;
# anything above it counts as an alarm. By construction this gives ~5% false alarms on the fit
# data — the test is whether it stays low on held-out rows and across all regimes.
def threshold_quantile(errs: np.ndarray, q: float) -> float:
    return float(np.quantile(errs, q))


# For each operating mode, what fraction of KNOWN-HEALTHY rows tripped the alarm. These are the
# bars on the RegimeAnomalyCard: high bars = the detector false-alarms in that mode.
def per_regime_rate(errs: np.ndarray, regimes: np.ndarray, tau: float) -> dict:
    """Fraction of rows per regime exceeding tau (the false-positive rate on healthy rows)."""
    out: dict = {}
    for r in np.unique(regimes):
        m = regimes == r
        out[int(r)] = float(np.mean(errs[m] > tau)) if m.any() else 0.0
    return out


# One fairness number: the gap between the worst and best regime's false-alarm rate. A big gap
# means the detector treats some operating modes much more harshly than others; conditioning on
# regime should shrink this gap (visible as flatter bars on the card).
def spread(rates: dict) -> float:
    """Cross-regime spread of the per-regime rates (max - min)."""
    vals = list(rates.values())
    return float(max(vals) - min(vals)) if vals else 0.0
