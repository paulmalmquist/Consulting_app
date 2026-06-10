"""Tests for the RS Demo streaming slice (capture-only — NO test may touch the live ISS feed).

Covers the slicing-plan acceptance tests:
  1 idempotency (second merge inserts 0)   4 fail-closed stale watchdog
  2 dedupe via ON CONFLICT key             5 out-of-range -> assertion fail + excluded flag
  3 late data -> late flag + restatement   6 CaptureAdapter determinism
plus the new tel_anomaly_events writer (insert + coalesce), the frozen-champion live-score hook,
and the /stream/* route shapes. Pure-function cores are tested without a DB; SQL paths use the
FakeCursor fixture (ordered push_result; execute records, fetch* consume).
"""
import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.services import telemetry_stream_etl as etl
from app.services import telemetry_stream_ingest as ingest

ENV = "telemetry-demo"
BIZ = uuid4()
NOW = datetime(2026, 6, 9, 12, 0, 0, tzinfo=timezone.utc)


# ── pure helpers ────────────────────────────────────────────────────────────────
def test_normalize_window_fractional_deviation():
    norm = etl.normalize_window([750.0, 752.0, 751.0])
    assert all(0.99 < v < 1.01 for v in norm)          # stable channel ~> 1.0
    spike = etl.normalize_window([100.0, 100.0, 100.0, 100.0, 160.0])
    assert spike[-1] > 1.5                              # 60% excursion survives normalization
    assert etl.normalize_window([]) == []


def test_rolling_mean_trailing_min_periods_1():
    assert etl.rolling_mean([1.0, 2.0, 3.0], window=2) == [1.0, 1.5, 2.5]


def test_coalesce_decision_30s_window():
    assert etl.coalesce_decision(100, 120) is True      # within 30s -> extend
    assert etl.coalesce_decision(100, 131) is False     # beyond -> new event
    assert etl.coalesce_decision(None, 50) is False     # no prior event


def test_evaluate_range_redlines():
    assert etl.evaluate_range(750.0, 700.0, 790.0) is True
    assert etl.evaluate_range(900.0, 700.0, 790.0) is False
    assert etl.evaluate_range(-5.0, 0.0, None) is False
    assert etl.evaluate_range(123.4, None, None) is True   # no redlines -> always in range


# ── (6) CaptureAdapter determinism — replays the REAL recorded ISS fixture ──────
def test_capture_adapter_deterministic_and_real_fixture():
    a = ingest.CaptureAdapter()
    frames1 = a.load_frames()
    frames2 = ingest.CaptureAdapter().load_frames()
    assert frames1 == frames2                            # bit-identical across runs
    assert len(frames1) > 100                            # the real 3-min recording
    keys = {f["channel_key"] for f in frames1}
    assert "USLAB000058" in keys                         # cabin pressure present
    offsets = [f["ts_offset_s"] for f in frames1]
    assert offsets == sorted(offsets)                    # ordered replay


# ── (1)+(2) silver merge: idempotency + dedupe key ──────────────────────────────
def _channel_row(name="USLAB000058", lo=700.0, hi=790.0):
    return {"channel_id": str(uuid4()), "channel_name": name, "redline_low": lo, "redline_high": hi}


def test_silver_merge_second_run_inserts_zero(fake_cursor):
    # queued: silver watermark, gold watermark, channels, bronze rows
    fake_cursor.push_result([{"watermark_ts": NOW}])
    fake_cursor.push_result([{"watermark_ts": None}])
    ch = _channel_row()
    fake_cursor.push_result([ch])
    fake_cursor.push_result([{"channel_key": "USLAB000058", "ts_source": NOW + timedelta(seconds=5),
                              "ts_ingest": NOW + timedelta(seconds=6), "value": 752.0,
                              "batch_id": str(uuid4())}])
    fake_cursor.rowcount = 0                             # ON CONFLICT DO NOTHING skipped the row
    out = etl.run_silver_merge(env_id=ENV, business_id=BIZ)
    assert out["rows_seen"] == 1 and out["rows_inserted"] == 0
    insert_sql = next(q[0] for q in fake_cursor.queries if "INSERT INTO tel_stream_readings" in q[0]
                      and "minute_agg" not in q[0])
    assert "ON CONFLICT (env_id, channel_id, ts_source) DO NOTHING" in insert_sql
    # watermark still advanced (rerun-safe incremental)
    assert any("tel_etl_watermarks" in q[0] for q in fake_cursor.queries)


