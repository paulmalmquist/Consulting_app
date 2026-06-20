"""Tests for the event-streaming backbone (Phase 1).

CI runs with NO broker, so every test asserts the fail-closed / no-op path
without a container. The two execution tests prove the publisher rides the
execution lifecycle best-effort and never changes the function's behavior.
"""

import json
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.events import EventEnvelope, Topics, publish_event
from app.events import transport as events_transport
from app.services import executions


class FakeBroker:
    """In-memory transport that records (topic, key, decoded-envelope) tuples.

    Modeled on conftest's FakeCursor: lets us assert what was offered to the bus
    with no real broker. With raises=True it simulates a flaky broker.
    """

    name = "fake"

    def __init__(self, raises: bool = False):
        self.sent: list[tuple[str, str | None, dict]] = []
        self.raises = raises

    def send(self, topic: str, key: str | None, value: bytes) -> bool:
        if self.raises:
            raise RuntimeError("broker down")
        self.sent.append((topic, key, json.loads(value)))
        return True


@pytest.fixture(autouse=True)
def _reset_transport():
    """Drop any cached transport so config patches take effect per test."""
    events_transport.reset_transport()
    yield
    events_transport.reset_transport()


# ── transport resolution / fail-closed ──────────────────────────────────────

def test_publisher_noop_when_disabled():
    with patch.object(events_transport.config, "EVENTS_ENABLED", False):
        assert events_transport.get_transport().name == "noop"
        env = _execution_envelope("execution.started")
        assert publish_event(Topics.EXECUTIONS, env) is False


def test_publisher_noop_when_no_broker_url():
    with patch.object(events_transport.config, "EVENTS_ENABLED", True), patch.object(
        events_transport.config, "EVENTS_BROKER_URL", ""
    ):
        assert events_transport.get_transport().name == "noop"


def test_publisher_never_raises_on_transport_error():
    broker = FakeBroker(raises=True)
    with patch.object(events_transport, "get_transport", lambda: broker):
        # A flaky broker must be swallowed — publish_event returns False, never raises.
        assert publish_event(Topics.EXECUTIONS, _execution_envelope("execution.completed")) is False


# ── envelope ─────────────────────────────────────────────────────────────────

def test_envelope_roundtrip():
    env = _execution_envelope("execution.completed")
    decoded = json.loads(env.to_wire())
    assert decoded["event_type"] == "execution.completed"
    assert decoded["schema_version"] == 1
    assert decoded["idempotency_key"].startswith("execution.completed:")
    # datetimes serialize to ISO strings
    assert isinstance(decoded["occurred_at"], str)
    assert isinstance(decoded["published_at"], str)


def test_envelope_optional_tenancy():
    # History Rhymes is single-tenant: business_id/env_id absent must be valid.
    env = EventEnvelope(
        event_type="hr.signal.observed",
        idempotency_key="hr.signal.observed:mvrv_z:2026-06-03",
        occurred_at=datetime.now(timezone.utc),
    )
    assert env.business_id is None
    assert env.env_id is None
    assert json.loads(env.to_wire())["business_id"] is None


# ── execution lifecycle wiring (no behavior change) ──────────────────────────

def test_run_execution_emits_lifecycle_best_effort(fake_cursor):
    broker = FakeBroker()
    fake_cursor.push_result([{"ok": 1}])                       # business exists check
    fake_cursor.push_result([{"execution_id": uuid4()}])       # INSERT ... RETURNING

    with patch.object(events_transport, "get_transport", lambda: broker):
        result = executions.run_execution(
            business_id=uuid4(),
            department_id=None,
            capability_id=None,
            inputs_json={"a": 1},
        )

    # Behavior unchanged.
    assert result["status"] == "completed"
    # Started, then completed, in order, for the same run.
    types = [e[2]["event_type"] for e in broker.sent]
    assert types == ["execution.started", "execution.completed"]
    run_ids = {e[2]["run_id"] for e in broker.sent}
    assert len(run_ids) == 1
    assert all(e[0] == Topics.EXECUTIONS for e in broker.sent)


def test_run_execution_still_completes_when_broker_down(fake_cursor):
    broker = FakeBroker(raises=True)
    fake_cursor.push_result([{"ok": 1}])
    fake_cursor.push_result([{"execution_id": uuid4()}])

    with patch.object(events_transport, "get_transport", lambda: broker):
        # A broker that raises on every send must not break the execution.
        result = executions.run_execution(
            business_id=uuid4(),
            department_id=None,
            capability_id=None,
            inputs_json={"a": 1},
        )
    assert result["status"] == "completed"


def test_run_execution_emits_failed_and_reraises(fake_cursor):
    broker = FakeBroker()
    fake_cursor.push_result([{"ok": 1}])                       # business exists check
    fake_cursor.push_result([{"execution_id": uuid4()}])       # INSERT ... RETURNING

    with patch.object(events_transport, "get_transport", lambda: broker):
        # RE_UNDERWRITE_RUN with no loan_id raises ValueError after the row exists.
        with pytest.raises(ValueError):
            executions.run_execution(
                business_id=uuid4(),
                department_id=None,
                capability_id=None,
                inputs_json={},
                execution_type="RE_UNDERWRITE_RUN",
            )

    types = [e[2]["event_type"] for e in broker.sent]
    assert types == ["execution.started", "execution.failed"]
    assert broker.sent[-1][2]["payload"]["error"] == "ValueError"


# ── helpers ──────────────────────────────────────────────────────────────────

def _execution_envelope(event_type: str) -> EventEnvelope:
    run_id = str(uuid4())
    return EventEnvelope(
        event_type=event_type,
        idempotency_key=f"{event_type}:{run_id}",
        occurred_at=datetime.now(timezone.utc),
        run_id=run_id,
    )
