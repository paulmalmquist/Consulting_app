"""Unit tests for hr_decision_runner.

These cover the decision-composition logic in isolation (no DB). End-to-end
verification against live Supabase is done separately via scripts/hr_weekly_brief.py
and scripts/hr_daily_decision.py.
"""

from __future__ import annotations

import pytest

from app.services import hr_decision_runner as runner
from app.services.hr_decision_runner import (
    BriefPayload,
    CurrentState,
    SignalPayload,
    _classify_regime,
    _compose_decision,
    _multi_agent_agreement,
    _regime_default,
    _normalize_position,
)


# ── regime classifier ─────────────────────────────────────────────────────────


def test_classify_regime_unknown_when_signals_missing():
    assert _classify_regime({}) == "unknown"
    assert _classify_regime({"yc_10y2y": 0.5}) == "unknown"  # vix missing


def test_classify_regime_crisis_when_vix_backwardated():
    assert _classify_regime({"yc_10y2y": 0.5, "vix_term": -0.2}) == "crisis"


def test_classify_regime_stagflation_when_inverted_and_credit_stressed():
    regime = _classify_regime({"yc_10y2y": -0.3, "vix_term": 1.5, "cmbs_delinq": 0.08})
    assert regime == "stagflation"


def test_classify_regime_late_cycle_when_only_inverted():
    assert _classify_regime({"yc_10y2y": -0.1, "vix_term": 0.9}) == "late_cycle"


def test_classify_regime_expansion_when_curve_steep_vol_low():
    assert _classify_regime({"yc_10y2y": 1.2, "vix_term": 0.5}) == "expansion"


# ── multi-agent agreement ─────────────────────────────────────────────────────


def test_multi_agent_agreement_unanimous_is_one():
    ma = {
        "macro": {"direction": "down"},
        "quant": {"direction": "down"},
        "narrative": {"direction": "down"},
    }
    assert _multi_agent_agreement(ma) == 1.0


def test_multi_agent_agreement_split_is_dominant_fraction():
    ma = {
        "macro": {"direction": "down"},
        "quant": {"direction": "down"},
        "narrative": {"direction": "up"},
    }
    assert _multi_agent_agreement(ma) == pytest.approx(2 / 3)


def test_multi_agent_agreement_empty_is_zero():
    assert _multi_agent_agreement({}) == 0.0


# ── regime default fallback ───────────────────────────────────────────────────


def test_regime_default_expansion_is_long_spy():
    asset, direction, size = _regime_default("expansion")
    assert asset == "SPY"
    assert direction == "long"
    assert 0.0 < size <= 1.0


def test_regime_default_unknown_is_neutral_cash():
    asset, direction, size = _regime_default("unknown")
    assert asset == "CASH"
    assert direction == "neutral"


# ── normalize_position snaps invalid horizons ─────────────────────────────────


def test_normalize_position_snaps_horizon():
    out = _normalize_position({"asset": "X", "direction": "long", "size": 0.5, "time_horizon_days": 45}, None)
    assert out["time_horizon_days"] == 30  # nearest of 7/30/90


def test_normalize_position_clamps_size():
    out = _normalize_position({"asset": "X", "direction": "long", "size": 99.0, "time_horizon_days": 30}, None)
    assert out["size"] == 1.0


def test_normalize_position_invalid_direction_becomes_neutral():
    out = _normalize_position({"asset": "X", "direction": "sideways", "size": 0.3, "time_horizon_days": 30}, None)
    assert out["direction"] == "neutral"


# ── compose_decision end-to-end on in-memory inputs ───────────────────────────


def _synthetic_inputs(
    *,
    rhyme_score: float = 0.87,
    crowding: float = 0.3,
    honeypot_score: float = 0.4,
    freshness: str = "fresh",
    recommended_positions: list[dict] | None = None,
    multi_agent_agree: bool = True,
) -> tuple[BriefPayload, SignalPayload, CurrentState]:
    ma = {
        "macro":      {"direction": "down", "confidence": 0.6},
        "quant":      {"direction": "down", "confidence": 0.65},
        "narrative":  {"direction": "down" if multi_agent_agree else "up", "confidence": 0.55},
        "contrarian": {"direction": "up", "confidence": 0.5},
        "red_team":   {"direction": "down", "confidence": 0.7},
    }
    default_recs = [
        {
            "asset": "SPY", "direction": "short", "size": 0.4,
            "time_horizon_days": 30, "entry_type": "staggered",
            "key_drivers": ["test"],
            "invalidation": "yield curve re-inverts",
            "next_check": "daily snapshot",
        }
    ]
    recs = default_recs if recommended_positions is None else recommended_positions
    brief = BriefPayload(
        brief_id="00000000-0000-0000-0000-000000000001",  # type: ignore[arg-type]
        regime_call="late_cycle",
        parsed_json={
            "analogs": [{"episode_name": "2000 Q1", "rhyme_score": rhyme_score}],
            "multi_agent_forecasts": ma,
            "honeypot_alerts": [{"kind": "x", "score": honeypot_score}],
            "crowding_score": crowding,
            "recommended_positions": recs,
        },
    )
    signals = SignalPayload(
        snapshot_id="00000000-0000-0000-0000-000000000002",  # type: ignore[arg-type]
        signals_json={"yc_10y2y": -0.1, "vix_term": 0.9, "cmbs_delinq": 0.04},
    )
    state = CurrentState(
        latest_brief_id=brief.brief_id,
        latest_brief_at=None,
        latest_snapshot_id=signals.snapshot_id,
        latest_snapshot_at=None,
        latest_decision_id=None,
        latest_regime=None,
        worst_input_age_hours=5.0,
        freshness_verdict=freshness,
    )
    return brief, signals, state