def test_silver_merge_inserts_and_flags_ok(fake_cursor):
    fake_cursor.push_result([{"watermark_ts": None}])    # first run: full scan
    fake_cursor.push_result([{"watermark_ts": None}])
    ch = _channel_row()
    fake_cursor.push_result([ch])
    fake_cursor.push_result([
        {"channel_key": "USLAB000058", "ts_source": NOW, "ts_ingest": NOW, "value": 752.0,
         "batch_id": None},
        {"channel_key": "USLAB000058", "ts_source": NOW + timedelta(seconds=1),
         "ts_ingest": NOW + timedelta(seconds=1), "value": 753.0, "batch_id": None},
    ])
    out = etl.run_silver_merge(env_id=ENV, business_id=BIZ)
    assert out["rows_inserted"] == 2 and out["late_rows"] == 0
    params = [q[1] for q in fake_cursor.queries if q[0].startswith("\n") is False
              and "INSERT INTO tel_stream_readings" in q[0] and "minute_agg" not in q[0]]
    assert all(p[6] == "ok" for p in params)             # quality_flag position


# ── (3) late data -> late flag + targeted restatement ───────────────────────────
def test_silver_merge_late_frame_restates_minute(fake_cursor):
    gold_wm = NOW
    fake_cursor.push_result([{"watermark_ts": NOW - timedelta(minutes=20)}])
    fake_cursor.push_result([{"watermark_ts": gold_wm}])
    ch = _channel_row()
    fake_cursor.push_result([ch])
    late_ts = NOW - timedelta(minutes=10)                # behind the gold watermark
    fake_cursor.push_result([{"channel_key": "USLAB000058", "ts_source": late_ts,
                              "ts_ingest": NOW + timedelta(seconds=2), "value": 751.0,
                              "batch_id": None}])
    out = etl.run_silver_merge(env_id=ENV, business_id=BIZ)
    assert out["late_rows"] == 1 and out["restated_minutes"] == 1
    insert_params = [q[1] for q in fake_cursor.queries
                     if "INSERT INTO tel_stream_readings" in q[0] and "minute_agg" not in q[0]]
    assert insert_params[0][6] == "late"
    restate = [q for q in fake_cursor.queries if "restated_reason" in q[0]]
    assert restate and "late_data" in restate[0][0]


# ── (5) out-of-range -> flagged + assertion fail + status flip ──────────────────
def test_silver_merge_out_of_range_flagged(fake_cursor):
    fake_cursor.push_result([{"watermark_ts": None}])
    fake_cursor.push_result([{"watermark_ts": None}])
    fake_cursor.push_result([_channel_row(lo=700.0, hi=790.0)])
    fake_cursor.push_result([{"channel_key": "USLAB000058", "ts_source": NOW, "ts_ingest": NOW,
                              "value": 900.0, "batch_id": None}])      # past the redline
    etl.run_silver_merge(env_id=ENV, business_id=BIZ)
    params = [q[1] for q in fake_cursor.queries
              if "INSERT INTO tel_stream_readings" in q[0] and "minute_agg" not in q[0]]
    assert params[0][6] == "out_of_range"


def test_assertions_fail_flips_status(fake_cursor):
    stale_ts = datetime.now(timezone.utc) - timedelta(minutes=30)
    fake_cursor.push_result([{"newest": stale_ts}])                     # freshness: too old -> fail
    fake_cursor.push_result([{"silver": 10, "bronze_distinct": 12}])    # row-count: ok
    fake_cursor.push_result([{"channel_name": "USLAB000058", "n": 3}])  # range violations -> fail
    out = etl.run_assertions(env_id=ENV, business_id=BIZ)
    assert out["all_pass"] is False
    names = [a["assertion_name"] for a in out["assertions"]]
    assert "freshness" in names and any(n.startswith("value_range") for n in names)
    status = [q for q in fake_cursor.queries if "tel_pipeline_status" in q[0]]
    assert status and status[-1][1][3] == "failed"       # surface flipped, fail closed


def test_assertions_all_pass(fake_cursor):
    fresh_ts = datetime.now(timezone.utc) - timedelta(seconds=10)
    fake_cursor.push_result([{"newest": fresh_ts}])
    fake_cursor.push_result([{"silver": 10, "bronze_distinct": 12}])
    fake_cursor.push_result([])                                         # no violations
    out = etl.run_assertions(env_id=ENV, business_id=BIZ)
    assert out["all_pass"] is True
    assert not any("tel_pipeline_status" in q[0] and (q[1] or [None])[3] == "failed"
                   for q in fake_cursor.queries if q[1])


