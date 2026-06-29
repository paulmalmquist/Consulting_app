"""Pure analog-retrieval primitives (numpy only — no Databricks/deps, CI-safe).

WHAT THIS FILE DOES: the math for finding historical precedents for an anomaly — "when has
something shaped like this happened before?". The key tool is DTW (Dynamic Time Warping), which
compares two time series by their SHAPE even if one is stretched or shifted in time, unlike a
rigid point-by-point match.

WHERE YOU SEE THIS: feeds the event-windowed analog retrieval evidence (the compute script
writes event_windowed_analog_evidence.json; the dedicated UI card is deferred per the file's
own note).

INPUTS -> OUTPUT: two signal windows (or summaries) -> a similarity/distance and a ranked list
of nearest precedents, scored by how often the retrieved cases are themselves real anomalies.

HOW TO READ THE NUMBERS:
  - DTW distance = shape difference allowing for time stretch (smaller = more alike).
  - cosine = angle-based similarity between two summary vectors (1 = identical direction).
  - z-normalize = strip out level/scale so only the shape is compared.
  - anomalous-match rate = fraction of retrieved precedents that are truly anomalies (higher = better).
  - top-k overlap = how much two retrieval methods agree on the same precedents.

Shared by compute_event_windowed_analog.py (real SMAP/MSL data) and test_analog_core.py.
The finding: whole-series cosine similarity is dominated by the long steady-state phase and
buries the rare event; event-windowed DTW on the anomalous segment finds precedents that share
the EVENT, which a cosine-on-summary search misses.
"""

from __future__ import annotations

import numpy as np


# Strip away "how high" and "how big" so only the SHAPE of the wiggle remains. Lets a small spike
# and a large spike count as similar events if they rise and fall the same way.
def znorm(x: np.ndarray) -> np.ndarray:
    """Z-normalize a 1-D series (shape-only comparison; removes level/scale)."""
    x = np.asarray(x, dtype=float)
    sd = x.std()
    return (x - x.mean()) / (sd if sd > 1e-9 else 1.0)


# Compare two signals by shape, allowing one to be stretched/compressed in time so that, e.g., a
# slow ramp and a fast ramp still match. It tries the cheapest way to line the two up point-for-
# point and returns that total cost (small = the two events look alike). The "band" just limits
# how far the alignment can stray, which keeps it fast. This distance is the core of finding the
# precedents that share the EVENT shape.
def dtw_distance(a: np.ndarray, b: np.ndarray, band: int | None = None) -> float:
    """Dynamic Time Warping distance between two 1-D series, with an optional Sakoe-Chiba
    band (|i-j| <= band) for speed. Pure numpy; returns the warped-path cost."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    n, m = len(a), len(b)
    if n == 0 or m == 0:
        return float("inf")
    w = band if band is not None else max(n, m)
    w = max(w, abs(n - m))
    INF = float("inf")
    prev = np.full(m + 1, INF)
    prev[0] = 0.0
    for i in range(1, n + 1):
        cur = np.full(m + 1, INF)
        jlo, jhi = max(1, i - w), min(m, i + w)
        for j in range(jlo, jhi + 1):
            cost = (a[i - 1] - b[j - 1]) ** 2
            cur[j] = cost + min(prev[j], cur[j - 1], prev[j - 1])
        prev = cur
    return float(np.sqrt(prev[m]))


# The "naive" comparison used as the baseline: judge two channels alike if their summary numbers
# point the same way. It ignores timing/shape, so it gets dominated by the long calm stretch and
# is exactly what event-windowed DTW is meant to beat.
def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


# Pick the k best matches — the closest precedents. Use largest=True for similarity scores
# (cosine) and largest=False for distances (DTW, where smaller is closer). This is the shortlist
# that would populate a "similar past events" panel.
def topk_indices(scores: np.ndarray, k: int, largest: bool = True) -> list[int]:
    """Indices of the top-k scores (largest similarity, or smallest distance if largest=False)."""
    scores = np.asarray(scores, dtype=float)
    order = np.argsort(scores)
    order = order[::-1] if largest else order
    return [int(i) for i in order[:k]]


# Quality score for a retrieval method: of the precedents it surfaced, how many were actually
# real anomalies? A good "find me similar past failures" tool should return mostly real failures.
# This is the headline number that lets DTW beat the cosine baseline in the finding.
def match_rate(indices: list[int], is_anomaly: np.ndarray) -> float:
    """Fraction of retrieved candidates that are themselves anomalous (precedent quality)."""
    if not indices:
        return 0.0
    return float(np.mean([is_anomaly[i] for i in indices]))


# How much do the two methods agree on which precedents are best? Low overlap is the whole point:
# it shows event-windowed DTW surfaces a different (and better) set than the cosine baseline,
# rather than just reshuffling the same results.
def overlap(a_idx: list[int], b_idx: list[int]) -> float:
    """Jaccard-style top-k overlap: |A ∩ B| / k (how much two methods agree on precedents)."""
    if not a_idx and not b_idx:
        return 1.0
    k = max(len(a_idx), len(b_idx)) or 1
    return float(len(set(a_idx) & set(b_idx)) / k)
