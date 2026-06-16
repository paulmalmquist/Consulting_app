"""Tests for the Phase 0 pipeline smoke model (pure train_smoke, no DB)."""

from __future__ import annotations

from app.services.hr_features.model import SMOKE_FEATURES, TARGET, train_smoke


def _row(name, target, base):
    return {"episode_id": name, "name": name, TARGET: target,
            "features": {f: base + i * 0.1 for i, f in enumerate(SMOKE_FEATURES)}}


def test_smoke_model_trains_and_scores():
    frame = [_row("GFC", 1.0, 0.9), _row("Brexit", 0.0, 0.1), _row("COVID", 1.0, 1.2)]
    res = train_smoke(frame)
    assert res["status"] == "experimental"
    assert res["calibrated"] is False           # never claims calibration
    assert res["evaluation"] == "in_sample"
    assert res["n_train"] == 3
    assert len(res["importances"]) == len(SMOKE_FEATURES)
    assert len(res["episodes"]) == 3
    for ep in res["episodes"]:
        assert 0.0 <= ep["recession_probability"] <= 1.0


def test_fail_closed_single_class():
    frame = [_row("a", 0.0, 0.1), _row("b", 0.0, 0.2)]
    res = train_smoke(frame)
    assert res["status"] == "not_available"
    assert res["null_reason"] == "single_class"


def test_fail_closed_too_few():
    res = train_smoke([_row("only", 1.0, 0.5)])
    assert res["status"] == "not_available"
    assert res["null_reason"] == "insufficient_episodes"