# ── (7) the tel_anomaly_events writer: insert + coalesce ────────────────────────
def test_record_anomaly_event_inserts_new(fake_cursor):
    fake_cursor.push_result([])                          # no prior event
    fake_cursor.push_result([{"id": "evt-1"}])           # INSERT ... RETURNING
    out = etl.record_anomaly_event(fake_cursor, env_id=ENV, business_id=BIZ, run_id="run-1",
                                   channel_name="S6000004", start_t=1000, end_t=1060,
                                   confidence=7.2)
    assert out == "evt-1"
    ins = [q for q in fake_cursor.queries if "INSERT INTO tel_anomaly_events" in q[0]]
    assert ins and ins[0][1][-1] == "model"              # source='model'


def test_record_anomaly_event_coalesces_within_30s(fake_cursor):
    fake_cursor.push_result([{"id": "evt-1", "end_t": 1050}])   # prior event ends 10s before new start
    fake_cursor.push_result([{"id": "evt-1"}])                  # UPDATE ... RETURNING
    out = etl.record_anomaly_event(fake_cursor, env_id=ENV, business_id=BIZ, run_id="run-1",
                                   channel_name="S6000004", start_t=1060, end_t=1120)
    assert out == "evt-1"
    assert any(q[0].strip().startswith("UPDATE tel_anomaly_events") for q in fake_cursor.queries)
    assert not any("INSERT INTO tel_anomaly_events" in q[0] for q in fake_cursor.queries)


# ── (8) live scoring calls the FROZEN champion ──────────────────────────────────
def test_live_scoring_uses_frozen_score_window(fake_cursor, monkeypatch):
    calls = []

    def fake_score(**kwargs):
        calls.append(kwargs)
        return {"verdict": "NO_GO", "anomaly_score": 7.4, "threshold": 0.135467}

    monkeypatch.setattr(etl.telemetry_serving, "score_window", fake_score)
    readings = [{"ts_source": NOW + timedelta(seconds=i), "value": 160.0 if i < 55 else 2.0}
                for i in range(60)]                       # eclipse-style voltage drop
    fake_cursor.push_result([{"watermark_ts": None}])     # live_scoring watermark
    fake_cursor.push_result([{"channel_name": "S6000004"}])
    fake_cursor.push_result([{"id": "run-1"}])            # stream run row
    fake_cursor.push_result(list(reversed(readings)))     # DESC fetch
    fake_cursor.push_result([])                           # coalesce lookup: no prior event
    fake_cursor.push_result([{"id": "evt-9"}])            # event INSERT RETURNING
    out = etl.run_live_scoring(env_id=ENV, business_id=BIZ)
    assert calls and calls[0]["run_key"] == "iss_live:stream"
    window = calls[0]["window"]
    assert all(isinstance(p["t"], int) for p in window)   # epoch-second ints
    assert max(p["value"] for p in window) < 2.0          # normalized, not raw volts
    assert out["scored"][0]["verdict"] == "NO_GO"
    # the frozen constants were not modified by the slice
    from app.services.telemetry_serving import GLOBAL_TRAIN_SCALE, MAD_K
    assert MAD_K == 4.0 and abs(GLOBAL_TRAIN_SCALE - 0.033866801182436346) < 1e-15


# ── (4) watchdog: >60s silence flips stale (fail closed) ────────────────────────
def test_watchdog_flips_stale_after_60s(monkeypatch):
    worker = ingest.StreamWorker(env_id=ENV, business_id=str(BIZ), source="capture")
    worker.last_frame_at = datetime.now(timezone.utc) - timedelta(seconds=61)
    written = {}

    def fake_set_status(status, reason):
        written["status"] = status
        written["reason"] = reason

    monkeypatch.setattr(worker, "_set_status_sync", fake_set_status)
    asyncio.run(worker._watchdog())
    assert written["status"] == "stale" and "no frames since" in written["reason"]
    assert worker._stale is True


# ── (9) route shapes (DB-tail fallback path; no worker in the test process) ──────
def test_stream_live_route_shape(client, fake_cursor):
    ingest.set_stream_worker(None)
    fake_cursor.push_result([{"surface": "stream_ingest", "status": "stale", "as_of_ts": NOW,
                              "reason": "no frames since test"}])
    fake_cursor.push_result([{"channel_name": "USLAB000058", "unit": "mmHg",
                              "redline_low": 700.0, "redline_high": 790.0}])
    fake_cursor.push_result([{"ts_source": NOW, "value": 752.0}])      # silver tail for the channel
    fake_cursor.push_result([])                                        # events
    resp = client.get("/api/telemetry/stream/live",
                      params={"env_id": ENV, "business_id": str(BIZ)})
    assert resp.status_code == 200
    d = resp.json()
    assert d["pipeline"]["status"] == "stale"                          # fail-closed state rides the payload
    assert d["channels"][0]["channel_name"] == "USLAB000058"
    assert d["channels"][0]["latest"]["v"] == 752.0
    assert "server_ts" in d


