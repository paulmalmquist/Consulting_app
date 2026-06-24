"""Eval tests for the analog-retrieval primitives — numpy only, no Databricks.

Run: python -m pytest telemetry-platform/test_analog_core.py -q
"""

import numpy as np

from analog_core import cosine, dtw_distance, match_rate, overlap, topk_indices, znorm


def test_dtw_zero_for_identical_and_small_for_time_shift():
    a = np.sin(np.linspace(0, 6, 60))
    assert dtw_distance(a, a) < 1e-9
    shifted = np.r_[a[5:], a[:5]]            # circular time shift
    # DTW tolerates the warp far better than rigid Euclidean does.
    eucl = float(np.sqrt(np.sum((a - shifted) ** 2)))
    assert dtw_distance(a, shifted, band=10) < eucl


def test_cosine_and_topk():
    assert cosine(np.array([1.0, 0]), np.array([1.0, 0])) == 1.0
    assert abs(cosine(np.array([1.0, 0]), np.array([0, 1.0]))) < 1e-9
    assert topk_indices(np.array([0.1, 0.9, 0.5]), 2, largest=True) == [1, 2]
    assert topk_indices(np.array([0.1, 0.9, 0.5]), 2, largest=False) == [0, 2]


def test_match_rate_and_overlap():
    isa = np.array([1, 0, 1, 0, 1])
    assert match_rate([0, 2, 4], isa) == 1.0
    assert match_rate([1, 3], isa) == 0.0
    assert overlap([1, 2, 3], [2, 3, 4]) == 2 / 3


def test_event_windowed_dtw_beats_whole_series_cosine_at_finding_the_event():
    # A channel's whole-series summary is dominated by its steady-state level; two channels
    # with the SAME rare event but different steady states look DIFFERENT by summary-cosine,
    # yet their event windows match under DTW. Build that and check retrieval quality.
    rng = np.random.default_rng(0)
    L = 48
    spike = np.zeros(L); spike[L // 2 - 3:L // 2 + 3] = 4.0   # the shared "event"
    # query: event on a low steady state
    query = znorm(spike + rng.normal(scale=0.05, size=L))

    cands, summaries, isa = [], [], []
    # 5 anomaly candidates: same event, very different steady-state levels (+/- big offsets)
    for off in (-20, -10, 0, 10, 20):
        w = spike + off + rng.normal(scale=0.05, size=L)
        cands.append(znorm(w)); summaries.append(np.array([w.mean(), w.std()])); isa.append(1)
    # 5 normal candidates: no event, near the query's steady-state level (cosine-on-summary bait)
    for _ in range(5):
        w = rng.normal(scale=0.05, size=L)
        cands.append(znorm(w)); summaries.append(np.array([w.mean(), w.std()])); isa.append(0)
    isa = np.array(isa)
    q_summary = np.array([spike.mean(), spike.std()])

    # Whole-series cosine on the (level-bearing) summary
    a_scores = np.array([cosine(q_summary, s) for s in summaries])
    a_top = topk_indices(a_scores, 3, largest=True)
    # Event-windowed DTW on the z-normed event shape (smaller distance = closer)
    b_dist = np.array([dtw_distance(query, c, band=8) for c in cands])
    b_top = topk_indices(b_dist, 3, largest=False)

    # Event-windowed DTW retrieves the true-event precedents; summary-cosine does worse.
    assert match_rate(b_top, isa) > match_rate(a_top, isa)
    assert match_rate(b_top, isa) >= 0.66
