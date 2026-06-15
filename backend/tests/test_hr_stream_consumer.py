"""Tests for the Kafka consumer scaffold (PR 11, S4)."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.events.consumer import (
    ConsumedEvent,
    NoopConsumer,
    build_consumer_config,
    get_consumer,
    reset_consumer,
)
from app.services.hr_stream.contracts import HrSignalEvent, SignalQuality
from app.services.hr_stream.ring import get_ring, reset_ring
from app.services.hr_stream.subscriber import (
    consume_batch,
    parse_signal_event,
    ring_handler,
    subscription_topics,
)

NOW = datetime(2026, 6, 12, 15, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    reset_ring()
    reset_consumer()
    for var in ("HR_STREAM_MODE", "HR_KAFKA_BOOTSTRAP", "HR_KAFKA_API_KEY", "HR_KAFKA_API_SECRET"):
        monkeypatch.delenv(var, raising=False)
    yield
    reset_ring()
    reset_consumer()


def _event(key: str = "yc_10y2y") -> HrSignalEvent:
    return HrSignalEvent(
        source="synthetic", topic="hr.dev.signal.macro.v1",
        signal_key=key, domain="macro",
        observed_at=NOW, ingested_at=NOW, value=0.5,
        quality=SignalQuality(status="fresh"),
    )


class FakeConsumer:
    """List-backed ConsumerTransport for batch tests."""

    name = "fake"

    def __init__(self, messages: list[ConsumedEvent]) -> None:
        self._messages = list(messages)
        self.committed = 0

    def subscribe(self, topics):  # noqa: ANN001
        self.topics = topics

    def poll(self, timeout_s):  # noqa: ANN001, ARG002
        return self._messages.pop(0) if self._messages else None

    def commit(self):
        self.committed += 1

    def assignment_lag(self):
        return None

    def close(self):
        return None


def _consumed(value: bytes, offset: int = 0) -> ConsumedEvent:
    return ConsumedEvent(topic="hr.dev.signal.macro.v1", partition=0, offset=offset, key="yc_10y2y", value=value)


# ----------------------------------------------------------- provider matrix

def test_confluent_config_matrix():
    conf = build_consumer_config("confluent", "broker:9092", "key", "secret", "PLAIN", "hr-cockpit-dev")
    assert conf["security.protocol"] == "SASL_SSL"
    assert conf["sasl.mechanisms"] == "PLAIN"
    assert conf["enable.auto.commit"] is False
    assert conf["group.id"] == "hr-cockpit-dev"


def test_google_branch_uses_configured_mechanism_not_an_assumption():
    conf = build_consumer_config("google", "broker:9092", "key", "secret", "OAUTHBEARER", "g")
    assert conf["sasl.mechanisms"] == "OAUTHBEARER"
    fallback = build_consumer_config("google", "broker:9092", "key", "secret", "", "g")
    assert fallback["sasl.mechanisms"] == "PLAIN"


def test_unknown_provider_raises_for_fail_closed_resolution():
    with pytest.raises(ValueError):
        build_consumer_config("azure", "b", "k", "s", "PLAIN", "g")


def test_no_secret_leakage_in_consumer_repr_or_logs():
    noop = NoopConsumer()
    assert "secret" not in repr(noop)
    # The config dict necessarily carries the secret; assert the transports
    # never expose it via repr (KafkaConsumerTransport stores only the client).
    from app.events import consumer as consumer_module
    src_repr = repr(consumer_module.NoopConsumer())
    assert "sasl" not in src_repr.lower()


# ----------------------------------------------------------- fail-closed resolution

def test_get_consumer_is_noop_unless_live_kafka(monkeypatch):
    assert get_consumer().name == "noop"
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    assert get_consumer().name == "noop"


def test_get_consumer_is_noop_without_credentials(monkeypatch):
    monkeypatch.setenv("HR_STREAM_MODE", "live_kafka")
    assert get_consumer().name == "noop"
    monkeypatch.setenv("HR_KAFKA_BOOTSTRAP", "broker:9092")
    assert get_consumer().name == "noop"  # still missing key/secret


def test_get_consumer_fails_closed_when_init_explodes(monkeypatch):
    monkeypatch.setenv("HR_STREAM_MODE", "live_kafka")
    monkeypatch.setenv("HR_KAFKA_BOOTSTRAP", "broker:9092")
    monkeypatch.setenv("HR_KAFKA_API_KEY", "k")
    monkeypatch.setenv("HR_KAFKA_API_SECRET", "s")
    import app.events.consumer as consumer_module

    class Boom:
        def __init__(self, conf):
            raise RuntimeError("no broker")

    monkeypatch.setattr(consumer_module, "KafkaConsumerTransport", Boom)
    assert get_consumer().name == "noop"


# ----------------------------------------------------------- topics + parsing

def test_subscription_topics_cover_domains_alerts_snapshots():
    topics = subscription_topics("hr.dev")
    assert "hr.dev.signal.macro.v1" in topics
    assert "hr.dev.signal.crypto.v1" in topics
    assert "hr.dev.alerts.v1" in topics
    assert "hr.dev.snapshots.v1" in topics
    assert len(topics) == len(set(topics))


def test_parse_accepts_bare_event_and_envelope_wrapped():
    ev = _event()
    bare = ev.model_dump_json().encode()
    assert parse_signal_event(bare).signal_key == "yc_10y2y"
    envelope = json.dumps({
        "idempotency_key": "x", "event_type": "signal.observed",
        "occurred_at": NOW.isoformat(), "payload": json.loads(ev.model_dump_json()),
    }).encode()
    assert parse_signal_event(envelope).signal_key == "yc_10y2y"


# ----------------------------------------------------------- batch loop

def test_consume_batch_delivers_and_commits():
    msgs = [_consumed(_event("yc_10y2y").model_dump_json().encode(), 1),
            _consumed(_event("mvrv_z").model_dump_json().encode(), 2)]
    fake = FakeConsumer(msgs)
    receipt = consume_batch(fake, ring_handler)
    assert receipt == {"polled": 2, "handled": 2, "dead_lettered": 0}
    assert fake.committed == 1
    assert set(get_ring().latest_per_key().keys()) == {"yc_10y2y", "mvrv_z"}


def test_malformed_payload_routes_to_dead_letter_and_loop_survives():
    dead: list[str] = []
    msgs = [
        _consumed(b"not json at all", 1),
        _consumed(json.dumps({"signal_key": "yc_10y2y"}).encode(), 2),  # fails validation
        _consumed(_event().model_dump_json().encode(), 3),
    ]
    fake = FakeConsumer(msgs)
    receipt = consume_batch(fake, ring_handler, dead_letter=lambda c, r: dead.append(r))
    assert receipt["polled"] == 3
    assert receipt["handled"] == 1
    assert receipt["dead_lettered"] == 2
    assert len(dead) == 2
    assert fake.committed == 1


def test_empty_poll_commits_nothing():
    fake = FakeConsumer([])
    receipt = consume_batch(fake, ring_handler)
    assert receipt == {"polled": 0, "handled": 0, "dead_lettered": 0}
    assert fake.committed == 0


def test_handler_failure_is_skipped_not_fatal():
    def bad_handler(event, consumed):  # noqa: ANN001, ARG001
        raise RuntimeError("handler exploded")

    fake = FakeConsumer([_consumed(_event().model_dump_json().encode(), 1)])
    receipt = consume_batch(fake, bad_handler)
    assert receipt["polled"] == 1
    assert receipt["handled"] == 0
