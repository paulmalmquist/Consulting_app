"""Incremental streaming ETL for the RS Demo slice: bronze -> silver -> gold + DQ assertions +
live scoring through the FROZEN champion rule.

Design (per docs/plans/TELEMETRY_STREAMING_SLICE_PLAN.md, corrected to the real runtime):
  * No scheduler exists in this backend — `run_etl_loop` is an asyncio background task started from
    the FastAPI lifespan (the operator-sweep-loop pattern), running every 60 s, never dying: failures
    flip `tel_pipeline_status`, not the process.
  * Idempotency lives at the silver merge: bronze accepts duplicates (append-only truth); silver
    enforces UNIQUE (env_id, channel_id, ts_source) with ON CONFLICT DO NOTHING. Reruns from an
    unchanged watermark process 0 rows and gold is bit-identical.
  * Late data (ts_source older than the gold watermark) is flagged `late` and the affected minutes are
    re-aggregated with `restated_at` + reason — history is restated, never silently mutated.
  * Fail closed: any failed assertion flips the surface status; the UI renders the reason.

Live scoring: silver windows are passed through `telemetry_serving.score_window` — the frozen champion
(MAD_K, GLOBAL_TRAIN_SCALE, _verdict_for are NOT modified). ISS channels are raw engineering units
(mmHg, V, %), while the frozen threshold is in normalized SMAP/MSL units, so each window is normalized
to FRACTIONAL DEVIATION (value / median |window|) before scoring — a declared adaptation, surfaced in
the UI footnote. NO_GO verdicts create rows in tel_anomaly_events via `record_anomaly_event` (this is
the platform's first backend writer for that table), with 30 s coalescing so one sustained excursion
is one event.
"""
from __future__ import annotations

import asyncio
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.observability.logger import emit_log
from app.services import telemetry_serving

STREAM_RUN_KEY = "iss_live:stream"
EVENT_COALESCE_S = 30
SCORE_WINDOW_POINTS = 60          # trailing readings per channel fed to the champion
ROLLING_MEAN_POINTS = 50          # matches the champion's value_rmean50 semantics
FRESHNESS_LIMIT_S = 120           # silver freshness assertion threshold


# ── pure helpers (unit-testable without a DB) ─────────────────────────────────────────────────────
def normalize_window(values: list[float]) -> list[float]:
    """Normalize raw engineering units to fractional scale: v / median(|window|). Declared adaptation
    so the FROZEN champion threshold (normalized units) applies meaningfully to live channels."""
    base = statistics.median(abs(v) for v in values) if values else 0.0
    base = max(base, 1e-9)
    return [v / base for v in values]


def rolling_mean(values: list[float], window: int = ROLLING_MEAN_POINTS) -> list[float]:
    """Trailing mean over `window` points incl. current (min_periods=1) — the rmean50 frame."""
    out: list[float] = []
    acc = 0.0
    for i, v in enumerate(values):
        acc += v
        if i >= window:
            acc -= values[i - window]
        out.append(acc / min(i + 1, window))
    return out


def minute_floor(ts: datetime) -> datetime:
    return ts.replace(second=0, microsecond=0)


def evaluate_range(value: float, lo: float | None, hi: float | None) -> bool:
    """True when the value is within redlines (None bound = unbounded)."""
    if lo is not None and value < lo:
        return False
    if hi is not None and value > hi:
        return False
    return True


def coalesce_decision(last_end_t: int | None, start_t: int) -> bool:
    """True when the new event should extend the previous one instead of inserting."""
    return last_end_t is not None and last_end_t >= start_t - EVENT_COALESCE_S


# Specific, actionable stream-absence reasons. A skeptical reviewer must see WHY the feed is dark and
# WHAT to do — never a blanket "no_stream_data". None = stream is healthy (channels present).
WATERMARK_STALL_S = 180  # silver watermark older than this with no fresh bronze = ETL stalled


