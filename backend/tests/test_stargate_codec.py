"""Stargate codec + anomaly-predicate tests (PR 3).

The pure-Python pieces (signal maps, predicate, tumbling aggregator) always run
— including in backend CI, which does not install confluent-kafka/protobuf.
Wire-format round-trips skip cleanly when the optional clients are absent and
run in the stargate tooling venv, where the checkpoint evidence is captured.
"""

from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

import pytest

_STARGATE = Path(__file__).resolve().parents[2] / "scripts" / "streaming" / "stargate"
if str(_STARGATE) not in sys.path:
    sys.path.insert(0, str(_STARGATE))

import signal_mapping as sm  # noqa: E402


class TestAnomalyPredicate:
    def test_truth_table(self):
        # (temp_c, vibration_g, expected) — anomaly requires BOTH conditions.
        cases = [
            (1500.0, 0.02, False),   # nominal
            (1399.9, 0.02, False),   # cold pool alone is not an anomaly
            (1500.0, 0.09, False),   # vibration alone is not an anomaly
            (1399.9, 0.081, True),   # both -> structural-flaw signature
            (1400.0, 0.09, False),   # boundary: temp must be strictly below
            (1399.0, 0.08, False),   # boundary: vibration must be strictly above
        ]
        for temp, vib, expected in cases:
            assert sm.is_anomalous(temp, vib) is expected, (temp, vib)

    def test_thresholds_are_the_demo_constants(self):
        assert sm.TEMP_THRESHOLD_C == 1400.0
        assert sm.VIBRATION_THRESHOLD_G == 0.08


class TestSignalMaps:
    def test_nominal_levels_map_to_nominal_units(self):
        # At the waveform baselines the mapped values sit in the nominal bands.
        assert abs(sm.melt_pool_temp_c(450.0) - 1500.0) < 1e-9
        assert abs(sm.arm_vibration_g(2.0) - 0.02) < 1e-9
        assert abs(sm.deposition_rate_kg_hr(120.0) - 24.0) < 1e-9

    def test_rising_raw_temperature_reads_as_melt_pool_drop(self):
        assert sm.melt_pool_temp_c(500.0) < sm.melt_pool_temp_c(450.0)

    def test_vibration_floor_never_goes_negative(self):
        assert sm.arm_vibration_g(0.0) == pytest.approx(sm.VIBRATION_FLOOR_G)


class TestDerivedFeatures:
    """The shared toolpath_speed / acceleration / temp_slope helpers — one definition
    used by the producer, the capture fixture, and the bridge so they never drift."""

    def test_toolpath_speed_is_distance_over_dt(self):
        # (0,0,0) -> (3,4,0) is 5 mm; over 0.1 s that is 50 mm/s.
        assert sm.toolpath_speed_mm_s(0.0, 0.0, 0.0, 3.0, 4.0, 0.0, 0.1) == pytest.approx(50.0)

    def test_toolpath_speed_zero_when_dt_non_positive(self):
        assert sm.toolpath_speed_mm_s(0.0, 0.0, 0.0, 3.0, 4.0, 0.0, 0.0) == 0.0
        assert sm.toolpath_speed_mm_s(0.0, 0.0, 0.0, 3.0, 4.0, 0.0, -1.0) == 0.0

    def test_acceleration_is_delta_speed_over_dt(self):
        assert sm.acceleration_mm_s2(10.0, 14.0, 0.1) == pytest.approx(40.0)
        assert sm.acceleration_mm_s2(10.0, 14.0, 0.0) == 0.0

    def test_temp_slope_reads_negative_for_a_falling_melt_pool(self):
        # 1500 -> 1460 across a 3-sample (0.2 s) window: -40 / 0.2 = -200 degC/s.
        assert sm.temp_slope_c_per_s([1500.0, 1480.0, 1460.0], 0.1) == pytest.approx(-200.0)

    def test_temp_slope_zero_when_window_too_short(self):
        assert sm.temp_slope_c_per_s([1500.0], 0.1) == 0.0
        assert sm.temp_slope_c_per_s([], 0.1) == 0.0
        assert sm.temp_slope_c_per_s([1500.0, 1490.0], 0.0) == 0.0


