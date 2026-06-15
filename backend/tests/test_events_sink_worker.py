"""Tests for the observational sink worker loop (Phase 4).

No broker, no BigQuery — a FakeConsumer drives the loop and a fake handler
stands in for sink.process_message. Asserts the at-least-once contract:
commit happens only after the message is handled, both success and dead-letter
count as handled, and a poll timeout / empty value never commits.
"""

from __future__ import annotations

import threading

from app.events.sink_worker import HealthState, SinkWorker


class FakeMessage:
    def __init__(self, value: bytes | None, *, err: object | None = None,
                 topic: str = "winston.executions.v1", partition: int = 0, offset: int = 0):
        self._value = value
        self._err = err
        self._topic = topic
        self._partition = partition
        self._offset = offset

    def error(self):
        return self._err

    def value(self):
        return self._value

    def topic(self):
        return self._topic

    def partition(self):
        return self._partition

    def offset(self):
        return self._offset


class FakeConsumer:
    """Yields a fixed message sequence, then None forever. Records commits."""

    def __init__(self, messages):
        self._messages = list(messages)
        self.subscribed: list[str] | None = None
        self.committed: list[FakeMessage] = []
        self.closed = False

    def subscribe(self, topics):
        self.subscribed = list(topics)

    def poll(self, timeout):  # noqa: ARG002
        if self._messages:
            return self._messages.pop(0)
        return None

    def commit(self, message=None, *, asynchronous=True):  # noqa: ARG002
        self.committed.append(message)

    def close(self):
        self.closed = True


def _ok_handler(_value: bytes) -> dict:
    return {"status": "ok", "event_type": "execution.completed"}


def _dead_handler(_value: bytes) -> dict:
    return {"status": "dead_letter", "reason": "boom"}


# ── run_once: commit semantics ───────────────────────────────────────────────

def test_run_once_commits_after_successful_handle():
    consumer = FakeConsumer([FakeMessage(b'{"e":1}', offset=7)])
    worker = SinkWorker(topics=["t"], handler=_ok_handler, health=HealthState())

    handled = worker.run_once(consumer)

    assert handled is True
    assert len(consumer.committed) == 1
    assert consumer.committed[0].offset() == 7
    assert worker.health.messages_processed == 1
    assert worker.health.dead_letters == 0


def test_run_once_commits_on_dead_letter():
    """A dead-lettered message is 'durably handled' — commit so it isn't reprocessed."""
    consumer = FakeConsumer([FakeMessage(b"garbage")])
    worker = SinkWorker(topics=["t"], handler=_dead_handler, health=HealthState())

    handled = worker.run_once(consumer)

    assert handled is True
    assert len(consumer.committed) == 1
    assert worker.health.dead_letters == 1


def test_run_once_no_message_does_not_commit():
    consumer = FakeConsumer([])  # poll returns None
    worker = SinkWorker(topics=["t"], handler=_ok_handler, health=HealthState())

    handled = worker.run_once(consumer)

    assert handled is False
    assert consumer.committed == []


def test_run_once_consumer_error_does_not_commit():
    consumer = FakeConsumer([FakeMessage(b'{"e":1}', err=object())])
    worker = SinkWorker(topics=["t"], handler=_ok_handler, health=HealthState())

    handled = worker.run_once(consumer)

    assert handled is False
    assert consumer.committed == []


def test_run_once_empty_value_does_not_commit():
    consumer = FakeConsumer([FakeMessage(None)])
    worker = SinkWorker(topics=["t"], handler=_ok_handler, health=HealthState())

    handled = worker.run_once(consumer)

    assert handled is False
    assert consumer.committed == []


def test_handler_exception_propagates_without_commit():
    """process_message is contracted to never raise; if it does, crash (no commit)."""
    def _boom(_v):
        raise RuntimeError("unexpected")

    consumer = FakeConsumer([FakeMessage(b'{"e":1}')])
    worker = SinkWorker(topics=["t"], handler=_boom, health=HealthState())

    try:
        worker.run_once(consumer)
        raised = False
    except RuntimeError:
        raised = True

    assert raised is True
    assert consumer.committed == []  # never commit past an unhandled message


# ── run: full loop + graceful stop ───────────────────────────────────────────

def test_run_drains_messages_then_stops():
    messages = [FakeMessage(b'{"e":%d}' % i, offset=i) for i in range(3)]
    consumer = FakeConsumer(messages)
    worker = SinkWorker(topics=["winston.executions.v1"], handler=_ok_handler,
                        consumer_factory=lambda: consumer, health=HealthState())

    # Stop the loop once the three messages are drained (poll then returns None).
    def _watch():
        while worker.health.messages_processed < 3:
            pass
        worker.request_stop()

    t = threading.Thread(target=_watch)
    t.start()
    worker.run()
    t.join(timeout=5)

    assert consumer.subscribed == ["winston.executions.v1"]
    assert len(consumer.committed) == 3
    assert worker.health.messages_processed == 3
    assert consumer.closed is True
    assert worker.health.ready is False  # readiness dropped on shutdown


def test_run_sets_ready_then_clears_on_stop():
    consumer = FakeConsumer([])
    worker = SinkWorker(topics=["t"], handler=_ok_handler,
                        consumer_factory=lambda: consumer, health=HealthState())
    # Pre-stop so run() subscribes, sets ready, then exits the loop immediately.
    worker.request_stop()
    worker.run()

    assert consumer.subscribed == ["t"]
    assert consumer.closed is True
    assert worker.health.ready is False


def test_health_state_transitions():
    h = HealthState()
    assert h.alive is True
    assert h.ready is False
    h.set_ready(True)
    assert h.ready is True
    h.set_dead()
    assert h.alive is False
    assert h.ready is False