def derive_stream_reason(
    *, worker_present: bool, channels_mapped: bool, bronze_rows_recent: int,
    silver_rows: int, watermark_age_s: float | None,
) -> str | None:
    """Pure diagnostic: pick the most actionable reason the stream surface is empty. Checked in the
    order a reviewer would debug it. Returns None when channels exist and data is flowing.

    Repair hints (rendered by the UI / runbook):
      no_channel_mapping     -> seed tel_telemetry_channels for run_key 'iss_live:stream'
      stream_worker_disabled -> set TELEMETRY_STREAM_ENABLED=1 and redeploy the backend
      no_bronze_frames       -> worker is up but the adapter landed no frames (source unavailable?)
      etl_watermark_stalled  -> bronze is landing but silver merge/ETL loop is not advancing
    """
    if not channels_mapped:
        return "no_channel_mapping"
    if not worker_present and bronze_rows_recent == 0 and silver_rows == 0:
        # Nothing has ever run in this process and nothing is on disk: the worker isn't enabled.
        return "stream_worker_disabled"
    if bronze_rows_recent == 0 and silver_rows == 0:
        # Worker is present but no frames are landing — the adapter/source is the suspect.
        return "no_bronze_frames"
    if (bronze_rows_recent > 0 and watermark_age_s is not None
            and watermark_age_s > WATERMARK_STALL_S):
        # Frames are landing but the ETL watermark isn't advancing — the loop is stuck.
        return "etl_watermark_stalled"
    return None


# ── watermarks ────────────────────────────────────────────────────────────────────────────────────
def _get_watermark(cur, env_id: str, job_name: str) -> datetime | None:
    cur.execute("SELECT watermark_ts FROM tel_etl_watermarks WHERE env_id = %s AND job_name = %s",
                (env_id, job_name))
    row = cur.fetchone()
    return row["watermark_ts"] if row else None


def _set_watermark(cur, env_id: str, business_id: UUID, job_name: str,
                   watermark_ts: datetime, run_id: uuid.UUID) -> None:
    cur.execute(
        """INSERT INTO tel_etl_watermarks (env_id, business_id, job_name, watermark_ts, last_run_id)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (env_id, job_name)
           DO UPDATE SET watermark_ts = EXCLUDED.watermark_ts, last_run_id = EXCLUDED.last_run_id,
                         updated_at = now()""",
        (env_id, str(business_id), job_name, watermark_ts, str(run_id)))


def set_pipeline_status(cur, *, env_id: str, business_id: UUID, surface: str,
                        status: str, reason: str | None = None) -> None:
    cur.execute(
        """INSERT INTO tel_pipeline_status (env_id, business_id, surface, status, as_of_ts, reason)
           VALUES (%s, %s, %s, %s, now(), %s)
           ON CONFLICT (env_id, surface)
           DO UPDATE SET status = EXCLUDED.status, as_of_ts = now(), reason = EXCLUDED.reason""",
        (env_id, str(business_id), surface, status, reason))


