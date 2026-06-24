"""Pure competence-envelope primitives (numpy only — no Databricks/sklearn, CI-safe).

Shared by compute_competence_envelope.py (which pulls real FD001/FD004 data) and the eval
test test_envelope_core.py. The envelope is a transparent Mahalanobis distance to the
training distribution: in-envelope = close to what the model was trained on; out-of-envelope
= a regime the model has not seen, where it should abstain rather than score confidently.
"""

from __future__ import annotations

import numpy as np

# Band labels + the operational action each implies.
IN, NEAR, OUT = "in_envelope", "near_boundary", "out_of_envelope"
ACTION = {IN: "score", NEAR: "review", OUT: "abstain"}


def fit_envelope(X: np.ndarray, ridge: float = 1e-3) -> tuple[np.ndarray, np.ndarray]:
    """Mean + (ridge-regularized) inverse covariance from the training rows only.
    Ridge keeps the inverse stable when sensors are collinear."""
    X = np.asarray(X, dtype=float)
    mean = X.mean(axis=0)
    cov = np.cov(X, rowvar=False)
    cov = cov + ridge * np.eye(cov.shape[0])
    return mean, np.linalg.pinv(cov)


def mahalanobis_sq(X: np.ndarray, mean: np.ndarray, cov_inv: np.ndarray) -> np.ndarray:
    """Squared Mahalanobis distance of each row to the training distribution."""
    d = np.asarray(X, dtype=float) - mean
    return np.einsum("ij,jk,ik->i", d, cov_inv, d)


def band(d2: float, tau: float, k_out: float) -> str:
    """in-envelope (<= tau) -> score; near-boundary (tau..k_out*tau) -> review; out -> abstain."""
    if d2 <= tau:
        return IN
    if d2 <= k_out * tau:
        return NEAR
    return OUT


def band_rates(d2: np.ndarray, tau: float, k_out: float) -> dict:
    """Fraction of rows in each band."""
    d2 = np.asarray(d2, dtype=float)
    n = len(d2) or 1
    return {
        IN: float(np.mean(d2 <= tau)),
        NEAR: float(np.mean((d2 > tau) & (d2 <= k_out * tau))),
        OUT: float(np.mean(d2 > k_out * tau)),
    }
