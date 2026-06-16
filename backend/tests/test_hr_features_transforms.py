"""Golden-value + fail-closed tests for the Episode Feature Store transforms (no DB).

The series [1, 2, 4, 7, 11] (first-differences 1,2,3,4) is hand-computed so every
expected value below is exact / closed-form. Run from backend/:
    pytest --noconftest tests/test_hr_features_transforms.py
"""

from __future__ import annotations

import math

import pytest

from app.services.hr_features import compute
from app.services.hr_features.transforms import (
    FeatureValue,
    acceleration,
    level,
    percentile_rank,
    regime_label,
    shock_frequency,
    slope,
    trend_persistence,
    velocity,
    zscore,
)

S = [1.0, 2.0, 4.0, 7.0, 11.0]


def test_level():
    assert level(S).value == 11.0


def test_velocity():
    assert velocity(S, periods=1).value == 4.0          # 11 - 7
    assert velocity(S, periods=2).value == 3.5          # (11 - 4) / 2


def test_acceleration():
    # second difference: 11 - 2*7 + 4 = 1.0
    assert acceleration(S, periods=1).value == 1.0


def test_zscore():
    # mean=5, sample std=sqrt(16.5); z=(11-5)/sqrt(16.5)
    expected = 6.0 / math.sqrt(16.5)
    assert zscore(S, window=5).value == pytest.approx(expected)


def test_slope():
    # OLS slope of y vs x=0..4 -> cov/var = 25/10
    assert slope(S, window=5).value == pytest.approx(2.5)


def test_percentile_rank():
    # latest (11) is the max -> all 4 others below -> 4/4 = 1.0
    assert percentile_rank(S, window=5).value == pytest.approx(1.0)


def test_trend_persistence():
    # ma = 5.0; trailing points above ma: 11, 7 (then 4 < 5 stops) -> 2
    assert trend_persistence(S, ma_window=5).value == 2.0


def test_shock_frequency():
    # diffs [1,2,3,4]; mean 2.5; sample std sqrt(5/3)~1.291; k=1 -> 2,3,4 exceed -> 3
    assert shock_frequency(S, window=4, k=1.0).value == 3.0


def test_regime_label_yield_curve():
    thresholds = [0.0, 0.5]
    labels = ["inverted", "flat", "steep"]
    assert regime_label([0.8], thresholds, labels).label == "steep"
    assert regime_label([-0.2], thresholds, labels).label == "inverted"
    assert regime_label([0.3], thresholds, labels).label == "flat"
    # value is echoed for downstream storage
    assert regime_label([-0.2], thresholds, labels).value == -0.2


# ---- fail-closed paths (no exceptions, null_reason set) -------------------------

def test_insufficient_history_fails_closed():
    assert velocity([5.0], periods=1).null_reason is not None
    assert velocity([5.0], periods=1).value is None
    assert acceleration([1.0, 2.0], periods=1).null_reason is not None


def test_no_variance_fails_closed():
    z = zscore([5.0, 5.0, 5.0], window=3)
    assert z.value is None
    assert z.null_reason == "no_variance"


def test_nan_and_none_holes_are_dropped():
    assert level([1.0, None, float("nan"), 9.0]).value == 9.0


def test_compute_dispatch_and_unknown_transform():
    assert compute("velocity", S, periods=1).value == 4.0
    bad = compute("does_not_exist", S)
    assert bad.value is None
    assert bad.null_reason.startswith("unknown_transform")


def test_compute_bad_params_fails_closed():
    # 'level' takes no params; passing one must not raise
    res = compute("level", S, window=3)
    assert isinstance(res, FeatureValue)
    assert res.null_reason is not None and res.null_reason.startswith("bad_params")