# ── the missing writer: tel_anomaly_events ───────────────────────────────────────────────────────
def record_anomaly_event(cur, *, env_id: str, business_id: UUID, run_id, channel_name: str,
                         start_t: int, end_t: int, anomaly_class: str = "point",
                         confidence: float | None = None, source: str = "model"):
    """Insert (or coalesce into) a model-fired anomaly event. The first backend writer for
    tel_anomaly_events — Databricks backfill was previously the only producer."""
    cur.execute(
        """SELECT id, end_t FROM tel_anomaly_events
           WHERE env_id = %s AND business_id = %s AND run_id = %s AND channel_name = %s
             AND source = %s
           ORDER BY end_t DESC NULLS LAST LIMIT 1""",
        (env_id, str(business_id), run_id, channel_name, source))
    last = cur.fetchone()
    if last and coalesce_decision(last["end_t"], start_t):
        cur.execute(
            """UPDATE tel_anomaly_events SET end_t = GREATEST(end_t, %s), confidence = %s
               WHERE id = %s RETURNING id""",
            (end_t, confidence, last["id"]))
        return cur.fetchone()["id"]
    cur.execute(
        """INSERT INTO tel_anomaly_events
             (env_id, business_id, run_id, channel_name, start_t, end_t, anomaly_class, confidence, source)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (env_id, str(business_id), run_id, channel_name, start_t, end_t,
         anomaly_class, confidence, source))
    return cur.fetchone()["id"]


# ── silver merge ──────────────────────────────────────────────────────────────────────────────────
def run_silver_merge(*, env_id: str, business_id: UUID) -> dict:
    """Bronze -> silver from the watermark: conform channel_key -> channel_id, dedupe via the UNIQUE
    key, flag late / out-of-range rows, advance the watermark. Single cursor scope = one commit."""
    from app.db import get_telemetry_cursor as get_cursor
    run_id = uuid.uuid4()
    with get_cursor() as cur:
        wm = _get_watermark(cur, env_id, "silver_merge")
        gold_wm = _get_watermark(cur, env_id, "gold_rollup")

        cur.execute(
            """SELECT c.id AS channel_id, c.channel_name, c.redline_low, c.redline_high
               FROM tel_telemetry_channels c
               JOIN tel_test_runs r ON r.id = c.run_id
               WHERE c.env_id = %s AND c.business_id = %s AND r.run_key = %s""",
            (env_id, str(business_id), STREAM_RUN_KEY))
        channels = {r["channel_name"]: r for r in cur.fetchall()}
        if not channels:
            return {"rows_seen": 0, "rows_inserted": 0, "late_rows": 0,
                    "null_reason": "channels_not_seeded"}

        if wm is None:
            cur.execute(
                """SELECT channel_key, ts_source, ts_ingest, value, batch_id
                   FROM tel_stream_readings_bronze
                   WHERE env_id = %s AND business_id = %s ORDER BY ts_ingest""",
                (env_id, str(business_id)))
        else:
            cur.execute(
                """SELECT channel_key, ts_source, ts_ingest, value, batch_id
                   FROM tel_stream_readings_bronze
                   WHERE env_id = %s AND business_id = %s AND ts_ingest > %s ORDER BY ts_ingest""",
                (env_id, str(business_id), wm))
        rows = cur.fetchall()
        if not rows:
            return {"rows_seen": 0, "rows_inserted": 0, "late_rows": 0, "watermark": wm}

        inserted = late = 0
        restate_minutes: set[tuple[str, datetime]] = set()
        max_ingest = wm
        for r in rows:
            max_ingest = r["ts_ingest"] if max_ingest is None else max(max_ingest, r["ts_ingest"])
            ch = channels.get(r["channel_key"])
            if ch is None or r["value"] is None:
                continue
            is_late = gold_wm is not None and r["ts_source"] < gold_wm
            in_range = evaluate_range(float(r["value"]), ch["redline_low"], ch["redline_high"])
            flag = "out_of_range" if not in_range else ("late" if is_late else "ok")
            cur.execute(
                """INSERT INTO tel_stream_readings
                     (env_id, business_id, channel_id, channel_name, ts_source, value, quality_flag, batch_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (env_id, channel_id, ts_source) DO NOTHING""",
                (env_id, str(business_id), ch["channel_id"], r["channel_key"],
                 r["ts_source"], r["value"], flag, r["batch_id"]))
            if cur.rowcount:
                inserted += 1
                if flag == "late":
                    late += 1
                    restate_minutes.add((r["channel_key"], minute_floor(r["ts_source"])))

        # Targeted restatement of minutes hit by late data.
        for channel_name, minute in restate_minutes:
            ch = channels[channel_name]
            cur.execute(
                """INSERT INTO tel_stream_minute_agg
                     (env_id, business_id, channel_id, channel_name, minute_start,
                      n, v_min, v_max, v_avg, restated_at, restated_reason, updated_at)
                   SELECT %s, %s, %s, %s, %s, count(*), min(value), max(value), avg(value),
                          now(), 'late_data', now()
                   FROM tel_stream_readings
                   WHERE env_id = %s AND channel_id = %s
                     AND ts_source >= %s AND ts_source < %s
                     AND quality_flag IN ('ok', 'late')
                   ON CONFLICT (env_id, channel_id, minute_start)
                   DO UPDATE SET n = EXCLUDED.n, v_min = EXCLUDED.v_min, v_max = EXCLUDED.v_max,
                                 v_avg = EXCLUDED.v_avg, restated_at = now(),
                                 restated_reason = 'late_data', updated_at = now()""",
                (env_id, str(business_id), ch["channel_id"], channel_name, minute,
                 env_id, ch["channel_id"], minute, minute + timedelta(minutes=1)))

        if max_ingest is not None:
            _set_watermark(cur, env_id, business_id, "silver_merge", max_ingest, run_id)
        set_pipeline_status(cur, env_id=env_id, business_id=business_id,
                            surface="silver", status="fresh")
        return {"rows_seen": len(rows), "rows_inserted": inserted, "late_rows": late,
                "restated_minutes": len(restate_minutes), "watermark": max_ingest}


# ── gold rollup ───────────────────────────────────────────────────────────────────────────────────
def run_gold_rollup(*, env_id: str, business_id: UUID) -> dict:
    """Aggregate completed minutes (and the in-progress one) from the gold watermark forward.
    Out-of-range rows are excluded; anomaly_count is the count of overlapping model events."""
    from app.db import get_telemetry_cursor as get_cursor
    run_id = uuid.uuid4()
    with get_cursor() as cur:
        wm = _get_watermark(cur, env_id, "gold_rollup")
        params = [env_id, str(business_id)]
        wm_clause = ""
        if wm is not None:
            wm_clause = "AND s.ts_source >= %s"
            params.append(wm - timedelta(minutes=1))   # re-cover the boundary minute
        cur.execute(
            f"""SELECT s.channel_id, s.channel_name, date_trunc('minute', s.ts_source) AS minute_start,
                       count(*) AS n, min(s.value) AS v_min, max(s.value) AS v_max, avg(s.value) AS v_avg,
                       max(s.ts_source) AS max_ts
                FROM tel_stream_readings s
                WHERE s.env_id = %s AND s.business_id = %s
                  AND s.quality_flag IN ('ok', 'late')
                  {wm_clause}
                GROUP BY s.channel_id, s.channel_name, date_trunc('minute', s.ts_source)""",
            params)
        groups = cur.fetchall()
        if not groups:
            return {"minutes_upserted": 0, "watermark": wm}

        max_ts = wm
        for g in groups:
            max_ts = g["max_ts"] if max_ts is None else max(max_ts, g["max_ts"])
            minute_start = g["minute_start"]
            minute_end = minute_start + timedelta(minutes=1)
            cur.execute(
                """SELECT count(*) AS n FROM tel_anomaly_events e
                   JOIN tel_test_runs r ON r.id = e.run_id
                   WHERE e.env_id = %s AND e.business_id = %s AND r.run_key = %s
                     AND e.channel_name = %s AND e.source = 'model'
                     AND e.start_t < %s AND e.end_t >= %s""",
                (env_id, str(business_id), STREAM_RUN_KEY, g["channel_name"],
                 int(minute_end.timestamp()), int(minute_start.timestamp())))
            anomaly_n = int(cur.fetchone()["n"])
            cur.execute(
                """INSERT INTO tel_stream_minute_agg
                     (env_id, business_id, channel_id, channel_name, minute_start,
                      n, v_min, v_max, v_avg, anomaly_count, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                   ON CONFLICT (env_id, channel_id, minute_start)
                   DO UPDATE SET n = EXCLUDED.n, v_min = EXCLUDED.v_min, v_max = EXCLUDED.v_max,
                                 v_avg = EXCLUDED.v_avg, anomaly_count = EXCLUDED.anomaly_count,
                                 updated_at = now()""",
                (env_id, str(business_id), g["channel_id"], g["channel_name"], minute_start,
                 g["n"], g["v_min"], g["v_max"], g["v_avg"], anomaly_n))

        if max_ts is not None:
            _set_watermark(cur, env_id, business_id, "gold_rollup", max_ts, run_id)
        set_pipeline_status(cur, env_id=env_id, business_id=business_id,
                            surface="gold", status="fresh")
        return {"minutes_upserted": len(groups), "watermark": max_ts}


# ── assertions ────────────────────────────────────────────────────────────────────────────────────
def run_assertions(*, env_id: str, business_id: UUID) -> dict:
    """Freshness, row-count delta, and value-range checks -> tel_dq_assertions; failures flip the
    surface status (fail closed)."""
    from app.db import get_telemetry_cursor as get_cursor
    results: list[dict] = []
    with get_cursor() as cur:
        def record(name: str, table: str, passed: bool, observed: str, threshold: str) -> None:
            results.append({"assertion_name": name, "table_name": table, "passed": passed,
                            "observed": observed, "threshold": threshold})
            cur.execute(
                """INSERT INTO tel_dq_assertions
                     (env_id, business_id, job_name, table_name, assertion_name, passed, observed, threshold)
                   VALUES (%s, %s, 'stream_etl', %s, %s, %s, %s, %s)""",
                (env_id, str(business_id), table, name, passed, observed, threshold))

        # freshness: newest silver row must be recent (only meaningful once data exists)
        cur.execute(
            "SELECT max(ts_source) AS newest FROM tel_stream_readings WHERE env_id = %s AND business_id = %s",
            (env_id, str(business_id)))
        newest = cur.fetchone()["newest"]
        if newest is not None:
            age = (datetime.now(timezone.utc) - newest).total_seconds()
            record("freshness", "tel_stream_readings", age <= FRESHNESS_LIMIT_S,
                   f"{int(age)}s", f"<= {FRESHNESS_LIMIT_S}s")

        # row-count delta: silver should never exceed distinct bronze (dedupe sanity)
        cur.execute(
            """SELECT (SELECT count(*) FROM tel_stream_readings WHERE env_id = %s AND business_id = %s) AS silver,
                      (SELECT count(DISTINCT (channel_key, ts_source)) FROM tel_stream_readings_bronze
                       WHERE env_id = %s AND business_id = %s) AS bronze_distinct""",
            (env_id, str(business_id), env_id, str(business_id)))
        rc = cur.fetchone()
        record("row_count_delta", "tel_stream_readings",
               rc["silver"] <= rc["bronze_distinct"],
               f"silver={rc['silver']} bronze_distinct={rc['bronze_distinct']}",
               "silver <= distinct bronze")

        # value-range: out_of_range rows present in the last 10 min = a live range violation
        cur.execute(
            """SELECT channel_name, count(*) AS n FROM tel_stream_readings
               WHERE env_id = %s AND business_id = %s AND quality_flag = 'out_of_range'
                 AND created_at > now() - interval '10 minutes'
               GROUP BY channel_name""",
            (env_id, str(business_id)))
        violations = cur.fetchall()
        for v in violations:
            record(f"value_range:{v['channel_name']}", "tel_stream_readings", False,
                   f"{v['n']} out-of-range rows (10m)", "0 expected")
        if not violations:
            record("value_range", "tel_stream_readings", True, "0 out-of-range rows (10m)", "0 expected")

        all_pass = all(r["passed"] for r in results)
        if not all_pass:
            failed = ", ".join(r["assertion_name"] for r in results if not r["passed"])
            set_pipeline_status(cur, env_id=env_id, business_id=business_id, surface="silver",
                                status="failed", reason=f"assertions failed: {failed}")
        return {"assertions": results, "all_pass": all_pass}


# ── live scoring through the FROZEN champion ─────────────────────────────────────────────────────
def run_live_scoring(*, env_id: str, business_id: UUID) -> dict:
    """Pass each channel's trailing window through telemetry_serving.score_window (frozen rule,
    untouched constants). Values are normalized to fractional deviation first (declared adaptation —
    raw engineering units vs the normalized-unit threshold). NO_GO -> record_anomaly_event."""
    from app.db import get_telemetry_cursor as get_cursor
    run_id = uuid.uuid4()
    scored: list[dict] = []
    with get_cursor() as cur:
        wm = _get_watermark(cur, env_id, "live_scoring")
        cur.execute(
            """SELECT DISTINCT channel_name FROM tel_stream_readings
               WHERE env_id = %s AND business_id = %s AND quality_flag = 'ok'
                 AND (%s::timestamptz IS NULL OR ts_source > %s)""",
            (env_id, str(business_id), wm, wm))
        channel_names = [r["channel_name"] for r in cur.fetchall()]
        cur.execute(
            "SELECT id FROM tel_test_runs WHERE env_id = %s AND business_id = %s AND run_key = %s",
            (env_id, str(business_id), STREAM_RUN_KEY))
        run_row = cur.fetchone()
        if run_row is None:
            return {"scored": [], "null_reason": "missing_run"}
        stream_run_id = run_row["id"]

        windows: dict[str, list[dict]] = {}
        max_ts = wm
        for name in channel_names:
            cur.execute(
                """SELECT ts_source, value FROM tel_stream_readings
                   WHERE env_id = %s AND business_id = %s AND channel_name = %s AND quality_flag = 'ok'
                   ORDER BY ts_source DESC LIMIT %s""",
                (env_id, str(business_id), name, SCORE_WINDOW_POINTS))
            rows = list(reversed(cur.fetchall()))
            if len(rows) < 5:        # not enough context to score honestly
                continue
            newest = rows[-1]["ts_source"]
            max_ts = newest if max_ts is None else max(max_ts, newest)
            values = [float(r["value"]) for r in rows]
            norm = normalize_window(values)
            rmeans = rolling_mean(norm)
            windows[name] = [
                {"t": int(r["ts_source"].timestamp()), "value": n, "value_rmean50": m}
                for r, n, m in zip(rows, norm, rmeans)
            ]

    # score_window opens its own cursor (separate transaction per receipt — matches /score semantics)
    for name, window in windows.items():
        result = telemetry_serving.score_window(
            env_id=env_id, business_id=business_id, run_key=STREAM_RUN_KEY,
            channel_name=name, window=window)
        scored.append({"channel_name": name, "verdict": result.get("verdict"),
                       "anomaly_score": result.get("anomaly_score")})
        if result.get("verdict") == "NO_GO":
            with get_cursor() as cur:
                record_anomaly_event(
                    cur, env_id=env_id, business_id=business_id, run_id=stream_run_id,
                    channel_name=name, start_t=window[0]["t"], end_t=window[-1]["t"],
                    anomaly_class="point", confidence=result.get("anomaly_score"),
                    source="model")

    if max_ts is not None:
        with get_cursor() as cur:
            _set_watermark(cur, env_id, business_id, "live_scoring", max_ts, run_id)
    return {"scored": scored, "watermark": max_ts}


# ── serving reads for the stream routes ──────────────────────────────────────────────────────────
def stream_live(*, env_id: str, business_id: UUID, channels: list[str] | None = None,
                limit_per_channel: int = 120) -> dict:
    """Live read: worker ring buffer first; silver tail fallback when the worker is absent/empty.
    Carries server_ts (latency overlay) + pipeline status + recent live anomaly events. Fail closed:
    stale/failed status rides the payload — the UI freezes charts, never interpolates."""
    from app.db import get_telemetry_cursor as get_cursor
    from app.services.telemetry_stream_ingest import get_stream_worker

    server_ts = datetime.now(timezone.utc)
    worker = get_stream_worker()
    snapshot = worker.snapshot_live(channels) if worker is not None else None

    with get_cursor() as cur:
        cur.execute(
            "SELECT surface, status, as_of_ts, reason FROM tel_pipeline_status WHERE env_id = %s AND business_id = %s",
            (env_id, str(business_id)))
        status_rows = {r["surface"]: r for r in cur.fetchall()}

        cur.execute(
            """SELECT c.channel_name, c.unit, c.redline_low, c.redline_high
               FROM tel_telemetry_channels c JOIN tel_test_runs r ON r.id = c.run_id
               WHERE c.env_id = %s AND c.business_id = %s AND r.run_key = %s""",
            (env_id, str(business_id), STREAM_RUN_KEY))
        meta = {r["channel_name"]: r for r in cur.fetchall()}

        out_channels: list[dict] = []
        if snapshot and snapshot["channels"]:
            for ch in snapshot["channels"]:
                if channels and ch["channel_key"] not in channels:
                    continue
                m = meta.get(ch["channel_key"], {})
                out_channels.append({
                    "channel_name": ch["channel_key"],
                    "unit": m.get("unit"),
                    "redline_low": m.get("redline_low"),
                    "redline_high": m.get("redline_high"),
                    "readings": ch["readings"][-limit_per_channel:],
                    "latest": ch["latest"],
                })
            source = snapshot["source"]
        else:
            # Fallback: silver tail via the live index (worker not running in this process).
            wanted = channels or list(meta.keys())
            for name in wanted:
                cur.execute(
                    """SELECT ts_source, value FROM tel_stream_readings
                       WHERE env_id = %s AND business_id = %s AND channel_name = %s
                         AND quality_flag IN ('ok', 'late')
                       ORDER BY ts_source DESC LIMIT %s""",
                    (env_id, str(business_id), name, limit_per_channel))
                rows = list(reversed(cur.fetchall()))
                if not rows:
                    continue
                m = meta.get(name, {})
                out_channels.append({
                    "channel_name": name,
                    "unit": m.get("unit"),
                    "redline_low": m.get("redline_low"),
                    "redline_high": m.get("redline_high"),
                    "readings": [{"t": r["ts_source"].isoformat(), "v": float(r["value"])} for r in rows],
                    "latest": {"t": rows[-1]["ts_source"].isoformat(), "v": float(rows[-1]["value"])},
                })
            source = "db_tail"

        # recent live model events for anomaly overlays
        cur.execute(
            """SELECT e.channel_name, e.start_t, e.end_t, e.anomaly_class, e.confidence
               FROM tel_anomaly_events e JOIN tel_test_runs r ON r.id = e.run_id
               WHERE e.env_id = %s AND e.business_id = %s AND r.run_key = %s AND e.source = 'model'
               ORDER BY e.created_at DESC LIMIT 20""",
            (env_id, str(business_id), STREAM_RUN_KEY))
        events = [dict(r) for r in cur.fetchall()]

        # Diagnostic inputs (only needed when we have nothing to render).
        null_reason = None
        if not out_channels:
            cur.execute(
                """SELECT count(*) AS n FROM tel_stream_readings_bronze
                   WHERE env_id = %s AND business_id = %s AND ts_ingest > now() - interval '1 minute'""",
                (env_id, str(business_id)))
            bronze_recent = int(cur.fetchone()["n"])
            cur.execute(
                "SELECT count(*) AS n FROM tel_stream_readings WHERE env_id = %s AND business_id = %s",
                (env_id, str(business_id)))
            silver_rows = int(cur.fetchone()["n"])
            cur.execute(
                "SELECT max(watermark_ts) AS wm FROM tel_etl_watermarks WHERE env_id = %s AND job_name LIKE %s",
                (env_id, "%silver%"))
            wm = cur.fetchone()["wm"]
            wm_age = (server_ts - wm).total_seconds() if wm else None
            null_reason = derive_stream_reason(
                worker_present=worker is not None, channels_mapped=bool(meta),
                bronze_rows_recent=bronze_recent, silver_rows=silver_rows, watermark_age_s=wm_age)

    ingest = status_rows.get("stream_ingest")
    return {
        "server_ts": server_ts.isoformat(),
        "source": source,
        "worker_present": worker is not None,
        "pipeline": {
            "status": ingest["status"] if ingest else "unknown",
            "as_of_ts": ingest["as_of_ts"].isoformat() if ingest else None,
            "reason": ingest["reason"] if ingest else "no_status_row",
            "surfaces": {k: {"status": v["status"], "as_of_ts": v["as_of_ts"].isoformat(),
                             "reason": v["reason"]} for k, v in status_rows.items()},
        },
        "channels": out_channels,
        "events": events,
        "null_reason": null_reason,
    }


def stream_health(*, env_id: str, business_id: UUID) -> dict:
    """Stream-health aggregates: per-channel freshness, ingest lag percentiles, rows/min, recent
    assertions, pipeline status, watermark ages. When empty, reports a SPECIFIC actionable reason
    (worker disabled / no frames / watermark stalled / channels unmapped), never a blanket null."""
    from app.db import get_telemetry_cursor as get_cursor
    from app.services.telemetry_stream_ingest import get_stream_worker
    worker_present = get_stream_worker() is not None
    now = datetime.now(timezone.utc)
    with get_cursor() as cur:
        cur.execute(
            """SELECT channel_name, max(ts_source) AS last_ts, count(*) AS n
               FROM tel_stream_readings WHERE env_id = %s AND business_id = %s
               GROUP BY channel_name ORDER BY channel_name""",
            (env_id, str(business_id)))
        freshness = [{"channel_name": r["channel_name"],
                      "last_ts": r["last_ts"].isoformat(),
                      "age_s": round((now - r["last_ts"]).total_seconds(), 1),
                      "rows": int(r["n"])} for r in cur.fetchall()]

        cur.execute(
            """SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY lag) AS p50,
                      percentile_disc(0.95) WITHIN GROUP (ORDER BY lag) AS p95,
                      count(*) AS n
               FROM (SELECT EXTRACT(EPOCH FROM (ts_ingest - ts_source)) AS lag
                     FROM tel_stream_readings_bronze
                     WHERE env_id = %s AND business_id = %s
                       AND ts_ingest > now() - interval '10 minutes') sub""",
            (env_id, str(business_id)))
        lag = cur.fetchone() or {}

        cur.execute(
            """SELECT count(*) AS n FROM tel_stream_readings_bronze
               WHERE env_id = %s AND business_id = %s AND ts_ingest > now() - interval '1 minute'""",
            (env_id, str(business_id)))
        rows_per_min = int(cur.fetchone()["n"])

        cur.execute(
            """SELECT job_name, table_name, assertion_name, passed, observed, threshold, run_ts
               FROM tel_dq_assertions WHERE env_id = %s AND business_id = %s
               ORDER BY run_ts DESC LIMIT 20""",
            (env_id, str(business_id)))
        assertions = [{**dict(r), "run_ts": r["run_ts"].isoformat()} for r in cur.fetchall()]

        cur.execute(
            "SELECT surface, status, as_of_ts, reason FROM tel_pipeline_status WHERE env_id = %s AND business_id = %s",
            (env_id, str(business_id)))
        statuses = [{**dict(r), "as_of_ts": r["as_of_ts"].isoformat()} for r in cur.fetchall()]

        cur.execute(
            "SELECT job_name, watermark_ts, updated_at FROM tel_etl_watermarks WHERE env_id = %s",
            (env_id,))
        wm_rows = cur.fetchall()
        watermarks = [{"job_name": r["job_name"], "watermark_ts": r["watermark_ts"].isoformat(),
                       "age_s": round((now - r["watermark_ts"]).total_seconds(), 1)}
                      for r in wm_rows]

        # Diagnostic inputs: are channels mapped, is any silver present?
        cur.execute(
            """SELECT count(*) AS n FROM tel_telemetry_channels c JOIN tel_test_runs r ON r.id = c.run_id
               WHERE c.env_id = %s AND c.business_id = %s AND r.run_key = %s""",
            (env_id, str(business_id), STREAM_RUN_KEY))
        channels_mapped = int(cur.fetchone()["n"]) > 0

        cur.execute(
            "SELECT count(*) AS n FROM tel_stream_readings WHERE env_id = %s AND business_id = %s",
            (env_id, str(business_id)))
        silver_rows = int(cur.fetchone()["n"])

    silver_wm_age = min((w["age_s"] for w in watermarks if "silver" in w["job_name"]), default=None)
    reason = (None if freshness else derive_stream_reason(
        worker_present=worker_present, channels_mapped=channels_mapped,
        bronze_rows_recent=rows_per_min, silver_rows=silver_rows, watermark_age_s=silver_wm_age))
    return {
        "server_ts": now.isoformat(),
        "worker_present": worker_present,
        "freshness": freshness,
        "ingest_lag_p50_s": float(lag["p50"]) if lag.get("p50") is not None else None,
        "ingest_lag_p95_s": float(lag["p95"]) if lag.get("p95") is not None else None,
        "ingest_lag_sample_n": int(lag.get("n") or 0),
        "rows_per_min": rows_per_min,
        "assertions": assertions,
        "pipeline_status": statuses,
        "watermarks": watermarks,
        "null_reason": reason,
    }


# ── the loop (lifespan background task; operator-sweep pattern) ──────────────────────────────────
async def run_etl_loop(*, env_id: str, business_id: UUID, interval_seconds: int = 60) -> None:
    emit_log(level="info", service="telemetry_stream", action="etl_loop_started",
             message=f"stream ETL loop every {interval_seconds}s")
    while True:
        try:
            merge = await asyncio.to_thread(run_silver_merge, env_id=env_id, business_id=business_id)
            await asyncio.to_thread(run_gold_rollup, env_id=env_id, business_id=business_id)
            await asyncio.to_thread(run_assertions, env_id=env_id, business_id=business_id)
            if merge.get("rows_inserted"):
                await asyncio.to_thread(run_live_scoring, env_id=env_id, business_id=business_id)
        except asyncio.CancelledError:
            emit_log(level="info", service="telemetry_stream", action="etl_loop_stopped",
                     message="stream ETL loop cancelled")
            raise
        except Exception as exc:  # noqa: BLE001 — loop never dies; status carries the failure
            emit_log(level="error", service="telemetry_stream", action="etl_cycle_failed",
                     message=str(exc), error=exc)
            try:
                from app.db import get_telemetry_cursor as get_cursor
                with get_cursor() as cur:
                    set_pipeline_status(cur, env_id=env_id, business_id=business_id,
                                        surface="silver", status="failed", reason=str(exc)[:300])
            except Exception:  # noqa: BLE001
                pass
        await asyncio.sleep(interval_seconds)
