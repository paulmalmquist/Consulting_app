"""Tests for the real manual HR bundle adapter + replay (Phase 5B).

No broker, no credentials. Covers the real flat-bundle shape
(scripts/hr_weekly_brief.py): all 8 canonical signals, value-type variety
(scalar/dict/string), per_signal_freshness -> staleness_status, missing/invalid
fields, forward-compat (unknown signals ignored), and replay idempotency
(stable idempotency_key across re-publish + bounded slicing).
"""

from __future__ import annotations

import json

import pytest

from app.events.hr_signal_publisher import (
    HR_SIGNAL_NAMES,
    InvalidSignalBundle,
    real_bundle_to_envelopes,
)
from app.events.topics import EventTypes


def _real_signals() -> dict:
    """The flat real-bundle signals map: all 8 signals + freshness + source."""
    return {
        "signals": {
            "mvrv_z": 1.4,
            "yc_10y2y": -0.10,
            "vix_term": 0.95,
            "housing": {"price_yoy": -2.1, "starts_yoy": -15.0},
            "cmbs_delinq": 0.062,
            "fed_tone": "hawkish-hold",
            "crypto_flow": -0.8,
            "macro_surprise": -0.45,
            "per_signal_freshness": {
                "mvrv_z": "fresh", "yc_10y2y": "fresh", "vix_term": "fresh",
                "housing": "1d", "cmbs_delinq": "7d", "fed_tone": "fresh",
                "crypto_flow": "fresh", "macro_surprise": "1d",
            },
            "source": "seed",
        }
    }


# ── all 8 signals ────────────────────────────────────────────────────────────

def test_canonical_eight_signal_names():
    assert HR_SIGNAL_NAMES == (
        "mvrv_z", "yc_10y2y", "vix_term", "housing",
        "cmbs_delinq", "fed_tone", "crypto_flow", "macro_surprise",
    )
    assert len(HR_SIGNAL_NAMES) == 8


def test_real_bundle_emits_all_eight_signals():
    envs = real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")
    assert len(envs) == 8
    names = [e.payload["signal_name"] for e in envs]
    assert set(names) == set(HR_SIGNAL_NAMES)
    # deterministic order = HR_SIGNAL_NAMES order
    assert names == list(HR_SIGNAL_NAMES)


def test_metadata_keys_are_not_emitted_as_signals():
    envs = real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")
    names = {e.payload["signal_name"] for e in envs}
    assert "per_signal_freshness" not in names
    assert "source" not in names


# ── value-type variety preserved ─────────────────────────────────────────────

def test_scalar_dict_string_values_preserved():
    envs = {e.payload["signal_name"]: e.payload for e in
            real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")}
    assert envs["mvrv_z"]["signal_value"] == 1.4              # scalar float
    assert envs["housing"]["signal_value"] == {"price_yoy": -2.1, "starts_yoy": -15.0}  # nested dict
    assert envs["fed_tone"]["signal_value"] == "hawkish-hold"  # string


def test_per_signal_freshness_maps_to_staleness():
    envs = {e.payload["signal_name"]: e.payload for e in
            real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")}
    assert envs["mvrv_z"]["staleness_status"] == "fresh"
    assert envs["cmbs_delinq"]["staleness_status"] == "7d"
    assert envs["housing"]["staleness_status"] == "1d"


def test_source_propagates():
    env = real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")[0]
    assert env.payload["source"] == "seed"


def test_full_bundle_with_brief_section_unwraps_signals():
    """Passing the full bundle ({'brief':..., 'signals':...}) works too."""
    full = {"brief": {"regime_call": "late_cycle"}, **_real_signals()}
    envs = real_bundle_to_envelopes(full, as_of_date="2026-06-14")
    assert len(envs) == 8


def test_envelopes_are_wire_serializable():
    for env in real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14"):
        data = json.loads(env.to_wire())
        assert data["event_type"] == EventTypes.HR_SIGNAL_OBSERVED


# ── missing / invalid fields ─────────────────────────────────────────────────

def test_missing_as_of_raises():
    with pytest.raises(InvalidSignalBundle):
        real_bundle_to_envelopes(_real_signals(), as_of_date="")


def test_signals_not_a_dict_raises():
    with pytest.raises(InvalidSignalBundle):
        real_bundle_to_envelopes({"signals": ["not", "a", "dict"]}, as_of_date="2026-06-14")


def test_bundle_with_no_canonical_signals_raises():
    with pytest.raises(InvalidSignalBundle):
        real_bundle_to_envelopes(
            {"signals": {"some_unknown_signal": 1, "source": "x"}}, as_of_date="2026-06-14",
        )


def test_unknown_signals_are_ignored_forward_compat():
    sig = _real_signals()
    sig["signals"]["a_future_signal"] = 9.9  # not in HR_SIGNAL_NAMES
    envs = real_bundle_to_envelopes(sig, as_of_date="2026-06-14")
    assert len(envs) == 8  # the unknown one is skipped
    assert "a_future_signal" not in {e.payload["signal_name"] for e in envs}


def test_partial_bundle_emits_only_present_signals():
    partial = {"signals": {"mvrv_z": 1.0, "vix_term": 0.5, "source": "partial"}}
    envs = real_bundle_to_envelopes(partial, as_of_date="2026-06-14")
    assert {e.payload["signal_name"] for e in envs} == {"mvrv_z", "vix_term"}


def test_missing_freshness_defaults_to_unknown():
    sig = {"signals": {"mvrv_z": 1.0, "source": "x"}}  # no per_signal_freshness
    env = real_bundle_to_envelopes(sig, as_of_date="2026-06-14")[0]
    assert env.payload["staleness_status"] == "unknown"


# ── replay idempotency / bounded behavior ────────────────────────────────────

def test_replay_produces_identical_idempotency_keys():
    """Republishing the same bundle yields identical keys -> BQ insertId dedup."""
    a = [e.idempotency_key for e in real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")]
    b = [e.idempotency_key for e in real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")]
    assert a == b
    # key shape includes as_of_date + signal_name
    assert a[0] == f"{EventTypes.HR_SIGNAL_OBSERVED}:2026-06-14:mvrv_z"


def test_different_as_of_dates_produce_distinct_keys():
    a = {e.idempotency_key for e in real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")}
    b = {e.idempotency_key for e in real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-15")}
    assert a.isdisjoint(b)


def test_bounded_replay_slice_is_a_prefix():
    """Bounding replay to N signals takes the first N in canonical order."""
    envs = real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")
    bounded = envs[:3]
    assert [e.payload["signal_name"] for e in bounded] == list(HR_SIGNAL_NAMES[:3])


def test_run_id_is_stable_per_as_of():
    envs = real_bundle_to_envelopes(_real_signals(), as_of_date="2026-06-14")
    assert all(e.run_id == "hr-bundle:2026-06-14" for e in envs)
