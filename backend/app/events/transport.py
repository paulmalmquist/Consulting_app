"""Pluggable event transport.

The app depends on this ``Transport`` interface, never a vendor SDK, so the
broker choice stays reversible (a Pub/Sub transport would be a drop-in). The
Kafka client is lazy-imported so it is an optional dependency: if it is missing
or the broker is unconfigured, ``get_transport`` falls back to ``NoopTransport``
and publishing becomes a silent, assertable no-op.
"""

from __future__ import annotations

from typing import Protocol

from app.events import config


class Transport(Protocol):
    name: str

    def send(self, topic: str, key: str | None, value: bytes) -> bool: ...


class NoopTransport:
    """Fail-closed transport. Does nothing, reports it published nothing."""

    name = "noop"

    def send(self, topic: str, key: str | None, value: bytes) -> bool:  # noqa: ARG002
        return False


class KafkaTransport:
    """Kafka-wire producer. Bounded, synchronous flush per send (best-effort)."""

    name = "kafka"

    def __init__(self, broker_url: str, timeout_ms: int) -> None:
        from confluent_kafka import Producer  # lazy: optional dependency

        producer_config = {"bootstrap.servers": broker_url}
        # SASL/SSL settings for a managed broker (Confluent Cloud). Empty for
        # local Redpanda, so the PLAINTEXT producer config is unchanged.
        producer_config.update(config.producer_security_config())
        self._producer = Producer(producer_config)
        self._timeout_s = max(timeout_ms, 0) / 1000.0

    def send(self, topic: str, key: str | None, value: bytes) -> bool:
        self._producer.produce(
            topic,
            key=key.encode("utf-8") if key else None,
            value=value,
        )
        # Bounded flush so a slow/unreachable broker cannot block the caller.
        self._producer.flush(self._timeout_s)
        return True


_noop = NoopTransport()
_kafka_singleton: KafkaTransport | None = None


def get_transport() -> Transport:
    """Resolve the active transport from current config.

    Reads config on every call (cheap) so tests can patch the config flags;
    the real Kafka producer is built once and cached.
    """
    if not config.EVENTS_ENABLED or config.EVENTS_TRANSPORT == "noop":
        return _noop
    if not config.EVENTS_BROKER_URL:
        return _noop

    global _kafka_singleton
    if _kafka_singleton is None:
        try:
            _kafka_singleton = KafkaTransport(
                config.EVENTS_BROKER_URL, config.EVENTS_PUBLISH_TIMEOUT_MS
            )
        except Exception:
            # confluent-kafka not installed, or producer init failed → fail closed.
            return _noop
    return _kafka_singleton


def reset_transport() -> None:
    """Drop the cached Kafka producer (used by tests / config changes)."""
    global _kafka_singleton
    _kafka_singleton = None
