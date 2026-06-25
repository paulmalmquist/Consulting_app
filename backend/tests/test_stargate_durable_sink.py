"""Stargate durable sink (Phase 7 T2) — the capture-mode bridge sink API + the gated bridge hook.

Covers the kwargs sink API added to telemetry_stream_consumer (persist_kafka_row / commit_stream_offset /
get_kafka_row_by_coords / tail_kafka_rows / make_provenance) and the bridge's gated, best-effort hook.
No broker, no real DB — a recording fake cursor + monkeypatched get_telemetry_cursor.
"""

from __future__ import annotations

from contextlib import contextmanager

from app.services import stargate_bridge as core
from app.services import telemetry_stream_consumer as sink


class FakeCur:
    """Records executed SQL; returns canned fetch results."""

    def __init__(self, row=None, rows=None):
        self.queries: list[tuple[str, object]] = []
        self._row = row
        self._rows = rows or []

    def execute(self, sql, params=None):
        self.queries.append((sql, params))
        return self

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows

    def sql_blob(self) -> str:
        return " ".join(q for q, _ in self.queries)


# ── provenance synthesis ──────────────────────────────────────────────────────────────────────────────
class TestMakeProvenance:
    def test_capture_is_deterministic_and_labeled_synthetic(self):
        rec = {"printer_id": "stargate-v4-02", "capture_id": "cap-x", "kafka_offset": 7}
        p1 = sink.make_provenance("capture", rec)
        p2 = sink.make_provenance("capture", dict(rec))
        assert p1 == p2
        assert p1["synthetic"] is True
        assert p1["provenance_source"] == "recorded_capture"
        assert p1["schema_id"] is None
        assert p1["schema_null_reason"] == "capture_mode_synthetic_schema_id"
        assert 0 <= p1["kafka_partition"] < 6
        assert p1["kafka_offset"] == 7
        assert p1["capture_id"] == "cap-x"

    def test_broker_preserves_real_topic_partition_offset_and_schema(self):
        rec = {"printer_id": "stargate-v4-02", "kafka_topic": "stargate.printer.telemetry.v1",
               "kafka_partition": 3, "kafka_offset": 18482931, "schema_id": 42,
               "schema_subject": "stargate.printer.telemetry.v1-value", "schema_version": 2,
               "schema_type": "PROTOBUF"}
        p = sink.make_provenance("cloud", rec)
        assert p["synthetic"] is False
        assert p["provenance_source"] == "confluent_cloud"
        assert p["kafka_partition"] == 3 and p["kafka_offset"] == 18482931
        assert p["schema_id"] == 42 and p["schema_subject"] == "stargate.printer.telemetry.v1-value"
        assert p["schema_version"] == 2 and p["schema_type"] == "PROTOBUF"
        assert p["schema_null_reason"] is None


# ── raw sampling ──────────────────────────────────────────────────────────────────────────────────────
class TestRawSampling:
    def test_one_in_n(self):
        assert sink.should_persist_raw(0, 20) is True
        assert sink.should_persist_raw(20, 20) is True
        assert sink.should_persist_raw(1, 20) is False
        assert sink.should_persist_raw(19, 20) is False
        assert sink.should_persist_raw(5, 1) is True   # N<=1 keeps every raw row


# ── SQL shape (idempotency / GUC / filters) ─────────────────────────────────────────────────────────────
class TestSinkSql:
    def test_persist_kafka_row_is_idempotent_and_sets_the_guc(self):
        cur = FakeCur()
        prov = sink.make_provenance("capture", {"printer_id": "stargate-v4-02", "capture_id": "cap",
                                                 "kafka_offset": 40, "kafka_topic": "stargate.printer.anomalies.v1"})
        sink.persist_kafka_row(cur, env_id="telemetry-demo", business_id="b", record_kind="anomaly",
                               provenance=prov, decoded_payload={"x": 1},
                               normalized_payload={"scorer": {"verdict": "NO_GO"}}, printer_id="stargate-v4-02")
        inserts = [q for q, _ in cur.queries if "INSERT INTO tel_stream_kafka_rows" in q]
        assert inserts, "no insert issued"
        assert ("ON CONFLICT (env_id, business_id, kafka_topic, kafka_partition, kafka_offset) DO NOTHING"
                in inserts[0])
        assert "set_config('app.env_id'" in cur.sql_blob()

    def test_synthetic_schema_id_sentinel_is_written_with_null_reason(self):
        cur = FakeCur()
        prov = sink.make_provenance("capture", {"printer_id": "p", "kafka_offset": 1})
        sink.persist_kafka_row(cur, env_id="e", business_id="b", record_kind="anomaly",
                               provenance=prov, decoded_payload={}, printer_id="p")
        params = [p for q, p in cur.queries if "INSERT INTO tel_stream_kafka_rows" in q][0]
        assert params["schema_id"] == sink.SYNTHETIC_SCHEMA_ID
        assert params["schema_null_reason"] == "capture_mode_synthetic_schema_id"
        assert params["databricks_null_reason"] == "databricks_table_mapping_not_configured"

    def test_commit_stream_offset_upserts_next_offset(self):
        cur = FakeCur()
        sink.commit_stream_offset(cur, env_id="e", business_id="b", topic="t", partition=1, last_offset=99)
        blob = cur.sql_blob()
        assert "tel_stream_consumer_offsets" in blob and "ON CONFLICT" in blob

    def test_get_kafka_row_by_coords_sets_guc_and_returns_row(self):
        cur = FakeCur(row={"printer_id": "stargate-v4-02", "record_kind": "anomaly"})
        row = sink.get_kafka_row_by_coords(cur, env_id="e", business_id="b", topic="t", partition=1, offset=2)
        assert row["printer_id"] == "stargate-v4-02"
        assert "set_config('app.env_id'" in cur.sql_blob()

    def test_tail_kafka_rows_filters_by_kind(self):
        cur = FakeCur(rows=[{"record_kind": "anomaly"}])
        rows = sink.tail_kafka_rows(cur, env_id="e", business_id="b", record_kind="anomaly", limit=10)
        assert rows and rows[0]["record_kind"] == "anomaly"
        select = [q for q, _ in cur.queries if "FROM tel_stream_kafka_rows" in q][0]
        assert "record_kind = %s" in select


