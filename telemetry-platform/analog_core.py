"""Pure analog-retrieval primitives (numpy only — no Databricks/deps, CI-safe).

Shared by compute_event_windowed_analog.py (real SMAP/MSL data) and test_analog_core.py.
The finding: whole-series cosine similarity is dominated by the long steady-state phase and
buries the rare event; event-windowed DTW on the anomalous segment finds precedents that share
the EVENT, which a cosine-on-summary search misses.
"""

from __future__ import annotations

import numpy as np


def znorm(x: np.ndarray) -> np.ndarray:
    """Z-normalize a 1-D series (shape-only comparison; removes level/scale)."""
    x = np.asarray(x, dtype=float)
    sd = x.std()
    return (x - x.mean()) / (sd if sd > 1e-9 else 1.0)


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


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def topk_indices(scores: np.ndarray, k: int, largest: bool = True) -> list[int]:
    """Indices of the top-k scores (largest similarity, or smallest distance if largest=False)."""
    scores = np.asarray(scores, dtype=float)
    order = np.argsort(scores)
    order = order[::-1] if largest else order
    return [int(i) for i in order[:k]]


def match_rate(indices: list[int], is_anomaly: np.ndarray) -> float:
    """Fraction of retrieved candidates that are themselves anomalous (precedent quality)."""
    if not indices:
        return 0.0
    return float(np.mean([is_anomaly[i] for i in indices]))


def overlap(a_idx: list[int], b_idx: list[int]) -> float:
    """Jaccard-style top-k overlap: |A ∩ B| / k (how much two methods agree on precedents)."""
    if not a_idx and not b_idx:
        return 1.0
    k = max(len(a_idx), len(b_idx)) or 1
    return float(len(set(a_idx) & set(b_idx)) / k)
