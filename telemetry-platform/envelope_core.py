"""Pure competence-envelope primitives (numpy only — no Databricks/sklearn, CI-safe).

WHAT THIS FILE DOES: a pre-test safety gate. Before trusting a model's prediction, it asks "is
this new input similar to the data the model was trained on?" using Mahalanobis distance — a
distance that accounts for how the sensors normally move together, so it isn't fooled by
correlated readings. Far-away inputs get held back (REVIEW or ABSTAIN) instead of scored.

WHERE YOU SEE THIS: the numbers here drive the frontend CompetenceEnvelopeCard (the
in-envelope / near-boundary / out-of-envelope rates and the per-sample action).

INPUTS -> OUTPUT: training rows + a new sample -> a distance and an IN/NEAR/OUT band with a
SCORE/REVIEW/ABSTAIN action (consumed by compute_competence_envelope.py, which writes
competence_envelope_evidence.json).

HOW TO READ THE NUMBERS:
  - Mahalanobis distance = how far a sample is from the training cloud, accounting for sensor
    correlations (0 = dead center, large = far outside what was seen).
  - tau = the distance line that marks the edge of "trained territory".
  - in/near/out rates = fraction of samples that are safely inside, on the edge, or outside.

Shared by compute_competence_envelope.py (which pulls real FD001/FD004 data) and the eval
test test_envelope_core.py. The envelope is a transparent Mahalanobis distance to the
training distribution: in-envelope = close to what the model was trained on; out-of-envelope
= a regime the model has not seen, where it should abstain rather than score confidently.
"""

from __future__ import annotations

import numpy as np

# Band labels + the operational action each implies. These three labels are the colored zones on
# the CompetenceEnvelopeCard: inside = trust the score, edge = have a human review, outside =
# don't issue a confident prediction at all.
IN, NEAR, OUT = "in_envelope", "near_boundary", "out_of_envelope"
ACTION = {IN: "score", NEAR: "review", OUT: "abstain"}


# Describe the shape of the training data: where its center is and how the sensors co-vary
# (which move together, and how much). That shape is what Mahalanobis distance measures against.
# The small "ridge" is just numerical insurance so the math stays stable when two sensors are
# nearly redundant.
def fit_envelope(X: np.ndarray, ridge: float = 1e-3) -> tuple[np.ndarray, np.ndarray]:
    """Mean + (ridge-regularized) inverse covariance from the training rows only.
    Ridge keeps the inverse stable when sensors are collinear."""
    X = np.asarray(X, dtype=float)
    mean = X.mean(axis=0)
    cov = np.cov(X, rowvar=False)
    cov = cov + ridge * np.eye(cov.shape[0])
    return mean, np.linalg.pinv(cov)


# The actual distance score for each new sample: how far from the training center, scaled by the
# normal spread in each direction. A sample that's extreme along a sensor that usually barely
# moves scores high; one that drifts along a naturally wide sensor scores low. This per-row number
# is what gets compared to tau to assign the band.
def mahalanobis_sq(X: np.ndarray, mean: np.ndarray, cov_inv: np.ndarray) -> np.ndarray:
    """Squared Mahalanobis distance of each row to the training distribution."""
    d = np.asarray(X, dtype=float) - mean
    return np.einsum("ij,jk,ik->i", d, cov_inv, d)


# Turn one distance into one of the three zones. Inside the line (tau) = trusted; a bit past it =
# borderline; well past it (k_out times the line) = outside trained territory. This is the
# per-sample verdict shown on the CompetenceEnvelopeCard.
def band(d2: float, tau: float, k_out: float) -> str:
    """in-envelope (<= tau) -> score; near-boundary (tau..k_out*tau) -> review; out -> abstain."""
    if d2 <= tau:
        return IN
    if d2 <= k_out * tau:
        return NEAR
    return OUT


# Summarize a whole batch: what share of samples landed in / near / outside the envelope. These
# three fractions are the headline rates on the CompetenceEnvelopeCard — e.g. "X% of the shifted
# dataset fell outside what the model was trained on".
def band_rates(d2: np.ndarray, tau: float, k_out: float) -> dict:
    """Fraction of rows in each band."""
    d2 = np.asarray(d2, dtype=float)
    n = len(d2) or 1
    return {
        IN: float(np.mean(d2 <= tau)),
        NEAR: float(np.mean((d2 > tau) & (d2 <= k_out * tau))),
        OUT: float(np.mean(d2 > k_out * tau)),
    }