def test_stream_health_route_shape(client, fake_cursor):
    fake_cursor.push_result([{"channel_name": "USLAB000058",
                              "last_ts": datetime.now(timezone.utc), "n": 42}])
    fake_cursor.push_result([{"p50": 0.8, "p95": 1.6, "n": 100}])
    fake_cursor.push_result([{"n": 30}])
    fake_cursor.push_result([{"job_name": "stream_etl", "table_name": "tel_stream_readings",
                              "assertion_name": "freshness", "passed": True, "observed": "5s",
                              "threshold": "<= 120s", "run_ts": datetime.now(timezone.utc)}])
    fake_cursor.push_result([{"surface": "stream_ingest", "status": "fresh",
                              "as_of_ts": datetime.now(timezone.utc), "reason": None}])
    fake_cursor.push_result([{"job_name": "silver_merge",
                              "watermark_ts": datetime.now(timezone.utc),
                              "updated_at": datetime.now(timezone.utc)}])
    fake_cursor.push_result([{"n": 12}])    # channels_mapped probe
    fake_cursor.push_result([{"n": 500}])   # silver_rows probe
    resp = client.get("/api/telemetry/stream/health",
                      params={"env_id": ENV, "business_id": str(BIZ)})
    assert resp.status_code == 200
    d = resp.json()
    assert d["rows_per_min"] == 30 and d["ingest_lag_p50_s"] == 0.8
    assert d["assertions"][0]["assertion_name"] == "freshness"
    assert d["null_reason"] is None        # freshness present -> healthy, not a vague absence
    assert d["worker_present"] is False    # no worker set in this test process


# ── (10) actionable stream-absence diagnostics (the hardening fix) ───────────────
def test_derive_stream_reason_orders_by_debuggability():
    # channels not seeded beats everything
    assert etl.derive_stream_reason(worker_present=False, channels_mapped=False,
                                    bronze_rows_recent=0, silver_rows=0, watermark_age_s=None) == "no_channel_mapping"
    # mapped, nothing ever ran, nothing on disk -> worker disabled
    assert etl.derive_stream_reason(worker_present=False, channels_mapped=True,
                                    bronze_rows_recent=0, silver_rows=0, watermark_age_s=None) == "stream_worker_disabled"
    # worker up but adapter landed nothing -> source/no frames
    assert etl.derive_stream_reason(worker_present=True, channels_mapped=True,
                                    bronze_rows_recent=0, silver_rows=0, watermark_age_s=None) == "no_bronze_frames"
    # bronze landing but silver watermark stale -> ETL stalled
    assert etl.derive_stream_reason(worker_present=True, channels_mapped=True,
                                    bronze_rows_recent=20, silver_rows=100, watermark_age_s=600) == "etl_watermark_stalled"
    # flowing -> healthy (None)
    assert etl.derive_stream_reason(worker_present=True, channels_mapped=True,
                                    bronze_rows_recent=20, silver_rows=100, watermark_age_s=30) is None


def test_stream_live_empty_reports_worker_disabled(client, fake_cursor):
    """No worker, channels mapped, no bronze/silver -> 'stream_worker_disabled', never 'no_stream_data'."""
    ingest.set_stream_worker(None)
    fake_cursor.push_result([])                                        # pipeline status rows (none)
    fake_cursor.push_result([{"channel_name": "USLAB000058", "unit": "mmHg",
                              "redline_low": 700.0, "redline_high": 790.0}])  # channel meta (mapped)
    fake_cursor.push_result([])                                        # silver tail -> no rows
    fake_cursor.push_result([])                                        # events
    fake_cursor.push_result([{"n": 0}])                                # bronze recent
    fake_cursor.push_result([{"n": 0}])                                # silver count
    fake_cursor.push_result([{"wm": None}])                            # silver watermark
    resp = client.get("/api/telemetry/stream/live",
                      params={"env_id": ENV, "business_id": str(BIZ)})
    assert resp.status_code == 200
    d = resp.json()
    assert d["channels"] == []
    assert d["null_reason"] == "stream_worker_disabled"   # actionable, not blanket no_stream_data
    assert d["worker_present"] is False


def test_stream_source_switch_fails_closed_without_key(client, monkeypatch):
    monkeypatch.delenv("TELEMETRY_STREAM_ADMIN_KEY", raising=False)
    resp = client.post("/api/telemetry/stream/source", json={"source": "capture"})
    assert resp.status_code == 403                        # unset key -> always forbidden
