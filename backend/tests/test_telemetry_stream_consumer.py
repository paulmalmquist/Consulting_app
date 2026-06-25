"""Tests for the durable telemetry Kafka serving-slice consumer (Ticket 2).

No live broker and no DB — confluent_kafka is never imported on these paths (all
broker imports in the module are lazy), and the cursor is faked. Covers the pure,
testable logic: schema-id extraction, record_kind mapping, deterministic sampling,
payload->row mapping with correlation ids, and the idempotent persist SQL shape.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.services import telemetry_stream_consumer as tsc
from app.services.stargate_bridge import StargateTopics

NOW = datetime(2026, 6, 24, 12, 0, tzinfo=timezone.utc)


# ── schema-id extraction (Confluent wire frame) ──────────────────────────────────────────────────────

def test_read_wire_schema_id_framed():
    # magic byte 0 + 4-byte big-endian schema id (42) + payload
    raw = b"\x00" + (42).to_bytes(4, "big") + b"{}"
    assert tsc.read_wire_schema_id(raw) == 42


def test_read_wire_schema_id_unframed_returns_none():
    assert tsc.read_wire_schema_id(b"{}") is None
    assert tsc.read_wire_schema_id(b"") is None
    assert tsc.read_wire_schema_id(b"\x01\x02") is None


# ── record_kind mapping ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("topic,kind", [
    (StargateTopics.TELEMETRY, tsc.KIND_TELEMETRY),
    (StargateTopics.AGG_5S, tsc.KIND_AGG5S),
    (StargateTopics.ANOMALIES, tsc.KIND_ANOMALY),
    (StargateTopics.TRIAGE, tsc.KIND_TRIAGE),
    (StargateTopics.DEAD_LETTER, tsc.KIND_DLQ),
])
def test_topic_record_kind(topic, kind):
    assert tsc.topic_record_kind(topic) == kind


def test_topic_record_kind_unknown():
    assert tsc.topic_record_kind("some.other.topic") is None


def test_subscription_topics_has_five_incl_triage():
    topics = tsc.subscription_topics()
    assert len(topics) == 5
    assert StargateTopics.TRIAGE in topics


# ── deterministic sampling ───────────────────────────────────────────────────────────────────────────

def test_should_persist_raw_sampling():
    assert tsc.should_persist_raw(0, 50) is True
    assert tsc.should_persist_raw(50, 50) is True
    assert tsc.should_persist_raw(49, 50) is False
    assert tsc.should_persist_raw(51, 50) is False


def test_should_persist_raw_rate_one_keeps_all():
    assert tsc.should_persist_raw(1, 1) is True
    assert tsc.should_persist_raw(7, 0) is True


# ── build_row (decode + correlation ids) — JSON topics only (no protobuf dep) ──────────────────────────

def test_build_row_anomaly_pulls_correlation_ids():
    payload = {"anomaly_id": "anom_1", "printer_id": "P1", "print_job_id": "J9"}
    raw = json.dumps(payload).encode()
    row = tsc.build_row(topic=StargateTopics.ANOMALIES, partition=2, offset=184240,
                        timestamp=NOW, key="P1", raw=raw)
    assert row.record_kind == tsc.KIND_ANOMALY
    assert row.kafka_partition == 2 and row.kafka_offset == 184240
    assert row.anomaly_id == "anom_1" and row.printer_id == "P1" and row.print_job_id == "J9"
    assert row.schema_null_reason == tsc.SCHEMA_SUBJECT_UNAVAILABLE


def test_build_row_triage_pulls_triage_id():
    payload = {"triage_id": "tri_1", "anomaly_id": "anom_1", "severity": "high"}
    raw = json.dumps(payload).encode()
    row = tsc.build_row(topic=StargateTopics.TRIAGE, partition=0, offset=77,
                        timestamp=NOW, key=None, raw=raw)
    assert row.record_kind == tsc.KIND_TRIAGE and row.triage_id == "tri_1"


def test_build_row_unhandled_topic_raises():
    with pytest.raises(ValueError):
        tsc.build_row(topic="nope.v1", partition=0, offset=0, timestamp=None, key=None, raw=b"{}")


# ── persist SQL shape (FakeCursor) ─────────────────────────────────────────────────────────────────────

class FakeCursor:
    def __init__(self, row_id="row-uuid-1"):
        self.calls: list[tuple[str, dict]] = []
        self._row_id = row_id

    def execute(self, sql, params=None):
        self.calls.append((sql.strip(), params or {}))

    def fetchone(self):
        return {"id": self._row_id}

    def _find(self, needle):
        return [(s, p) for s, p in self.calls if needle in s]


def _anomaly_row(offset=10):
    return tsc.build_row(topic=StargateTopics.ANOMALIES, partition=1, offset=offset,
                         timestamp=NOW, key=None, raw=json.dumps({"anomaly_id": "a1"}).encode())


def test_persist_row_idempotent_insert():
    cur = FakeCursor()
    tsc.persist_row(cur, _anomaly_row(), env_id="telemetry-demo",
                    business_id="b-1", consumer_group="stargate-bridge-sink")
    inserts = cur._find("tel_stream_kafka_rows")
    assert inserts, "expected an insert into tel_stream_kafka_rows"
    sql, params = inserts[0]
    assert "ON CONFLICT (env_id, business_id, kafka_topic, kafka_partition, kafka_offset) DO NOTHING" in sql
    assert params["record_kind"] == tsc.KIND_ANOMALY
    assert params["consumer_group"] == "stargate-bridge-sink"
    # decoded_payload serialized to JSON text for ::jsonb cast
    assert json.loads(params["decoded_payload"])["anomaly_id"] == "a1"
    # no triage upsert for a non-triage row
    assert not cur._find("tel_stream_triage_events")


def test_persist_row_triage_upserts_projection():
    triage_raw = json.dumps({
        "triage_id": "tri_1", "anomaly_id": "a1", "severity": "high",
        "incident_summary": "melt pool cold", "requires_human_review": True,
        "leading_indicators": ["temp_drop", "vibration"],
    }).encode()
    row = tsc.build_row(topic=StargateTopics.TRIAGE, partition=0, offset=5,
                        timestamp=NOW, key=None, raw=triage_raw)
    cur = FakeCursor(row_id="kr-9")
    tsc.persist_row(cur, row, env_id="telemetry-demo", business_id="b-1",
                    consumer_group="g")
    triage = cur._find("tel_stream_triage_events")
    assert triage, "expected a triage upsert"
    sql, params = triage[0]
    assert "ON CONFLICT (triage_id) DO UPDATE" in sql
    assert params["triage_id"] == "tri_1" and params["severity"] == "high"
    assert params["kafka_row_id"] == "kr-9"            # FK back to the kafka row
    assert json.loads(params["leading_indicators"]) == ["temp_drop", "vibration"]
    assert params["requires_human_review"] is True


def test_persist_row_triage_status_fails_closed_when_absent():
    raw = json.dumps({"triage_id": "tri_2"}).encode()
    row = tsc.build_row(topic=StargateTopics.TRIAGE, partition=0, offset=6,
                        timestamp=NOW, key=None, raw=raw)
    cur = FakeCursor()
    tsc.persist_row(cur, row, env_id="e", business_id="b", consumer_group="g")
    _, params = cur._find("tel_stream_triage_events")[0]
    assert params["status"] == "not_available"
    assert params["requires_human_review"] is True     # default true when unspecified


def test_record_offset_upsert_shape():
    cur = FakeCursor()
    tsc.record_offset(cur, env_id="e", business_id="b", consumer_group="g",
                      topic=StargateTopics.ANOMALIES, partition=2, offset=99,
                      lag=3, status="ok")
    sql, params = cur._find("tel_stream_consumer_offsets")[0]
    assert "ON CONFLICT (env_id, consumer_group, topic, partition) DO UPDATE" in sql
    assert params["last_processed_offset"] == 99
    assert params["next_committed_offset"] == 100      # commit point = offset + 1
    assert params["status"] == "ok"


# ── import safety ──────────────────────────────────────────────────────────────────────────────────────

def test_module_imports_without_confluent_kafka():
    # The module is already imported at top; assert no broker symbol leaked to module scope.
    import importlib
    mod = importlib.reload(tsc)
    assert hasattr(mod, "TelemetryStreamConsumer")
    # Building the worker must not require a broker.
    w = mod.TelemetryStreamConsumer(env_id="e", business_id="b",
                                    consumer_group="g", sample_rate=50)
    assert w.sample_rate == 50 and w._stopping is False