class TestBaselineScorer:
    """The bridge's pure rolling-MAD baseline scorer — a re-expression of the frozen champion so the
    import-pure bridge can score live. It is a BASELINE (rolling-MAD residual), never an LSTM."""

    def test_verdict_bands(self):
        assert sm.baseline_verdict(None) == "GO"
        assert sm.baseline_verdict(0.5) == "GO"
        assert sm.baseline_verdict(0.999) == "GO"
        assert sm.baseline_verdict(1.0) == "REVIEW"
        assert sm.baseline_verdict(2.0) == "REVIEW"
        assert sm.baseline_verdict(2.0001) == "NO_GO"

    def test_short_window_fails_closed(self):
        result = sm.score_baseline([1500.0] * (sm.BASELINE_MIN_WINDOW - 1))
        assert result["model_not_configured"] is True
        assert result["null_reason"] == "insufficient_window"
        assert result["score"] is None and result["verdict"] is None

    def test_flat_window_scores_go(self):
        result = sm.score_baseline([1500.0] * 60)
        assert result["model_not_configured"] is False
        assert result["verdict"] == "GO"
        assert result["score"] == pytest.approx(0.0, abs=1e-6)

    def test_constants_and_bands_lock_to_serving_champion(self):
        # The bridge scorer MUST stay equal to the DB-coupled champion in telemetry_serving — they are
        # two spellings of one rule. This is the same lock pattern as the Flink/python predicate lock.
        from app.services import telemetry_serving as ts
        assert sm.BASELINE_MAD_K == ts.MAD_K
        assert sm.BASELINE_GLOBAL_TRAIN_SCALE == ts.GLOBAL_TRAIN_SCALE
        for score in (None, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 10.0):
            assert sm.baseline_verdict(score) == ts._verdict_for(score)

    def test_normalization_matches_live_etl_path(self):
        # score_baseline must produce the SAME score as the live ETL: normalize_window -> rolling_mean
        # -> peak residual / (MAD_K * GLOBAL_TRAIN_SCALE). Lock the math, not just the constants.
        from app.services import telemetry_serving as ts
        from app.services import telemetry_stream_etl as etl

        values = [1500.0] * 40 + [1203.0] + [1500.0] * 19   # an excursion the rolling-MAD catches
        norm = etl.normalize_window(values)
        rmeans = etl.rolling_mean(norm)
        peak = max(abs(n - m) for n, m in zip(norm, rmeans))
        expected = round(peak / (ts.MAD_K * ts.GLOBAL_TRAIN_SCALE), 6)
        got = sm.score_baseline(values)
        assert got["score"] == pytest.approx(expected)
        assert got["verdict"] == ts._verdict_for(expected)


class TestMultiWindowFeatures:
    def _pts(self, base_us, temps, vibs):
        return [{"ts_us": base_us + i * 100_000, "melt_pool_temp_c": t, "arm_vibration_g": v}
                for i, (t, v) in enumerate(zip(temps, vibs))]

    def test_windows_compute_avg_max_and_slopes(self):
        agg = sm.MultiWindowAggregator()
        base = 1_700_000_000_000_000
        # 60 points at 100ms = 6s span -> 5s window holds the tail, 60s window holds all.
        temps = [1500.0 - i for i in range(60)]      # falling melt pool -> negative temp slope
        vibs = [0.02 + 0.001 * i for i in range(60)]  # rising vibration -> positive vib slope
        pts = self._pts(base, temps, vibs)
        feats = agg.features(pts, now_us=base + 59 * 100_000)
        assert set(feats) == {"w5s", "w15s", "w60s"}
        assert feats["w60s"]["n"] == 60
        assert feats["w60s"]["temp_slope_c_per_s"] < 0
        assert feats["w60s"]["vib_slope_g_per_s"] > 0
        assert feats["w5s"]["n"] < feats["w60s"]["n"]   # 5s window is a strict subset
        assert feats["w60s"]["max_vib_g"] == pytest.approx(max(vibs), abs=1e-5)

    def test_empty_window_is_null_not_fabricated(self):
        agg = sm.MultiWindowAggregator()
        feats = agg.features([], now_us=1_700_000_000_000_000)
        assert feats["w5s"] == {"n": 0, "avg_temp_c": None, "max_vib_g": None,
                                "temp_slope_c_per_s": None, "vib_slope_g_per_s": None}


