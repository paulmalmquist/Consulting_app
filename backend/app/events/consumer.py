"""Pluggable event consumer (History Rhymes stream spine, S4).

Mirrors ``transport.py``: the app depends on the ``ConsumerTransport``
interface, never a vendor SDK; the Kafka client is lazy-imported; anything
missing or broken resolves to ``NoopConsumer`` (fail closed). The provider
matrix keeps Confluent vs the Google branch a config difference, not a fork.

"google" deliberately means whatever GCP Kafka-compatible deployment is
configured — Google Cloud Managed Service for Apache Kafka, Confluent Cloud
on GCP, or another Kafka-compatible endpoint. Its SASL mechanism is whatever
``HR_KAFKA_SASL_MECHANISM`` says (confirmed against the real deployment
before live use); the interface is identical either way.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

from app.services.hr_stream import config as hr_config

logger = logging.getLogger("app.events.consumer")


@dataclass
class ConsumedEvent:
    topic: str
    partition: int
    offset: int
    key: str | None
    value: bytes
    headers: dict = field(default_factory=dict)


class ConsumerTransport(Protocol):
    name: str

    def subscribe(self, topics: list[str]) -> None: ...
    def poll(self, timeout_s: float) -> ConsumedEvent | None: ...
    def commit(self) -> None: ...
    def assignment_lag(self) -> int | None: ...
    def close(self) -> None: ...


class NoopConsumer:
    """Fail-closed consumer: subscribes to nothing, polls nothing."""

    name = "noop"

    def subscribe(self, topics: list[str]) -> None:  # noqa: ARG002
        return None

    def poll(self, timeout_s: float) -> ConsumedEvent | None:  # noqa: ARG002
        return None

    def commit(self) -> None:
        return None

    def assignment_lag(self) -> int | None:
        return None

    def close(self) -> None:
        return None


def build_consumer_config(
    provider: str,
    bootstrap: str,
    api_key: str,
    api_secret: str,
    sasl_mechanism: str,
    group_id: str,
) -> dict:
    """Provider -> confluent_kafka.Consumer config dict.

    Both branches authenticate with HR_KAFKA_API_KEY/SECRET over SASL_SSL;
    offsets are committed manually after successful handling (at-least-once,
    idempotent downstream via the bronze dedupe key).
    """
    base = {
        "bootstrap.servers": bootstrap,
        "group.id": group_id,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
        "security.protocol": "SASL_SSL",
        "sasl.username": api_key,
        "sasl.password": api_secret,
    }
    if provider == "confluent":
        base["sasl.mechanisms"] = "PLAIN"
    elif provider == "google":
        # GCP Kafka-compatible endpoints vary; the mechanism comes from config
        # and is verified against the actual deployment before live use.
        base["sasl.mechanisms"] = sasl_mechanism or "PLAIN"
    else:  # unknown provider: fail closed upstream (get_consumer returns noop)
        raise ValueError(f"unknown kafka provider: {provider!r}")
    return base


class KafkaConsumerTransport:
    """Kafka-wire consumer. Manual commits; bounded polls."""

    name = "kafka"

    def __init__(self, conf: dict) -> None:
        from confluent_kafka import Consumer  # lazy: optional dependency

        self._consumer = Consumer(conf)

    def subscribe(self, topics: list[str]) -> None:
        self._consumer.subscribe(topics)

    def poll(self, timeout_s: float) -> ConsumedEvent | None:
        msg = self._consumer.poll(timeout_s)
        if msg is None:
            return None
        if msg.error():
            logger.warning("kafka consumer poll error: %s", msg.error())
            return None
        key = msg.key()
        return ConsumedEvent(
            topic=msg.topic(),
            partition=msg.partition(),
            offset=msg.offset(),
            key=key.decode("utf-8", "replace") if key else None,
            value=msg.value() or b"",
        )

    def commit(self) -> None:
        self._consumer.commit(asynchronous=False)

    def assignment_lag(self) -> int | None:
        # Lag computation needs watermark queries per partition; deferred to
        # the runner (PR 13), which derives lag from event timestamps instead.
        return None

    def close(self) -> None:
        self._consumer.close()


_noop = NoopConsumer()
_kafka_singleton: KafkaConsumerTransport | None = None


def get_consumer() -> ConsumerTransport:
    """Resolve the active consumer from current HR stream config.

    Only live_kafka mode ever builds a real consumer; every failure path
    (mode mismatch, missing config, missing dependency, bad provider, init
    error) resolves to the noop consumer. The caller surfaces the degraded
    state through the health endpoint — this function never raises.
    """
    if hr_config.stream_mode() != "live_kafka":
        return _noop
    bootstrap = hr_config.kafka_bootstrap()
    api_key = hr_config.kafka_api_key()
    api_secret = hr_config.kafka_api_secret()
    if not bootstrap or not api_key or not api_secret:
        return _noop

    global _kafka_singleton
    if _kafka_singleton is None:
        try:
            conf = build_consumer_config(
                provider=hr_config.kafka_provider(),
                bootstrap=bootstrap,
                api_key=api_key,
                api_secret=api_secret,
                sasl_mechanism=hr_config.kafka_sasl_mechanism(),
                group_id=hr_config.consumer_group(),
            )
            _kafka_singleton = KafkaConsumerTransport(conf)
        except Exception:
            # confluent-kafka missing, bad provider, or init failure → fail closed.
            logger.warning("kafka consumer init failed; using noop", exc_info=True)
            return _noop
    return _kafka_singleton


def reset_consumer() -> None:
    """Drop the cached Kafka consumer (used by tests / config changes)."""
    global _kafka_singleton
    if _kafka_singleton is not None:
        try:
            _kafka_singleton.close()
        except Exception:
            pass
    _kafka_singleton = None
