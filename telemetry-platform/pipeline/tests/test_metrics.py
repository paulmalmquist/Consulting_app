"""Local unit tests for telemetry metric definitions — run with `python -m pytest` (no cluster needed)."""
import numpy as np
import pytest

from pipeline import metrics as M


def test_rmse_mae_perfect():
    y = [10.0, 20.0, 30.0]
    assert M.rmse(y, y) == 0.0
    assert M.mae(y, y) == 0.0


def test_rmse_known():
    assert M.rmse([0, 0], [3, 4]) == pytest.approx(np.sqrt((9 + 16) / 2))


def test_phm_zero_on_perfect():
    assert M.phm_score([50, 60], [50, 60]) == pytest.approx(0.0)


def test_phm_penalizes_late_more_than_early():
    # Same magnitude error of 10 cycles: LATE (pred>true) must score higher (worse) than EARLY.
    late = M.phm_score([50], [60])    # exp(10/10)-1 = e-1
    early = M.phm_score([50], [40])   # exp(10/13)-1
    assert late == pytest.approx(np.e - 1.0)
    assert early == pytest.approx(np.exp(10 / 13) - 1.0)
    assert late > early  # asymmetry: over-stating remaining life is punished harder


def test_late_diagnostics_direction():
    # truth=50; preds: one late(+20), one early(-10), one exact.
    d = M.late_diagnostics([50, 50, 50], [70, 40, 50])
    assert d["rul_late_prediction_rate"] == pytest.approx(1 / 3)
    assert d["rul_early_prediction_rate"] == pytest.approx(1 / 3)
    assert d["rul_late_error_count"] == 1
    assert d["rul_mean_late_error"] == pytest.approx(20.0)


def test_late_diagnostics_no_late():
    d = M.late_diagnostics([50, 60], [40, 50])  # both early
    assert d["rul_late_prediction_rate"] == 0.0
    assert d["rul_late_error_count"] == 0
    assert d["rul_mean_late_error"] == 0.0  # guarded empty


def test_regime_late_rates_buckets():
    yt = [10, 30, 70, 110]            # low, low, mid, high
    yp = [20, 40, 60, 120]            # late, late, early, late
    r = M.regime_late_rates(yt, yp)
    assert r["low_RUL_<50"]["n"] == 2 and r["low_RUL_<50"]["late_rate"] == 1.0
    assert r["mid_RUL_50_100"]["n"] == 1 and r["mid_RUL_50_100"]["late_rate"] == 0.0
    assert r["high_RUL_>=100"]["n"] == 1 and r["high_RUL_>=100"]["late_rate"] == 1.0


def test_naive_baselines_strongest_is_lower_rmse():
    nb = M.naive_baselines(y_train=[10, 50, 90], y_test=[20, 40, 60, 80])
    assert nb["strongest"] in ("mean", "median")
    # strongest must have the minimum RMSE among baselines
    assert nb["strongest_scores"]["rmse"] == min(s["rmse"] for s in nb["per_baseline"].values())
