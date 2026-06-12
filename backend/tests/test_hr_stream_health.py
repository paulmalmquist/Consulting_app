"""Tests for GET /api/hr/v1/stream/health (PR 6, S3).

Contract: never 500, never a secret in the payload, every status carries a
degraded_reason when it is not connected.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.routes.hr_stream import build_health
from app.services.hr_stream.contracts import HrSignalEvent, SignalQuality
from app.services.hr_stream.ring import get_ring, reset_ring

ALLOWED_FIELDS = {
    "mode", "provider", "status", "consumer_group", "topic_prefix",
    "latest_event_at", "lag_seconds", "degraded_reason",
}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    reset_ring()
    monkeypatch.delenv("HR_STREAM_MODE", raising=False)
    yield
    reset_ring()


def _ring_event(observed_at: datetime) -> HrSignalEvent:
    return HrSignalEvent(
        source="synthetic", topic="hr.dev.signal.macro.v1",
        signal_key="yc_10y2y", domain="macro",
        observed_at=observed_at, ingested_at=observed_at,
        value=0.5, quality=SignalQuality(status="fresh"),
    )


def test_mode_off_is_not_configured_not_an_error():
    payload = build_health()
    assert payload["status"] == "not_configured"
    assert payload["degraded_reason"] == "HR_STREAM_MODE=off"


def test_payload_is_allowlisted_no_secret_fields(monkeypatch):
    # Even with credentials configured, the payload never carries them.
    monkeypatch.setenv("HR_STREAM_MODE", "live_kafka")
    monkeypatch.setenv("HR_KAFKA_API_KEY", "sekret-key")
    monkeypatch.setenv("HR_KAFKA_API_SECRET", "sekret-value")
    monkeypatch.setenv("HR_KAFKA_BOOTSTRAP", "broker.example:9092")
    payload = build_health()
    assert set(payload.keys()) == ALLOWED_FIELDS
    blob = str(payload)
    assert "sekret" not in blob
    assert "broker.example" not in blob


def test_synthetic_empty_ring_is_disconnected_with_reason(monkeypatch):
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    payload = build_health()
    assert payload["status"] == "disconnected"
    assert "no events" in payload["degraded_reason"]


def test_synthetic_fresh_ring_is_connected(monkeypatch):
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    get_ring().append(_ring_event(datetime.now(timezone.utc)))
    payload = build_health()
    assert payload["status"] == "connected"
    assert payload["degraded_reason"] is None
    assert payload["latest_event_at"] is not None
    assert payload["lag_seconds"] is not None


def test_synthetic_stale_ring_is_delayed_with_reason(monkeypatch):
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    monkeypatch.setenv("HR_STREAM_SYNTHETIC_TICK_SECONDS", "5")
    get_ring().append(_ring_event(datetime.now(timezone.utc) - timedelta(seconds=120)))
    payload = build_health()
    assert payload["status"] == "delayed"
    assert "old" in payload["degraded_reason"]


@pytest.mark.parametrize("mode", ["replay", "live_kafka"])
def test_replay_live_fail_closed_when_db_unavailable(monkeypatch, mode):
    """Without a real DB (test env), replay/live must fail closed to disconnected
    with a clear degraded_reason — never 500, never blank."""
    monkeypatch.setenv("HR_STREAM_MODE", mode)
    payload = build_health()
    assert payload["status"] == "disconnected"
    # DB unavailable OR singleton missing — either is an honest fail-closed reason.
    reason = payload["degraded_reason"] or ""
    assert any(kw in reason for kw in ("db unavailable", "not reported", "singleton row")), reason
    if mode == "live_kafka":
        assert payload["provider"] in ("confluent", "google")


def test_route_never_500s_even_when_health_computation_raises(client, monkeypatch):
    import app.routes.hr_stream as hr_stream_module

    def boom():
        raise RuntimeError("computation exploded")

    monkeypatch.setattr(hr_stream_module, "build_health", boom)
    res = client.get("/api/hr/v1/stream/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "disconnected"
    assert "failed" in body["degraded_reason"]


def test_route_returns_health_payload(client, monkeypatch):
    monkeypatch.setenv("HR_STREAM_MODE", "synthetic")
    get_ring().append(_ring_event(datetime.now(timezone.utc)))
    res = client.get("/api/hr/v1/stream/health")
    assert res.status_code == 200
    assert res.json()["status"] == "connected"
