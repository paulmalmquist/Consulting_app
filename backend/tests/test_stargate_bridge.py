"""Stargate bridge tests — capture mode only, so they are CI-safe: no broker,
no confluent-kafka, no network. The checked-in fixture is the input.

Targets the SHIPPING code: the bridge core (app.services.stargate_bridge) and
its route surface (app.routes.stargate_bridge), which is what deploys to
Railway. A separate smoke test imports the laptop wrapper to keep it green.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.routes.stargate_bridge import create_app
from app.services import stargate_bridge as core


@pytest.fixture()
def capture_app(monkeypatch):
    """A fresh bridge in capture mode with autoplay off — pure preloaded state."""
    monkeypatch.setenv("STARGATE_MODE", "capture")
    monkeypatch.setenv("STARGATE_CAPTURE_AUTOPLAY", "0")
    return create_app()


def _snapshot(app) -> dict:
    with TestClient(app) as client:
        response = client.get("/stargate/snapshot")
    assert response.status_code == 200
    return response.json()


class TestCaptureDeterminism:
    def test_two_cold_starts_produce_identical_state(self, monkeypatch):
        monkeypatch.setenv("STARGATE_MODE", "capture")
        monkeypatch.setenv("STARGATE_CAPTURE_AUTOPLAY", "0")
        snap_a = _snapshot(create_app())
        snap_b = _snapshot(create_app())
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
        assert first_ts_us >= core.CAPTURE_BASE_MS * 1000


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
        assert snap["dlq_count"] == 5  # the fixture plants five bad lines, all v4-04 flavored
        reasons = {item["reason"] for item in snap["dlq"]}
        assert any("unparseable" in reason for reason in reasons)

    def test_health_reports_capture_mode(self, capture_app):
        with TestClient(capture_app) as client:
            health = client.get("/stargate/health").json()
        assert health["mode"] == "capture"
        assert health["aggregation_source"] == "capture"
        assert health["msgs_in_total"] > 0


class TestRulesVsBaseline:
    """T3: the bridge enriches each ingest at the one chokepoint with the hard rule, the rolling-MAD
    baseline scorer, 5s/15s/60s feature windows, routing, and (capture-mode synthetic) Kafka provenance.
    All driven by the checked-in fixture — still no broker, no DB."""

    def test_snapshot_carries_per_printer_scored_state(self, capture_app):
        snap = _snapshot(capture_app)
        assert snap["scored"], "scored state must ride the snapshot"
        printers = {s["printer_id"] for s in snap["scored"]}
        assert "stargate-v4-01" in printers
        for s in snap["scored"]:
            sc = s["scorer"]
            assert sc["name"] == "baseline scorer (rolling-MAD residual)"
            assert "LSTM" not in sc["name"]
            assert s["rule"]["predicate"].startswith("cold melt pool")
            assert set(s["feature_window"]) == {"w5s", "w15s", "w60s"}

    def test_anomaly_rows_are_enriched_with_provenance_and_score(self, capture_app):
        snap = _snapshot(capture_app)
        assert snap["anomalies"]
        a = snap["anomalies"][0]
        # the original contract still holds
        assert a["melt_pool_temp_c"] < 1400.0 and a["arm_vibration_g"] > 0.08
        # ... plus the T3 enrichment
        assert a["rule"]["fired"] is True
        assert a["scorer"]["name"] == "baseline scorer (rolling-MAD residual)"
        assert a["routing"]["routed_to"] == "anomalies"
        prov = a["provenance"]
        assert prov["provenance_source"] == "recorded_capture"
        # The anomaly carries the ANOMALIES-topic coordinate (its own, never the telemetry coordinate).
        assert prov["kafka_topic"] == "stargate.printer.anomalies.v1"
        assert 0 <= prov["kafka_partition"] < 6
        assert isinstance(prov["kafka_offset"], int)
        assert prov["synthetic"] is True
        assert prov["schema_null_reason"] == "capture_mode_synthetic_schema_id"
        assert prov["capture_id"] == "cap-stargate-20260611"

    def test_scorer_fails_closed_on_a_short_window(self):
        # A fresh printer with too few points must report model_not_configured, never a fabricated score.
        state = core.BridgeState("capture")
        rec = {"printer_id": "p-new", "ts_us": 1_700_000_000_000_000, "layer": 0,
               "print_job_id": "JOB", "x": 0.0, "y": 0.0, "z": 0.0,
               "melt_pool_temp_c": 1500.0, "deposition_rate_kg_hr": 24.0, "arm_vibration_g": 0.02}
        state.ingest_telemetry(rec, emulate_flink=False)
        sc = state._scored["p-new"]["scorer"]
        assert sc["model_not_configured"] is True
        assert sc["null_reason"] == "insufficient_window"
        assert sc["score"] is None

    def test_v4_02_baseline_review_precedes_the_hard_rule(self, capture_app):
        """The showcase, locked as a regression: on v4-02 the rolling-MAD baseline flags REVIEW (on an
        early melt-pool excursion while vibration is still nominal, so the two-condition rule stays
        silent) BEFORE the first hard-rule anomaly. Replays the fixture through the real ingest path."""
        import json

        fixture = (Path(__file__).resolve().parents[1] / "app" / "data" / "stargate"
                   / "replay_capture.jsonl")
        rows = []
        for line in fixture.read_text(encoding="utf-8").splitlines():
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict) and obj.get("kind") == "telemetry" \
                    and obj["data"]["printer_id"] == "stargate-v4-02":
                rows.append(obj)
        rows.sort(key=lambda o: o["offset_ms"])
        assert rows, "fixture missing v4-02 telemetry"

        state = core.BridgeState("capture")
        first_review_ms = None
        first_anomaly_ms = None
        for o in rows:
            rec = dict(o["data"])
            rec["ts_us"] = o["offset_ms"] * 1000
            state.ingest_telemetry(rec, emulate_flink=True, now_ms=o["offset_ms"])
            sc = state._scored["stargate-v4-02"]["scorer"]
            if first_review_ms is None and sc["verdict"] in ("REVIEW", "NO_GO"):
                first_review_ms = o["offset_ms"]
            anoms = state.rings["anomalies"].tail(500)
            if first_anomaly_ms is None and anoms:
                first_anomaly_ms = anoms[0]["ts_us"] // 1000

        assert first_review_ms is not None, "baseline never reached REVIEW on v4-02"
        assert first_anomaly_ms is not None, "v4-02 must still produce a hard-rule anomaly"
        assert first_review_ms < first_anomaly_ms, (
            f"baseline REVIEW ({first_review_ms}ms) must precede the hard rule ({first_anomaly_ms}ms)")


class TestBridgeImportPurity:
    def test_bridge_scores_with_no_database_url(self):
        """Import purity guard: the bridge + scorer must run with NO DATABASE_URL (the laptop tooling
        venv has none — a config/db import would kill `uvicorn bridge:app`). Run in a clean subprocess."""
        import os
        import subprocess
        import sys

        backend = Path(__file__).resolve().parents[1]
        env = {k: v for k, v in os.environ.items()
               if k not in ("DATABASE_URL", "TELEMETRY_DATABASE_URL")}
        env["PYTHONPATH"] = str(backend)
        code = (
            "import app.services.stargate_bridge as b\n"
            "s = b.BridgeState('capture')\n"
            "for i in range(20):\n"
            "    s.ingest_telemetry({'printer_id':'p','ts_us':i*100000,'layer':0,'print_job_id':'j',"
            "'melt_pool_temp_c':1500.0-i,'arm_vibration_g':0.02,'deposition_rate_kg_hr':24.0},"
            "emulate_flink=True, now_ms=i*100)\n"
            "snap = s.snapshot()\n"
            "assert snap['scored'], 'scored missing'\n"
            "print('PURE_OK')\n"
        )
        result = subprocess.run([sys.executable, "-c", code], env=env,
                                capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        assert "PURE_OK" in result.stdout


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
        assert frames[1]["dlq_count"] == 5


class TestSeqRing:
    def test_maxlen_is_respected_and_cursoring_sees_everything(self):
        ring = core.SeqRing(maxlen=5)
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
        out = core.downsample_per_printer(items, 20)
        assert len(out) == 20
        assert out[-1]["ts_us"] == 99


class TestReplayCycle:
    def test_replay_cycle_starts_recorded_capture(self, capture_app):
        # Capture mode with autoplay off: the POST (re)starts the replay loop and
        # is honest about being recorded capture, never a live printer.
        with TestClient(capture_app) as client:
            res = client.post("/stargate/replay/cycle")
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert body["mode"] == "capture"
        assert body["source"] == "recorded_capture"
        assert body["frames"] > 0

    def test_replay_cycle_409_outside_capture_mode(self):
        # Broker modes own their own producer; the control fails closed (409)
        # rather than fabricating a live feed. Build state directly so no consumer
        # thread / confluent-kafka import is needed.
        from fastapi import FastAPI
        from app.routes.stargate_bridge import router
        app = FastAPI()
        app.state.stargate_bridge = core.BridgeState("cloud")
        app.include_router(router)
        with TestClient(app) as client:
            res = client.post("/stargate/replay/cycle")
        assert res.status_code == 409
        assert "capture-mode only" in res.json()["detail"]


class TestRouterSurface:
    def test_router_exposes_exactly_the_five_endpoints(self):
        from app.routes.stargate_bridge import router
        paths = {r.path for r in router.routes}
        assert paths == {
            "/stargate/health", "/stargate/snapshot", "/stargate/dlq",
            "/stargate/stream", "/stargate/replay/cycle",
        }

    def test_endpoints_503_when_state_not_initialized(self):
        # Mounting the router without a lifespan that sets app.state.stargate_bridge
        # must fail closed, not 500. (The mount in main.py always initializes it.)
        from fastapi import FastAPI
        from app.routes.stargate_bridge import router
        app = FastAPI()
        app.include_router(router)
        with TestClient(app) as client:
            assert client.get("/stargate/health").status_code == 503


class TestLaptopWrapper:
    def test_wrapper_module_exposes_the_backend_factory(self):
        import sys
        scripts = Path(__file__).resolve().parents[2] / "scripts" / "streaming" / "stargate"
        if str(scripts) not in sys.path:
            sys.path.insert(0, str(scripts))
        import bridge  # the thin laptop entrypoint
        from app.routes.stargate_bridge import create_app as backend_create_app
        assert bridge.create_app is backend_create_app
        assert bridge.app is not None  # uvicorn bridge:app target


class TestDefaultOff:
    def test_shared_app_has_no_stargate_routes_when_flag_off(self):
        # conftest imports app.main with STARGATE_BRIDGE_ENABLED unset (default off);
        # the shared backend must stay inert — no /stargate/* routes mounted.
        from app.main import app as main_app
        stargate_paths = [r.path for r in main_app.routes if getattr(r, "path", "").startswith("/stargate")]
        assert stargate_paths == []
