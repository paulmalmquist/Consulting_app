"""Tests for the HR synthetic stream adapter (PR 5, S2).

Acceptance is broker-less: the generator must be deterministic, cover all
eight signal keys, carry null reasons on injected gaps, fill the ring through
run_tick, and honestly report published=0 with the noop transport. Mode
handling fails closed to off.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.events.topics import hr_stream_topic
from app.services.hr_stream import config
from app.services.hr_stream.contracts import (
    SIGNAL_DOMAINS,
    HrSignalEvent,
    SignalQuality,
    idempotency_key,
)
from app.services.hr_stream.ring import get_ring, reset_ring
from app.services.hr_stream.synthetic import SyntheticGenerator, run_tick

NOW = datetime(2026, 6, 12, 14, 30, tzinfo=timezone.utc)
ALL_KEYS = set(SIGNAL_DOMAINS.keys())


@pytest.fixture(autouse=True)
def _clean_ring():
    reset_ring()
    yield
    reset_ring()


# ---------------------------------------------------------------- topics

def test_hr_stream_topic_shapes():
    assert hr_stream_topic("hr.dev", "signal", "macro") == "hr.dev.signal.macro.v1"
    assert hr_stream_topic("hr.prod", "alerts") == "hr.prod.alerts.v1"
    assert hr_stream_topic("hr.dev", "snapshots") == "hr.dev.snapshots.v1"
    with pytest.raises(ValueError):
        hr_stream_topic("hr.dev", "signal")
    with pytest.raises(ValueError):
        hr_stream_topic("hr.dev", "bogus")


def test_legacy_topic_constants_untouched():
    from app.events.topics import Topics
    assert Topics.HR_SIGNALS == "winston.hr.signals.v1"
    assert Topics.DEAD_LETTER == "winston.dead-letter.v1"


# ---------------------------------------------------------------- contracts

def test_null_value_requires_null_reason():
    with pytest.raises(ValueError):
        HrSignalEvent(
            source="synthetic", topic="hr.dev.signal.macro.v1",
            signal_key="yc_10y2y", domain="macro",
            observed_at=NOW, ingested_at=NOW, value=None,
            quality=SignalQuality(status="fresh"),
        )
    ok = HrSignalEvent(
        source="synthetic", topic="hr.dev.signal.macro.v1",
        signal_key="yc_10y2y", domain="macro",
        observed_at=NOW, ingested_at=NOW, value=None,
        quality=SignalQuality(status="missing", null_reason="gap"),
    )
    assert ok.quality.null_reason == "gap"


def test_idempotency_key_is_stable_and_distinct():
    a = idempotency_key("yc_10y2y", NOW, "synthetic")
    assert a == idempotency_key("yc_10y2y", NOW, "synthetic")
    assert a != idempotency_key("mvrv_z", NOW, "synthetic")
    assert a != idempotency_key("yc_10y2y", NOW, "replay")


# ---------------------------------------------------------------- generator

def test_generator_is_deterministic_per_seed():
    series_a = [e.model_dump(mode="json", exclude={"event_id"})
                for e in SyntheticGenerator(seed=42).generate_tick(NOW)]
    series_b = [e.model_dump(mode="json", exclude={"event_id"})
                for e in SyntheticGenerator(seed=42).generate_tick(NOW)]
    assert series_a == series_b
    series_c = [e.model_dump(mode="json", exclude={"event_id"})
                for e in SyntheticGenerator(seed=43).generate_tick(NOW)]
    assert series_a != series_c


def test_one_event_per_signal_key_per_tick():
    events = SyntheticGenerator(seed=7).generate_tick(NOW)
    assert sorted(e.signal_key for e in events) == sorted(ALL_KEYS)
    for e in events:
        assert e.domain == SIGNAL_DOMAINS[e.signal_key]
        assert e.topic == f"hr.dev.signal.{e.domain}.v1"


def test_numeric_events_carry_consistent_delta():
    gen = SyntheticGenerator(seed=11)
    gen.generate_tick(NOW)  # warm up so previous != profile start everywhere
    for e in gen.generate_tick(NOW):
        if e.signal_key == "fed_tone" or e.value is None:
            continue
        assert isinstance(e.value, float)
        assert e.previous_value is not None and e.delta is not None
        assert e.delta == pytest.approx(e.value - e.previous_value, abs=1e-6)


def test_gap_injection_carries_null_reason():
    gen = SyntheticGenerator(seed=3)
    gaps = [
        e
        for _ in range(40)
        for e in gen.generate_tick(NOW)
        if e.value is None
    ]
    assert gaps, "expected at least one injected gap across 40 ticks"
    for e in gaps:
        assert e.quality.status == "missing"
        assert e.quality.null_reason == "synthetic gap injection"


# ---------------------------------------------------------------- run_tick

def test_run_tick_fills_ring_and_reports_honest_publish_count(monkeypatch):
    # Default transport resolution (no broker) is the noop — but pin it so the
    # test cannot accidentally publish if a local Redpanda is running.
    import app.services.hr_stream.synthetic as synth
    monkeypatch.setattr(synth, "publish_event", lambda *a, **k: False)

    receipt = run_tick(SyntheticGenerator(seed=5), now=NOW)
    assert receipt["events"] == len(ALL_KEYS)
    assert receipt["published"] == 0  # noop transport: no silent success claim

    ring = get_ring()
    assert ring.size() == len(ALL_KEYS)
    latest = ring.latest_per_key()
    assert set(latest.keys()) == ALL_KEYS
    assert ring.latest_event_at() == NOW


def test_run_tick_counts_accepted_publishes(monkeypatch):
    import app.services.hr_stream.synthetic as synth
    monkeypatch.setattr(synth, "publish_event", lambda *a, **k: True)
    receipt = run_tick(SyntheticGenerator(seed=5), now=NOW)
    assert receipt["published"] == receipt["events"]


# ---------------------------------------------------------------- config

def test_stream_mode_defaults_off_and_fails_closed(monkeypatch):
    monkeypatch.delenv("HR_STREAM_MODE", raising=False)
    assert config.stream_mode() == "off"
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    assert config.stream_mode() == "synthetic"
    monkeypatch.setenv("HR_STREAM_MODE", "yolo")
    assert config.stream_mode() == "off"


def test_provider_defaults_confluent_and_fails_closed(monkeypatch):
    monkeypatch.delenv("HR_KAFKA_PROVIDER", raising=False)
    assert config.kafka_provider() == "confluent"
    monkeypatch.setenv("HR_KAFKA_PROVIDER", "google")
    assert config.kafka_provider() == "google"
    monkeypatch.setenv("HR_KAFKA_PROVIDER", "azure")
    assert config.kafka_provider() == "confluent"


def test_tick_interval_floors_at_one_second(monkeypatch):
    monkeypatch.setenv("HR_STREAM_SYNTHETIC_TICK_SECONDS", "0.01")
    assert config.synthetic_tick_seconds() == 1.0
    monkeypatch.setenv("HR_STREAM_SYNTHETIC_TICK_SECONDS", "garbage")
    assert config.synthetic_tick_seconds() == 5.0
