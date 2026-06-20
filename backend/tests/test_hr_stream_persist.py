"""Tests for HR stream persistence layer (PR 12, S5).

Uses FakeCursor from conftest — no real DB required. Four test areas:
  1. Bronze idempotency: double-insert fires ON CONFLICT path
  2. Silver newer-only: older event does not overwrite current row
  3. Offset upsert: commit_offset writes and overwrites
  4. Health write/read: write_health fail-closed defaults
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.hr_stream.contracts import HrSignalEvent, SignalQuality
from app.services.hr_stream.persist import commit_offset, persist_event, write_health

NOW = datetime(2026, 6, 12, 16, 0, tzinfo=timezone.utc)
EARLIER = datetime(2026, 6, 12, 15, 0, tzinfo=timezone.utc)


def _event(
    key: str = "yc_10y2y",
    value: float = 0.5,
    observed_at: datetime = NOW,
) -> HrSignalEvent:
    return HrSignalEvent(
        source="synthetic",
        topic="hr.dev.signal.macro.v1",
        signal_key=key,
        domain="macro",
        observed_at=observed_at,
        ingested_at=NOW,
        value=value,
        quality=SignalQuality(status="fresh"),
    )


class FakeCursor:
    """Minimal cursor for persist tests — tracks execute calls and rowcount."""

    def __init__(self, rowcount: int = 1) -> None:
        self.calls: list[tuple[str, dict]] = []
        self.rowcount = rowcount

    def execute(self, sql: str, params=None) -> None:
        self.calls.append((sql.strip(), params or {}))

    @property
    def bronze_call(self) -> tuple[str, dict] | None:
        for sql, params in self.calls:
            if "hr_signal_events" in sql and "INSERT" in sql:
                return (sql, params)
        return None

    @property
    def silver_call(self) -> tuple[str, dict] | None:
        for sql, params in self.calls:
            if "hr_signal_latest" in sql and "INSERT" in sql:
                return (sql, params)
        return None


# ─────────────────────────────────────────────────────────── bronze idempotency


def test_persist_event_inserts_bronze_with_correct_params():
    ev = _event()
    cursor = FakeCursor(rowcount=1)
    result = persist_event(cursor, ev, mode="synthetic")

    assert result is True
    sql, params = cursor.bronze_call
    assert "ON CONFLICT (idempotency_key) DO NOTHING" in sql
    assert params["signal_key"] == "yc_10y2y"
    assert params["mode"] == "synthetic"
    assert params["value_numeric"] == pytest.approx(0.5)
    assert params["value_text"] is None


def test_persist_event_returns_false_on_duplicate():
    """rowcount==0 means ON CONFLICT fired — bronze already had this key."""
    ev = _event()
    cursor = FakeCursor(rowcount=0)
    result = persist_event(cursor, ev, mode="synthetic")

    assert result is False
    # Silver upsert must NOT run for a duplicate bronze row.
    assert cursor.silver_call is None


def test_double_insert_idempotent_no_silver_on_second():
    """Simulates: first insert (rowcount=1) then exact duplicate (rowcount=0)."""
    ev = _event()

    # First insert — new row
    c1 = FakeCursor(rowcount=1)
    r1 = persist_event(c1, ev, mode="synthetic")
    assert r1 is True
    assert c1.silver_call is not None  # silver ran

    # Second insert — duplicate
    c2 = FakeCursor(rowcount=0)
    r2 = persist_event(c2, ev, mode="synthetic")
    assert r2 is False
    assert c2.silver_call is None  # silver skipped


# ─────────────────────────────────────────────────────────── silver newer-only


def test_silver_upsert_uses_newer_only_where_clause():
    """The silver UPDATE path must include WHERE EXCLUDED.observed_at > hr_signal_latest.observed_at."""
    ev = _event(observed_at=NOW)
    cursor = FakeCursor(rowcount=1)
    persist_event(cursor, ev, mode="synthetic")

    _, (sql, _) = cursor.calls[0], cursor.silver_call  # ignore bronze
    assert "WHERE EXCLUDED.observed_at > hr_signal_latest.observed_at" in sql


def test_silver_upsert_passes_correct_observed_at():
    ev = _event(observed_at=NOW)
    cursor = FakeCursor(rowcount=1)
    persist_event(cursor, ev, mode="synthetic")

    _, params = cursor.silver_call
    assert params["observed_at"] == NOW


def test_older_event_silver_call_still_fires_but_db_enforces_guard():
    """persist_event always fires the silver upsert for a new bronze row —
    the WHERE guard is enforced by the DB engine, not by application code.
    The test verifies the WHERE clause is present in the SQL."""
    ev_older = _event(observed_at=EARLIER)
    cursor = FakeCursor(rowcount=1)
    persist_event(cursor, ev_older, mode="synthetic")

    _, (silver_sql, _) = cursor.calls[0], cursor.silver_call
    assert "WHERE EXCLUDED.observed_at > hr_signal_latest.observed_at" in silver_sql


# ─────────────────────────────────────────────────────────── string value path


def test_persist_event_string_value_maps_to_text_column():
    ev = HrSignalEvent(
        source="synthetic",
        topic="hr.dev.signal.sentiment.v1",
        signal_key="fed_tone",
        domain="sentiment",
        observed_at=NOW,
        ingested_at=NOW,
        value="hawkish",
        quality=SignalQuality(status="fresh"),
    )
    cursor = FakeCursor(rowcount=1)
    persist_event(cursor, ev, mode="synthetic")

    _, params = cursor.bronze_call
    assert params["value_text"] == "hawkish"
    assert params["value_numeric"] is None


# ─────────────────────────────────────────────────────────── null value path


def test_persist_event_null_value_requires_missing_quality():
    """HrSignalEvent validator enforces null value + missing status + null_reason."""
    ev = HrSignalEvent(
        source="synthetic",
        topic="hr.dev.signal.macro.v1",
        signal_key="yc_10y2y",
        domain="macro",
        observed_at=NOW,
        ingested_at=NOW,
        value=None,
        quality=SignalQuality(status="missing", null_reason="synthetic gap injection"),
    )
    cursor = FakeCursor(rowcount=1)
    result = persist_event(cursor, ev, mode="synthetic")

    assert result is True
    _, params = cursor.bronze_call
    assert params["value_numeric"] is None
    assert params["value_text"] is None


# ─────────────────────────────────────────────────────────── commit_offset


def test_commit_offset_writes_correct_params():
    cursor = FakeCursor()
    commit_offset(cursor, group="hr-cockpit-dev", topic="hr.dev.signal.macro.v1", partition=0, offset=42)

    assert len(cursor.calls) == 1
    sql, params = cursor.calls[0]
    assert "hr_stream_offsets" in sql
    assert "ON CONFLICT" in sql
    assert params["group"] == "hr-cockpit-dev"
    assert params["topic"] == "hr.dev.signal.macro.v1"
    assert params["partition"] == 0
    assert params["offset"] == 42


def test_commit_offset_upsert_updates_existing():
    """Second commit to same (group, topic, partition) uses ON CONFLICT ... DO UPDATE."""
    cursor = FakeCursor()
    commit_offset(cursor, "g", "t", 0, 10)
    commit_offset(cursor, "g", "t", 0, 20)

    assert len(cursor.calls) == 2
    for sql, _ in cursor.calls:
        assert "DO UPDATE" in sql


# ─────────────────────────────────────────────────────────── write_health


def test_write_health_sets_status_and_mode():
    cursor = FakeCursor()
    write_health(cursor, {"mode": "synthetic", "status": "connected", "degraded_reason": None})

    assert len(cursor.calls) == 1
    sql, params = cursor.calls[0]
    assert "hr_stream_health" in sql
    assert params["mode"] == "synthetic"
    assert params["status"] == "connected"
    assert params["degraded_reason"] is None


def test_write_health_fail_closed_on_missing_status():
    """Missing status in snapshot defaults to 'disconnected' — fail closed."""
    cursor = FakeCursor()
    write_health(cursor, {"mode": "live_kafka"})

    _, params = cursor.calls[0]
    assert params["status"] == "disconnected"


def test_write_health_ignores_unknown_keys():
    """Extra/unknown snapshot keys must not reach the SQL params."""
    cursor = FakeCursor()
    write_health(cursor, {
        "status": "connected",
        "secret_key": "must-not-appear",
        "bootstrap_servers": "also-hidden",
    })

    _, params = cursor.calls[0]
    assert "secret_key" not in params
    assert "bootstrap_servers" not in params


def test_write_health_null_status_defaults_to_disconnected():
    """Explicit None status should also fail-close to 'disconnected'."""
    cursor = FakeCursor()
    write_health(cursor, {"status": None, "mode": "replay"})

    _, params = cursor.calls[0]
    assert params["status"] == "disconnected"