class TestProvenanceSynthesis:
    def test_synthetic_partition_is_stable_and_in_range(self):
        # Deterministic (NOT Python's salted hash) so two cold starts and the durable sink agree.
        p = sm.synthetic_partition("stargate-v4-02")
        assert 0 <= p < sm.STARGATE_PARTITION_COUNT
        assert sm.synthetic_partition("stargate-v4-02") == p


class TestTumblingAggregator:
    def test_windows_close_in_order_with_avg_and_max(self):
        agg = sm.TumblingAggregator(window_ms=5000)
        base_us = 1_700_000_000_000 * 1000
        agg.add("p1", base_us, 1500.0, 0.02)
        agg.add("p1", base_us + 1_000_000, 1400.0, 0.05)
        agg.add("p1", base_us + 6_000_000, 1480.0, 0.03)  # next window
        rows = agg.flush_closed(1_700_000_000_000 + 5000)
        assert len(rows) == 1
        assert rows[0]["avg_temp_c"] == pytest.approx(1450.0)
        assert rows[0]["max_vibration_g"] == pytest.approx(0.05)
        assert rows[0]["n"] == 2
        rows2 = agg.flush_closed(1_700_000_000_000 + 20_000)
        assert len(rows2) == 1
        assert rows2[0]["n"] == 1


class TestFlinkSqlLock:
    """The Flink anomaly route and signal_mapping.is_anomalous are two
    spellings of one predicate. Parse the checked-in SQL and fail if the
    constants ever drift apart (PR 4)."""

    FLINK_SQL = (
        Path(__file__).resolve().parents[2]
        / "infra" / "confluent" / "stargate" / "flink" / "02_anomaly_route.sql"
    )

    def test_sql_constants_match_python_predicate(self):
        import re

        sql = self.FLINK_SQL.read_text(encoding="utf-8")
        temp = re.search(r"melt_pool_temp_c\s*<\s*([0-9.]+)", sql)
        vib = re.search(r"arm_vibration_g\s*>\s*([0-9.]+)", sql)
        assert temp and vib, "anomaly predicate not found in 02_anomaly_route.sql"
        assert float(temp.group(1)) == sm.TEMP_THRESHOLD_C
        assert float(vib.group(1)) == sm.VIBRATION_THRESHOLD_G

    def test_sql_requires_both_conditions(self):
        sql = self.FLINK_SQL.read_text(encoding="utf-8").upper()
        where = sql.split("WHERE", 1)[1]
        assert "AND" in where, "predicate must require temp AND vibration together"