# ── bridge hook (gated, best-effort, sampled) ───────────────────────────────────────────────────────────
def _anomalous_record(printer="stargate-v4-02"):
    return {"printer_id": printer, "ts_us": 1_700_000_000_000_000, "layer": 1, "print_job_id": "JOB",
            "x": 0.0, "y": 0.0, "z": 0.0, "melt_pool_temp_c": 1364.0,
            "deposition_rate_kg_hr": 24.0, "arm_vibration_g": 0.11, "capture_id": "cap"}


def _nominal_record(printer="p", ts=0):
    return {"printer_id": printer, "ts_us": ts, "layer": 0, "print_job_id": "j",
            "x": 0.0, "y": 0.0, "z": 0.0, "melt_pool_temp_c": 1500.0,
            "deposition_rate_kg_hr": 24.0, "arm_vibration_g": 0.02, "capture_id": "c"}


@contextmanager
def _yield_cursor(cur):
    yield cur


class TestBridgeHook:
    def test_flag_off_never_touches_the_db(self, monkeypatch):
        monkeypatch.delenv("STARGATE_DURABLE_SINK_ENABLED", raising=False)
        import app.db as db
        monkeypatch.setattr(db, "get_telemetry_cursor",
                            lambda *a, **k: (_ for _ in ()).throw(AssertionError("DB must not be touched")))
        state = core.BridgeState("capture")
        state.ingest_telemetry(_anomalous_record(), emulate_flink=True, now_ms=1)
        assert state.rings["anomalies"].tail(5), "anomaly still recorded without the sink"

    def test_flag_on_persists_an_anomaly_row_on_the_anomalies_topic(self, monkeypatch):
        monkeypatch.setenv("STARGATE_DURABLE_SINK_ENABLED", "1")
        calls: list[dict] = []
        monkeypatch.setattr(sink, "persist_kafka_row", lambda cur, **kw: calls.append(kw))
        import app.db as db
        monkeypatch.setattr(db, "get_telemetry_cursor", lambda: _yield_cursor(object()))
        state = core.BridgeState("capture")
        state.ingest_telemetry(_anomalous_record(), emulate_flink=True, now_ms=1)
        kinds = [c["record_kind"] for c in calls]
        assert "anomaly" in kinds
        anomaly = next(c for c in calls if c["record_kind"] == "anomaly")
        assert anomaly["provenance"]["kafka_topic"] == "stargate.printer.anomalies.v1"
        assert anomaly["normalized_payload"]["scorer"]["name"].startswith("baseline scorer")

    def test_db_failure_does_not_break_the_hot_path(self, monkeypatch):
        monkeypatch.setenv("STARGATE_DURABLE_SINK_ENABLED", "1")
        import app.db as db
        def boom():
            raise RuntimeError("db down")
        monkeypatch.setattr(db, "get_telemetry_cursor", boom)
        state = core.BridgeState("capture")
        state.ingest_telemetry(_anomalous_record(), emulate_flink=True, now_ms=1)  # must NOT raise
        assert state.rings["anomalies"].tail(5), "SSE state intact despite the durable write failing"

    def test_raw_is_sampled_but_anomaly_persists_in_full(self, monkeypatch):
        monkeypatch.setenv("STARGATE_DURABLE_SINK_ENABLED", "1")
        monkeypatch.setenv("STARGATE_SINK_SAMPLE_N", "5")
        kinds: list[str] = []
        monkeypatch.setattr(sink, "persist_kafka_row", lambda cur, **kw: kinds.append(kw["record_kind"]))
        import app.db as db
        monkeypatch.setattr(db, "get_telemetry_cursor", lambda: _yield_cursor(object()))
        state = core.BridgeState("capture")
        # five nominal points for one printer -> telemetry offsets 0..4; only offset 0 is sampled.
        for i in range(5):
            state.ingest_telemetry(_nominal_record(ts=i * 100_000), emulate_flink=False, now_ms=i * 100)
        assert kinds.count("telemetry_sample") == 1, "raw telemetry must be sampled 1-in-N"
        # one anomalous point -> persisted in full regardless of sampling
        state.ingest_telemetry(_anomalous_record("stargate-v4-09"), emulate_flink=False, now_ms=999)
        assert "anomaly" in kinds
