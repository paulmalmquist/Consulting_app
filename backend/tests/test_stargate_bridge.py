"""Stargate bridge tests — capture mode only, so they are CI-safe: no broker,
no confluent-kafka, no network. The checked-in fixture is the input.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

_STARGATE = Path(__file__).resolve().parents[2] / "scripts" / "streaming" / "stargate"
if str(_STARGATE) not in sys.path:
    sys.path.insert(0, str(_STARGATE))

import bridge  # noqa: E402


@pytest.fixture()
def capture_app(monkeypatch):
    """A fresh bridge in capture mode with autoplay off — pure preloaded state."""
    monkeypatch.setenv("STARGATE_MODE", "capture")
    monkeypatch.setenv("STARGATE_CAPTURE_AUTOPLAY", "0")
    return bridge.create_app()


def _snapshot(app) -> dict:
    with TestClient(app) as client:
        response = client.get("/stargate/snapshot")
    assert response.status_code == 200
    return response.json()


class TestCaptureDeterminism:
    def test_two_cold_starts_produce_identical_state(self, monkeypatch):
        monkeypatch.setenv("STARGATE_MODE", "capture")
        monkeypatch.setenv("STARGATE_CAPTURE_AUTOPLAY", "0")
        snap_a = _snapshot(bridge.create_app())
        snap_b = _snapshot(bridge.create_app())
        for section in ("telemetry", "agg", "anomalies"):
            assert snap_a[section] == snap_b[section], section
        # DLQ entries carry an arrival ts_ms; compare the stable fields.
        stable = lambda items: [  # noqa: E731
            {k: v for k, v in item.items() if k != "ts_ms"} for item in items
        ]
        assert stable(snap_a["dlq"]) == stable(snap_b["dlq"])

    def test_preload_rebases_onto_fixed_epoch(self, capture_app):
        snap = _snapshot(capture_app)
        first_ts_us = min(item["ts_us"] for item in snap["telemetry"])
        assert first_ts_us >= bridge.CAPTURE_BASE_MS * 1000


class TestCaptureContent:
    def test_anomalies_fire_from_pre_failure_segment(self, capture_app):
        snap = _snapshot(capture_app)
        assert snap["anomalies"], "fixture pre_failure segment must trip the predicate"
        for anomaly in snap["anomalies"]:
            assert anomaly["melt_pool_temp_c"] < 1400.0
            assert anomaly["arm_vibration_g"] > 0.08

    def test_agg_rows_have_flink_shape(self, capture_app):
        snap = _snapshot(capture_app)
        assert snap["agg"], "tumbling aggregator must close windows from preload"
        row = snap["agg"][0]
        assert set(row) == {"printer_id", "window_start_ms", "window_end_ms",
                            "avg_temp_c", "max_vibration_g", "n"}
        assert row["window_end_ms"] - row["window_start_ms"] == 5000

    def test_malformed_lines_land_in_dlq_with_reason(self, capture_app):
        snap = _snapshot(capture_app)
        assert snap["dlq_count"] == 3  # the fixture plants exactly three bad lines
        reasons = {item["reason"] for item in snap["dlq"]}
        assert any("unparseable" in reason for reason in reasons)

    def test_health_reports_capture_mode(self, capture_app):
        with TestClient(capture_app) as client:
            health = client.get("/stargate/health").json()
        assert health["mode"] == "capture"
        assert health["aggregation_source"] == "capture"
        assert health["msgs_in_total"] > 0


class TestSse:
    def test_stream_emits_snapshot_then_delta(self, capture_app):
        with TestClient(capture_app) as client:
            frames = []
            with client.stream("GET", "/stargate/stream?frames=2") as response:
                assert response.status_code == 200
                assert response.headers["content-type"].startswith("text/event-stream")
                for line in response.iter_lines():
                    if line.startswith("data: "):
                        frames.append(json.loads(line[len("data: "):]))
                    if len(frames) >= 2:
                        break
        assert frames[0]["type"] == "snapshot"
        assert frames[0]["telemetry"]
        assert frames[1]["type"] == "delta"
        # autoplay is off -> no new items between frames, and that is honest
        assert frames[1]["telemetry"] == []
        assert frames[1]["dlq_count"] == 3


class TestSeqRing:
    def test_maxlen_is_respected_and_cursoring_sees_everything(self):
        ring = bridge.SeqRing(maxlen=5)
        for i in range(12):
            ring.append({"i": i})
        assert len(ring) == 5
        items, cursor = ring.since(0)
        assert [item["i"] for item in items] == [7, 8, 9, 10, 11]
        assert cursor == 12
        ring.append({"i": 12})
        fresh, cursor = ring.since(cursor)
        assert [item["i"] for item in fresh] == [12]

    def test_downsample_keeps_newest_point_per_printer(self):
        items = [{"printer_id": "p1", "ts_us": i} for i in range(100)]
        out = bridge.downsample_per_printer(items, 20)
        assert len(out) == 20
        assert out[-1]["ts_us"] == 99