class TestSchemaEvolution:
    """BACKWARD compatibility in practice: a v1 reader must skip the v2 field.
    v2 wire bytes are built by hand (field 11, fixed64) because two descriptors
    with the same message name cannot coexist in one process (PR 4)."""

    def test_v1_reader_skips_v2_laser_power_field(self):
        pytest.importorskip("google.protobuf")
        import struct

        from proto_gen.stargate_telemetry_pb2 import StargateTelemetry

        v1 = StargateTelemetry(printer_id="stargate-v4-01", ts_us=42, melt_pool_temp_c=1502.0)
        # append laser_power_w = 950.0 as field 11, wire type 1 (fixed64):
        # tag byte = (11 << 3) | 1 = 0x59
        v2_wire = v1.SerializeToString() + bytes([0x59]) + struct.pack("<d", 950.0)

        decoded = StargateTelemetry()
        decoded.ParseFromString(v2_wire)
        assert decoded.printer_id == "stargate-v4-01"
        assert decoded.ts_us == 42
        assert decoded.melt_pool_temp_c == pytest.approx(1502.0)
        # the unknown field is preserved, not lost — round-tripping keeps it
        assert b"\x59" in decoded.SerializeToString()

    def test_v1_reader_skips_v3_process_context_fields(self):
        """v3 (stargate_telemetry_v3.proto) adds the process-context fields on new tags
        12-17. A reader compiled from the v1 descriptor must skip them and keep working —
        wire bytes are built by hand for the same reason as the v2 case above."""
        pytest.importorskip("google.protobuf")
        import struct

        from proto_gen.stargate_telemetry_pb2 import StargateTelemetry

        v1 = StargateTelemetry(printer_id="stargate-v4-03", ts_us=7, melt_pool_temp_c=1364.0)
        # field 12 toolpath_speed_mm_s (double, wire type 1): tag = (12<<3)|1 = 0x61
        speed = bytes([0x61]) + struct.pack("<d", 48.0)
        # field 16 capture_id (string, wire type 2): tag = (16<<3)|2 = 130 -> varint 0x82 0x01,
        # then length 5, then the utf-8 bytes. Tags >= 16 take a two-byte varint.
        cap = bytes([0x82, 0x01, 0x05]) + b"cap-x"
        v3_wire = v1.SerializeToString() + speed + cap

        decoded = StargateTelemetry()
        decoded.ParseFromString(v3_wire)
        assert decoded.printer_id == "stargate-v4-03"
        assert decoded.melt_pool_temp_c == pytest.approx(1364.0)
        # both unknown v3 fields survive a round-trip, not silently dropped
        round_trip = decoded.SerializeToString()
        assert b"\x61" in round_trip and b"cap-x" in round_trip


class TestCaptureFixture:
    """The checked-in capture fixture is the capture-mode (CI/Railway/demo) input. It must
    carry the v3 process-context fields as JSON (no protobuf in this path) and encode the
    four printer personalities the Rules-vs-baseline story depends on."""

    FIXTURE = (
        Path(__file__).resolve().parents[1] / "app" / "data" / "stargate" / "replay_capture.jsonl"
    )
    NEW_KEYS = {
        "toolpath_speed_mm_s", "acceleration_mm_s2", "commanded_power_w",
        "sensor_quality", "capture_id", "temp_slope_c_per_s",
    }

    def _lines(self) -> list[str]:
        return self.FIXTURE.read_text(encoding="utf-8").splitlines()

    def _telemetry_rows(self) -> list[dict]:
        rows: list[dict] = []
        for line in self._lines():
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict) and obj.get("kind") == "telemetry":
                rows.append(obj["data"])
        return rows

    def test_every_telemetry_row_carries_v3_fields_and_constant_capture_id(self):
        rows = self._telemetry_rows()
        assert rows, "fixture contains no telemetry rows"
        for d in rows:
            assert self.NEW_KEYS.issubset(d), f"row missing v3 fields: {d.get('printer_id')}"
        assert {d["capture_id"] for d in rows} == {"cap-stargate-20260611"}

    def test_four_printer_personalities(self):
        rows = self._telemetry_rows()
        by_printer: dict[str, list[dict]] = collections.defaultdict(list)
        for d in rows:
            by_printer[d["printer_id"]].append(d)
        anom = {
            pid: sum(1 for d in rows_p if sm.is_anomalous(d["melt_pool_temp_c"], d["arm_vibration_g"]))
            for pid, rows_p in by_printer.items()
        }
        assert anom.get("stargate-v4-01", 0) == 0, "v4-01 is the nominal control; it must never fire"
        assert anom.get("stargate-v4-02", 0) > 0, "v4-02 coupled-drift must produce anomalies"
        assert anom.get("stargate-v4-03", 0) > 0, "v4-03 redline must produce anomalies"
        assert anom.get("stargate-v4-04", 0) > 0, "v4-04 also runs a pre_failure segment"

    def test_dlq_beats_are_present_and_tied_to_v4_04(self):
        # Lines that do not parse as telemetry are the DLQ beats; the fixture authors five,
        # all flavored as stargate-v4-04 so the dead-letter feed visibly ties to that printer.
        non_telemetry = 0
        for line in self._lines():
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                non_telemetry += 1
                continue
            if not isinstance(obj, dict) or obj.get("kind") != "telemetry":
                non_telemetry += 1
        assert non_telemetry == 5
        assert "stargate-v4-04" in self.FIXTURE.read_text(encoding="utf-8")


