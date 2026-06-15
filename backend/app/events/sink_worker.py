"""Long-running observational sink worker (Phase 4).

Subscribes to the executions topic, runs each message through the existing
``sink.process_message`` (validate -> map -> write raw row to BigQuery ->
dead-letter on failure), and commits the offset only after the message is
durably handled. This is the durable consumer behind the Phase 3B round-trip
that ``broker_smoke.py`` proved one message at a time.

Guardrails (inherited from sink.py, restated because this is the GKE entrypoint):
  - OBSERVATIONAL ONLY: consume -> validate -> write raw row -> dead-letter.
  - NO Postgres writes. NO execution-status mutation. NO side effects. NO AI.
  - BigQuery is append-only and never an app read source.

Design for testability and ops:
  - The consumer is injected (``consumer_factory``), so tests drive the loop
    with a FakeConsumer and no broker.
  - Manual offset commit AFTER ``process_message`` returns — at-least-once
    delivery. The BQ ``insertId = idempotency_key`` dedup (sink.py) makes a
    redelivered message idempotent.
  - SIGTERM/SIGINT request a graceful drain: finish the in-flight message,
    commit, then stop. GKE sends SIGTERM on pod shutdown.
  - ``HealthState`` exposes liveness/readiness for k8s probes without binding
    a web framework: a tiny stdlib HTTP server (started by run_sink_worker.py).
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any, Protocol

from app.events import config
from app.events.sink import process_message

logger = logging.getLogger("app.events.sink_worker")


class _Message(Protocol):
    """The subset of confluent_kafka.Message the worker uses."""

    def error(self) -> Any | None: ...
    def value(self) -> bytes | None: ...
    def topic(self) -> str: ...
    def partition(self) -> int: ...
    def offset(self) -> int: ...


class _Consumer(Protocol):
    """The subset of confluent_kafka.Consumer the worker uses."""

    def subscribe(self, topics: list[str]) -> None: ...
    def poll(self, timeout: float) -> _Message | None: ...
    def commit(self, message: _Message | None = None, *, asynchronous: bool = True) -> Any: ...
    def close(self) -> None: ...


class HealthState:
    """Thread-safe liveness/readiness flags for k8s probes.

    - ``alive``: the worker process is running and its loop has not crashed.
    - ``ready``: the consumer has subscribed and is polling. Flipped to False
      during graceful shutdown so k8s stops routing/holding the pod ready.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._alive = True
        self._ready = False
        self.messages_processed = 0
        self.dead_letters = 0

    @property
    def alive(self) -> bool:
        with self._lock:
            return self._alive

    @property
    def ready(self) -> bool:
        with self._lock:
            return self._ready

    def set_ready(self, value: bool) -> None:
        with self._lock:
            self._ready = value

    def set_dead(self) -> None:
        with self._lock:
            self._alive = False
            self._ready = False

    def record(self, *, dead_letter: bool) -> None:
        with self._lock:
            self.messages_processed += 1
            if dead_letter:
                self.dead_letters += 1


def _default_consumer_factory() -> _Consumer:
    """Build a real confluent_kafka Consumer from env config (lazy import)."""
    from confluent_kafka import Consumer  # noqa: PLC0415

    return Consumer(config.consumer_config())


class SinkWorker:
    """Drains a Kafka topic into BigQuery via the observational sink.

    The loop is a plain method so a test can call ``run_once`` directly or run
    the full ``run`` with a FakeConsumer that yields a fixed message sequence
    then None.
    """

    def __init__(
        self,
        *,
        topics: list[str] | None = None,
        poll_timeout_s: float | None = None,
        consumer_factory: Callable[[], _Consumer] = _default_consumer_factory,
        health: HealthState | None = None,
        handler: Callable[[bytes], dict[str, Any]] = process_message,
    ) -> None:
        self.topics = topics or [
            t.strip() for t in config.EVENTS_CONSUMER_TOPICS.split(",") if t.strip()
        ]
        self.poll_timeout_s = (
            poll_timeout_s if poll_timeout_s is not None else config.EVENTS_CONSUMER_POLL_TIMEOUT_S
        )
        self._consumer_factory = consumer_factory
        self._handler = handler
        self.health = health or HealthState()
        self._stop = threading.Event()
        self._consumer: _Consumer | None = None

    def request_stop(self) -> None:
        """Ask the loop to drain and exit after the current message."""
        logger.info("sink_worker: stop requested, draining")
        self.health.set_ready(False)
        self._stop.set()

    def run_once(self, consumer: _Consumer) -> bool:
        """Poll once; process + commit if a message arrived.

        Returns True if a message was handled, False on poll timeout / no
        message. A handler exception is NOT swallowed here — process_message is
        designed to never raise (it dead-letters internally), so a raise means
        a genuine bug and should crash the pod (k8s restarts it) rather than
        commit past an unhandled message.
        """
        msg = consumer.poll(self.poll_timeout_s)
        if msg is None:
            return False

        err = msg.error()
        if err is not None:
            # Transient consumer error (e.g. partition EOF). Log, do not commit.
            logger.warning("sink_worker: consumer error: %s", err)
            return False

        value = msg.value()
        if value is None:
            logger.warning("sink_worker: empty message value, skipping (no commit)")
            return False

        result = self._handler(value)
        is_dead = result.get("status") == "dead_letter"
        self.health.record(dead_letter=is_dead)

        # Commit only AFTER the sink has handled the message (success OR
        # dead-letter — both are "durably handled"; a dead-lettered message is
        # not reprocessed). At-least-once: a crash before commit redelivers,
        # and the BQ insertId dedup makes that safe.
        consumer.commit(message=msg, asynchronous=False)

        logger.debug(
            "sink_worker: handled %s/%s@%s status=%s",
            msg.topic(), msg.partition(), msg.offset(), result.get("status"),
        )
        return True

    def run(self) -> None:
        """Subscribe and loop until stop is requested. Closes the consumer."""
        consumer = self._consumer_factory()
        self._consumer = consumer
        try:
            consumer.subscribe(self.topics)
            logger.info(
                "sink_worker: subscribed to %s group=%s offset_reset=%s",
                self.topics, config.EVENTS_CONSUMER_GROUP, config.EVENTS_CONSUMER_OFFSET_RESET,
            )
            self.health.set_ready(True)
            while not self._stop.is_set():
                self.run_once(consumer)
        except Exception:
            logger.exception("sink_worker: fatal loop error")
            self.health.set_dead()
            raise
        finally:
            self.health.set_ready(False)
            try:
                consumer.close()
            except Exception:
                logger.exception("sink_worker: error closing consumer")
            logger.info(
                "sink_worker: stopped (processed=%d dead_letters=%d)",
                self.health.messages_processed, self.health.dead_letters,
            )
