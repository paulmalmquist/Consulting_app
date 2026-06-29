"""Pure split-conformal primitives (numpy only — no Databricks, CI-safe).

WHAT THIS FILE DOES: the math for putting an honest uncertainty band around a prediction.
"Conformal" = a recipe that turns past prediction errors into a band guaranteed to contain the
truth a chosen fraction of the time (e.g. 90%), with no assumptions about the model. Here it
wraps a Remaining-Useful-Life (RUL) prediction and turns its worst-case lower edge into a
service decision.

WHERE YOU SEE THIS: feeds the RulConformalCard and the RUL Calibration page (the 80%/90%
interval ribbons and the GO / REVIEW / NO_GO gate).

INPUTS -> OUTPUT: past calibration errors + a target confidence -> band half-width and a
GO/REVIEW/NO_GO label (consumed by compute_rul_conformal.py, which writes rul_conformal_evidence.json).

HOW TO READ THE NUMBERS:
  - alpha = the allowed miss rate; coverage target = 1 - alpha (alpha 0.10 => aim for 90% coverage).
  - qhat = how wide the band has to be (in cycles) to hit that coverage.
  - PICP = how often the truth actually landed inside the band (want it near the target).
  - gate = turning the cautious lower edge of the band into GO / REVIEW / NO_GO for servicing.

Shared by compute_rul_conformal.py (which pulls real FD001 data) and the eval test
test_conformal_core.py (which checks coverage on synthetic exchangeable data). Keeping
the math here means the test runs without credentials or a warehouse.
"""

from __future__ import annotations

import numpy as np


# The heart of conformal prediction. Feed in how far off the model was on a set of held-out
# "calibration" examples; this returns the error size you must allow for to cover (1-alpha) of
# future cases. The slightly-larger-than-plain-quantile index ((n+1)(1-alpha)) is what gives the
# honest finite-sample coverage guarantee. The returned value becomes the band half-width qhat.
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


# Build the visible ribbon: take the prediction and pad it by qhat on both sides. This pair of
# arrays is exactly the upper/lower edge of the interval ribbon on the RUL Calibration page.
def two_sided_interval(pred: np.ndarray, qhat: float, lo: float, hi: float):
    """Symmetric [pred-qhat, pred+qhat], clipped to [lo, hi]."""
    pred = np.asarray(pred, dtype=float)
    return np.clip(pred - qhat, lo, hi), np.clip(pred + qhat, lo, hi)


# For a safety decision we only care about the pessimistic edge: "how little life might be left?"
# This returns just that cautious lower bound, which is what the GO/NO_GO gate is applied to (you
# service on the worst-case estimate, not the rosy point prediction).
def lower_bound(pred: np.ndarray, q_lower: float, lo: float, hi: float):
    """One-sided lower bound pred - q_lower, clipped. For a RUL go/no-go this is the
    worst-case remaining-life the calibration supports at the target confidence."""
    pred = np.asarray(pred, dtype=float)
    return np.clip(pred - q_lower, lo, hi)


# Translate a remaining-life number into a plain operational verdict: too little life -> NO_GO
# (service before next use), borderline -> REVIEW, plenty -> GO. This is the colored badge the
# RulConformalCard shows. Applied to the cautious lower bound above, not the raw prediction.
def gate(value: float, t_nogo: float, t_review: float) -> str:
    """Three-tier clearance band on a remaining-life value (cycles)."""
    if value <= t_nogo:
        return "NO_GO"
    if value <= t_review:
        return "REVIEW"
    return "GO"


# The honesty check: of all the test cases, what fraction had their true value land inside the
# band? PICP = Prediction Interval Coverage Probability. If we aimed for 90% and PICP comes back
# ~0.90 the bands are well-calibrated. This is the headline "coverage" figure on the RUL
# Calibration page.
def picp(y_true: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> float:
    """Prediction Interval Coverage Probability."""
    y_true = np.asarray(y_true, dtype=float)
    return float(np.mean((y_true >= lower) & (y_true <= upper)))