def test_compose_happy_path_emits_positions():
    brief, signals, state = _synthetic_inputs()
    out = _compose_decision(brief, signals, state)
    assert out["regime"] == "late_cycle"
    assert len(out["positions"]) == 1
    p = out["positions"][0]
    assert p["asset"] == "SPY"
    assert p["direction"] == "short"
    assert p["time_horizon_days"] == 30
    assert p["invalidation"]
    assert 0.0 <= out["confidence"] <= 1.0


def test_compose_analog_gate_fail_halves_size_and_adds_divergence_alert():
    # rhyme_score below 0.85 AND multi-agent split → gate not cleared
    brief, signals, state = _synthetic_inputs(rhyme_score=0.5, multi_agent_agree=False)
    out = _compose_decision(brief, signals, state)
    assert out["positions"][0]["size"] == pytest.approx(0.4 * 0.5, abs=0.01)
    assert any(a["type"] == "divergence" for a in out["alerts"])


def test_compose_honeypot_cut_zeroes_size_and_adds_alert():
    brief, signals, state = _synthetic_inputs(honeypot_score=0.9)
    out = _compose_decision(brief, signals, state)
    assert out["positions"][0]["size"] == pytest.approx(0.0)
    assert any(a["type"] == "honeypot" for a in out["alerts"])


def test_compose_crowding_cut_halves_size_and_adds_alert():
    brief, signals, state = _synthetic_inputs(crowding=0.8)
    out = _compose_decision(brief, signals, state)
    assert out["positions"][0]["size"] == pytest.approx(0.4 * 0.5, abs=0.01)
    assert any(a["type"] == "crowding" for a in out["alerts"])


def test_compose_stale_snapshot_halves_size_and_caps_confidence():
    brief, signals, state = _synthetic_inputs(freshness="stale_snapshot")
    out = _compose_decision(brief, signals, state)
    assert out["positions"][0]["size"] == pytest.approx(0.4 * 0.5, abs=0.01)
    assert out["confidence"] < runner.FAILURE_CONFIDENCE_CEILING
    assert any(a["type"] == "data_quality" for a in out["alerts"])


def test_compose_caps_at_five_positions():
    too_many = [
        {
            "asset": f"ASSET{i}", "direction": "long", "size": 0.2,
            "time_horizon_days": 7, "entry_type": "immediate",
            "key_drivers": ["x"], "invalidation": "y", "next_check": "z",
        }
        for i in range(10)
    ]
    brief, signals, state = _synthetic_inputs(recommended_positions=too_many)
    out = _compose_decision(brief, signals, state)
    assert len(out["positions"]) == runner.MAX_POSITIONS


def test_compose_every_position_has_invalidation():
    brief, signals, state = _synthetic_inputs()
    out = _compose_decision(brief, signals, state)
    for p in out["positions"]:
        assert p["invalidation"]
        assert p["time_horizon_days"] in {7, 30, 90}


def test_compose_regime_default_when_no_recommendations():
    brief, signals, state = _synthetic_inputs(recommended_positions=[])
    out = _compose_decision(brief, signals, state)
    assert len(out["positions"]) == 1
    p = out["positions"][0]
    # late_cycle → IEF long per _regime_default
    assert p["asset"] == "IEF"
    assert p["direction"] == "long"


# ── no-input degraded response ───────────────────────────────────────────────


def test_no_input_response_shape_matches_contract():
    r = runner.NO_INPUT_RESPONSE
    assert r["regime"] == "unknown"
    assert r["confidence"] == 0.0
    assert r["positions"] == []
    assert r["risk"]["gross_exposure"] == 0.0
    assert any(a["type"] == "data_quality" and a["action"] == "pause" for a in r["alerts"])
