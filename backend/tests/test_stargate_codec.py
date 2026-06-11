"""Stargate codec + anomaly-predicate tests (PR 3).

The pure-Python pieces (signal maps, predicate, tumbling aggregator) always run
— including in backend CI, which does not install confluent-kafka/protobuf.
Wire-format round-trips skip cleanly when the optional clients are absent and
run in the stargate tooling venv, where the checkpoint evidence is captured.
"""

from __future__ import annotations

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


class TestRegistryFramedJson:
    """Bridge cloud mode reads Flink's json-registry rows: magic byte + schema
    id + JSON. Both framed and plain forms must decode (PR 4)."""

    def test_framed_and_plain_json_decode(self):
        import bridge

        row = {"printer_id": "p1", "avg_temp_c": 1500.5, "n": 3}
        plain = __import__("json").dumps(row).encode()
        framed = b"\x00\x00\x00\x00\x07" + plain
        assert bridge.loads_registry_json(plain) == row
        assert bridge.loads_registry_json(framed) == row


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
