"""Eval tests for the lead-lag primitives — numpy only, no Databricks.

Run: python -m pytest telemetry-platform/test_lead_lag_core.py -q
"""

import numpy as np

from lead_lag_core import count_deviating, cross_correlation_lag, onset_index, smooth


def test_onset_detects_a_step_change():
    x = np.r_[np.zeros(60), np.ones(40) * 5.0]   # flat baseline, then a sustained jump at 60
    idx = onset_index(x, baseline_n=30, k_sigma=3.0, persist=3)
    assert idx is not None and 58 <= idx <= 64


def test_onset_none_when_flat():
    x = np.random.default_rng(0).normal(scale=0.1, size=120)
    assert onset_index(x, baseline_n=30, k_sigma=5.0) is None


def test_cross_correlation_recovers_known_lag():
    rng = np.random.default_rng(0)
    a = np.cumsum(rng.normal(size=200))
    lag = 7
    b = np.r_[np.zeros(lag), a[:-lag]]            # b follows a by 7 (a leads)
    assert abs(cross_correlation_lag(a, b, max_lag=20) - lag) <= 1


def test_lead_sensor_onsets_before_downstream():
    # Lead sensor jumps at t=50; a coupled downstream sensor responds later at t=70.
    lead = np.r_[np.zeros(50), np.ones(70) * 4.0]
    downstream = np.r_[np.zeros(70), np.ones(50) * 4.0]
    o_lead = onset_index(lead, 30, 3.0)
    o_down = onset_index(downstream, 30, 3.0)
    assert o_lead is not None and o_down is not None and o_lead < o_down


def test_count_deviating_flags_many_coupled_sensors_at_failure():
    # 5 coupled sensors all drift up by the end (channel attribution is redundant -> counts ~all).
    rng = np.random.default_rng(0)
    ramp = np.linspace(0, 6, 120)
    vals = np.column_stack([ramp + rng.normal(scale=0.1, size=120) for _ in range(5)])
    assert count_deviating(vals, baseline_n=30, k_sigma=3.0) == 5
    # a flat sensor added -> still only the 5 drifters flagged
    flat = rng.normal(scale=0.1, size=(120, 1))
    assert count_deviating(np.hstack([vals, flat]), baseline_n=30, k_sigma=3.0) == 5
