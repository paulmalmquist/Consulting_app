"""Eval tests for the split-conformal primitives — numpy only, no Databricks.

Run: python -m pytest telemetry-platform/test_conformal_core.py -q
"""

import numpy as np

from conformal_core import conformal_quantile, gate, lower_bound, picp, two_sided_interval


def test_conformal_quantile_known_values():
    # 10 scores 1..10, alpha=0.1 -> k = ceil(11*0.9)=10 -> 10th sorted score = 10.
    s = np.arange(1, 11, dtype=float)
    assert conformal_quantile(s, 0.10) == 10.0
    # alpha=0.5 -> k = ceil(11*0.5)=6 -> 6th = 6.
    assert conformal_quantile(s, 0.50) == 6.0


def test_split_conformal_achieves_target_coverage_on_exchangeable_data():
    # Exchangeable Gaussian-noise regression: split conformal must cover ~ (1-alpha).
    rng = np.random.default_rng(0)
    n = 4000
    pred = rng.uniform(0, 100, size=n)
    noise = rng.normal(0, 8, size=n)
    y = pred + noise
    cal, test = slice(0, 2000), slice(2000, n)
    qhat = conformal_quantile(np.abs(y[cal] - pred[cal]), 0.10)
    lo, hi = two_sided_interval(pred[test], qhat, -1e9, 1e9)
    cov = picp(y[test], lo, hi)
    # finite-sample valid: coverage >= 0.90 - slack, and not absurdly over.
    assert 0.88 <= cov <= 0.96, cov


def test_lower_bound_is_below_point_and_monotone():
    pred = np.array([60.0, 30.0, 10.0])
    lb = lower_bound(pred, q_lower=15.0, lo=0, hi=125)
    assert np.all(lb <= pred)
    assert lb[2] == 0.0  # clipped at floor


def test_gate_bands():
    assert gate(20, 30, 50) == "NO_GO"
    assert gate(40, 30, 50) == "REVIEW"
    assert gate(80, 30, 50) == "GO"
    # The safety point: a point estimate can clear (GO) while the lower bound flags.
    assert gate(55, 30, 50) == "GO"
    assert gate(33, 30, 50) == "REVIEW"