class TestFixtureDeterminism:
    """Regenerating the fixture must be byte-stable — the demo and the determinism check in
    the bridge tests both rely on it. numpy/rs_factory_seed are only present in the stargate
    tooling venv, so this skips cleanly in bare backend CI."""

    def test_build_lines_is_byte_stable(self):
        pytest.importorskip("numpy")
        import capture_fixture

        assert capture_fixture.build_lines() == capture_fixture.build_lines()


class TestRegistryFramedJson:
    """Bridge cloud mode reads Flink's json-registry rows: magic byte + schema
    id + JSON. Both framed and plain forms must decode (PR 4)."""

    def test_framed_and_plain_json_decode(self):
        from app.services.stargate_bridge import loads_registry_json

        row = {"printer_id": "p1", "avg_temp_c": 1500.5, "n": 3}
        plain = __import__("json").dumps(row).encode()
        framed = b"\x00\x00\x00\x00\x07" + plain
        assert loads_registry_json(plain) == row
        assert loads_registry_json(framed) == row


class TestProtobufWire:
    """Round-trips through the generated bindings and the SR framing. Skipped
    where the optional clients are not installed (backend CI)."""

    def test_pb2_round_trip(self):
        pytest.importorskip("google.protobuf")
        from proto_gen.stargate_telemetry_pb2 import StargateTelemetry

        msg = StargateTelemetry(
            printer_id="stargate-v4-01", ts_us=1_700_000_000_000_000, layer=12,
            print_job_id="JOB-00-0005-PRE_FAILURE", x=30.0, y=90.0, z=9.6,
            melt_pool_temp_c=1388.5, deposition_rate_kg_hr=24.1, arm_vibration_g=0.094,
        )
        decoded = StargateTelemetry()
        decoded.ParseFromString(msg.SerializeToString())
        assert decoded.printer_id == "stargate-v4-01"
        assert decoded.melt_pool_temp_c == pytest.approx(1388.5)
        assert decoded.arm_vibration_g == pytest.approx(0.094)

    def test_schema_registry_framing_round_trip(self):
        """Serialize through ProtobufSerializer (the client lib's mock SR) and
        decode through ProtobufDeserializer — proves the SR wire framing, not
        just protobuf."""
        pytest.importorskip("confluent_kafka")
        # The SR serializers need the [schemaregistry,protobuf] extras; a bare
        # confluent-kafka install (no extras) must skip, not fail.
        pytest.importorskip(
            "confluent_kafka.schema_registry.protobuf",
            reason="confluent-kafka installed without schemaregistry/protobuf extras",
        )
        try:
            from confluent_kafka.schema_registry.mock_schema_registry_client import (
                MockSchemaRegistryClient,
            )
        except ImportError:
            from confluent_kafka.schema_registry._sync.mock_schema_registry_client import (
                MockSchemaRegistryClient,
            )
        from confluent_kafka.serialization import MessageField, SerializationContext

        from app.events.protobuf_codec import build_protobuf_deserializer, build_protobuf_serializer
        from proto_gen.stargate_telemetry_pb2 import StargateTelemetry

        sr = MockSchemaRegistryClient({"url": "http://mock-sr"})
        serializer = build_protobuf_serializer(StargateTelemetry, sr)
        deserializer = build_protobuf_deserializer(StargateTelemetry)
        ctx = SerializationContext("stargate.printer.telemetry.v1", MessageField.VALUE)

        msg = StargateTelemetry(printer_id="stargate-v4-02", ts_us=1, melt_pool_temp_c=1501.2)
        wire = serializer(msg, ctx)
        assert wire[0] == 0  # Confluent magic byte
        decoded = deserializer(wire, ctx)
        assert decoded.printer_id == "stargate-v4-02"
        assert decoded.melt_pool_temp_c == pytest.approx(1501.2)
