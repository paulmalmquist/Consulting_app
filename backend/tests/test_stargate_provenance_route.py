"""Stargate provenance read-route tests (Phase 7 T4).

The route is REAL (the UI button calls it, not a mock), but the durable sink that writes
tel_stream_kafka_rows is T2 / cloud-only and default OFF — so the route fails closed with two
DISTINCT, honest reasons the UI renders differently: durable_sink_not_enabled vs provenance_not_found.
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import patch

PARAMS = {
    "env_id": "telemetry-demo",
    "business_id": "00000000-0000-0000-0000-000000000001",
    "topic": "stargate.printer.telemetry.v1",
    "partition": 1,
    "offset": 519,
}


class _FakeTelCursor:
    """Minimal cursor: set_config executes without a fetch; the SELECT returns the queued row."""

    def __init__(self, row):
        self._row = row

    def execute(self, sql, params=None):
        return self

    def fetchone(self):
        return self._row


def _patched_cursor(row):
    @contextmanager
    def _cm():
        yield _FakeTelCursor(row)
    return patch("app.db.get_telemetry_cursor", _cm)


def test_durable_sink_disabled_is_a_distinct_honest_reason(client, monkeypatch):
    monkeypatch.delenv("STARGATE_DURABLE_SINK_ENABLED", raising=False)
    resp = client.get("/api/telemetry/stargate/provenance", params=PARAMS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["null_reason"] == "durable_sink_not_enabled"
    assert body["row"] is None


def test_sink_enabled_but_no_row_is_provenance_not_found(client, monkeypatch):
    monkeypatch.setenv("STARGATE_DURABLE_SINK_ENABLED", "1")
    with _patched_cursor(None):
        resp = client.get("/api/telemetry/stargate/provenance", params=PARAMS)
    assert resp.status_code == 404
    assert resp.json()["null_reason"] == "provenance_not_found"


def test_sink_enabled_with_row_returns_provenance(client, monkeypatch):
    monkeypatch.setenv("STARGATE_DURABLE_SINK_ENABLED", "1")
    row = {
        "record_kind": "anomaly",
        "kafka_topic": "stargate.printer.telemetry.v1",
        "kafka_partition": 1,
        "kafka_offset": 519,
        "schema_null_reason": "capture_mode_synthetic_schema_id",
        "printer_id": "stargate-v4-02",
        "print_job_id": "JOB-01-0001-COUPLED_DRIFT",
        "decoded_payload": {"melt_pool_temp_c": 1364.0, "arm_vibration_g": 0.11},
        "normalized_payload": None,
    }
    with _patched_cursor(row):
        resp = client.get("/api/telemetry/stargate/provenance", params=PARAMS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["null_reason"] is None
    assert body["row"]["printer_id"] == "stargate-v4-02"
    assert body["row"]["schema_null_reason"] == "capture_mode_synthetic_schema_id"
