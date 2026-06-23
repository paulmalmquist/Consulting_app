"""Live telemetry stream ingestion (RS Demo streaming slice).

Source adapters behind one interface (`TELEMETRY_STREAM_SOURCE = iss | capture | adsb`):
  * CaptureAdapter  — replays the checked-in recorded ISS session. THE REQUIRED PROOF PATH:
                      CI and the baseline demo run on capture; deterministic, no network.
  * IssLightstreamerAdapter — the live public ISS feed (push.lightstreamer.com / ISSLIVE).
                      Live-mode enhancement once capture is green. Lazy import: the sync
                      lightstreamer lib runs its own session thread; frames cross into the
                      event loop via loop.call_soon_threadsafe.
  * OpenSkyAdapter  — ADS-B fallback exhibit ONLY (labeled as fallback, never the default proof).

The StreamWorker is an asyncio background task started from the FastAPI lifespan (same pattern as the
operator confirm-registry sweep loop in main.py): drain frames -> per-channel ring buffer (last 120 s)
-> micro-batch insert to bronze every 2 s (executemany, one batch_id per flush, day-partition ensured)
-> watchdog (silence > 30 s restarts the adapter; > 60 s flips tel_pipeline_status to 'stale' — the
fail-closed handshake the UI reads; recovery flips it back to 'fresh').

DB access is the sync psycopg pool (app.db.get_cursor) — always called via asyncio.to_thread, never
directly on the event loop. The frozen champion scorer is NOT called here; live scoring happens in the
ETL loop (telemetry_stream_etl.run_live_scoring).
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Protocol

from app.observability.logger import emit_log

_FIXTURE_PATH = Path(__file__).resolve().parent.parent / "data" / "telemetry" / "iss_capture.json"

WATCHDOG_RESTART_S = 30      # silence before the adapter is restarted
WATCHDOG_STALE_S = 60        # silence before the pipeline status flips to 'stale'
FLUSH_INTERVAL_S = 2.0
RING_SECONDS = 120
DOWNSAMPLE_QUEUE_DEPTH = 5000   # backpressure guard: above this, sample 1 Hz per channel


@dataclass(frozen=True)
class Frame:
    channel_key: str
    ts_source: datetime          # receive-time at the adapter (feed's raw timestamp kept in payload)
    value: float | None
    payload: dict
    source: str                  # iss | capture | adsb


class StreamAdapter(Protocol):
    def start(self, emit: Callable[[Frame], None]) -> None: ...
    def stop(self) -> None: ...


# ── Capture adapter: the deterministic proof path ────────────────────────────────────────────────
class CaptureAdapter:
    """Replays the recorded ISS session (real frames, re-based onto the current clock)."""

    def __init__(self, channels: list[str] | None = None, *, speed: float = 1.0,
                 loop_forever: bool = True, fixture_path: Path | None = None) -> None:
        self._channels = set(channels) if channels else None
        self._speed = max(speed, 0.01)
        self._loop_forever = loop_forever
        self._fixture_path = fixture_path or _FIXTURE_PATH
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def load_frames(self) -> list[dict]:
        fixture = json.loads(self._fixture_path.read_text(encoding="utf-8"))
        frames = fixture.get("frames", [])
        if self._channels is not None:
            frames = [f for f in frames if f.get("channel_key") in self._channels]
        return sorted(frames, key=lambda f: f.get("ts_offset_s", 0.0))

    def start(self, emit: Callable[[Frame], None]) -> None:
        self._stop.clear()

        def _run() -> None:
            frames = self.load_frames()
            if not frames:
                return
            while not self._stop.is_set():
                t0 = time.monotonic()
                base = datetime.now(timezone.utc)
                for f in frames:
                    if self._stop.is_set():
                        return
                    target = f.get("ts_offset_s", 0.0) / self._speed
                    delay = target - (time.monotonic() - t0)
                    if delay > 0:
                        self._stop.wait(min(delay, 1.0))
                        if time.monotonic() - t0 < target:
                            continue_wait = target - (time.monotonic() - t0)
                            if continue_wait > 0:
                                self._stop.wait(continue_wait)
                    if self._stop.is_set():
                        return
                    emit(Frame(
                        channel_key=f["channel_key"],
                        ts_source=base + timedelta(seconds=f.get("ts_offset_s", 0.0)),
                        value=f.get("value"),
                        payload={"raw": f.get("raw", {}), "capture": True},
                        source="capture",
                    ))
                if not self._loop_forever:
                    return

        self._thread = threading.Thread(target=_run, name="tel-capture-adapter", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None


# ── ISS Lightstreamer adapter: live-mode enhancement ─────────────────────────────────────────────
class IssLightstreamerAdapter:
    LS_SERVER = "https://push.lightstreamer.com"
    LS_ADAPTER_SET = "ISSLIVE"
    FIELDS = ["TimeStamp", "Value", "Status.Class", "Status.Indicator"]

    def __init__(self, channels: list[str]) -> None:
        self._channels = channels
        self._client = None

    def start(self, emit: Callable[[Frame], None]) -> None:
        # Lazy import: a broken/absent wheel must never take the app down (capture is the floor).
        from lightstreamer.client import LightstreamerClient, Subscription  # type: ignore

        client = LightstreamerClient(self.LS_SERVER, self.LS_ADAPTER_SET)
        sub = Subscription(mode="MERGE", items=self._channels, fields=self.FIELDS)

        class _Listener:
            def onItemUpdate(self, update):  # noqa: N802 (lightstreamer API casing)
                try:
                    raw_value = update.getValue("Value")
                    value = float(raw_value) if raw_value not in (None, "") else None
                except (TypeError, ValueError):
                    value = None
                emit(Frame(
                    channel_key=update.getItemName(),
                    ts_source=datetime.now(timezone.utc),
                    value=value,
                    payload={"raw": {
                        "TimeStamp": update.getValue("TimeStamp"),
                        "Status.Class": update.getValue("Status.Class"),
                    }},
                    source="iss",
                ))

            def __getattr__(self, _name):
                return lambda *a, **k: None

        sub.addListener(_Listener())
        client.subscribe(sub)
        client.connect()
        self._client = client

    def stop(self) -> None:
        if self._client is not None:
            try:
                self._client.disconnect()
            except Exception:  # noqa: BLE001
                pass
            self._client = None


# ── OpenSky adapter: fallback exhibit ONLY (labeled; never the default proof) ────────────────────
class OpenSkyAdapter:
    """Polls OpenSky's public state vectors (5 s); emits altitude/velocity for a few aircraft as
    fallback channels. Demo-day insurance only — always labeled 'adsb fallback' in the UI."""

    POLL_S = 5.0
    URL = "https://opensky-network.org/api/states/all?lamin=33.6&lomin=-119.0&lamax=34.6&lomax=-117.0"

    def __init__(self, channels: list[str] | None = None) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self, emit: Callable[[Frame], None]) -> None:
        import httpx

        self._stop.clear()

        def _run() -> None:
            while not self._stop.is_set():
                try:
                    resp = httpx.get(self.URL, timeout=10)
                    states = (resp.json() or {}).get("states") or []
                    now = datetime.now(timezone.utc)
                    for s in states[:4]:  # a few aircraft: icao24=s[0], alt=s[7], vel=s[9]
                        icao = s[0]
                        if s[7] is not None:
                            emit(Frame(f"ADSB_{icao}_ALT", now, float(s[7]),
                                       {"icao24": icao, "fallback": True}, "adsb"))
                        if s[9] is not None:
                            emit(Frame(f"ADSB_{icao}_VEL", now, float(s[9]),
                                       {"icao24": icao, "fallback": True}, "adsb"))
                except Exception:  # noqa: BLE001
                    pass
                self._stop.wait(self.POLL_S)

        self._thread = threading.Thread(target=_run, name="tel-adsb-adapter", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None


def make_adapter(source: str, channels: list[str]) -> StreamAdapter:
    if source == "iss":
        return IssLightstreamerAdapter(channels)
    if source == "adsb":
        return OpenSkyAdapter(channels)
    return CaptureAdapter(channels)


# ── The worker ────────────────────────────────────────────────────────────────────────────────────
class StreamWorker:
    def __init__(self, *, env_id: str, business_id: str, source: str = "capture",
                 channels: list[str] | None = None,
                 flush_interval_s: float = FLUSH_INTERVAL_S, ring_seconds: int = RING_SECONDS) -> None:
        self.env_id = env_id
        self.business_id = business_id
        self.source = source
        self.channels = channels or []
        self.flush_interval_s = flush_interval_s
        self.ring_seconds = ring_seconds

        self._queue: asyncio.Queue[Frame] = asyncio.Queue()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._adapter: StreamAdapter | None = None
        self._ring: dict[str, deque[tuple[datetime, float]]] = {}
        self._latest: dict[str, tuple[datetime, float]] = {}
        self.last_frame_at: datetime | None = None
        self.started_at: datetime | None = None
        self._stale = False
        self._stopping = False
        self._ensured_partitions: set[str] = set()
        self._downsample_last: dict[str, float] = {}

    # — emit callback (called from adapter threads) —
    def _emit(self, frame: Frame) -> None:
        if self._loop is None or self._stopping:
            return
        if self._queue.qsize() > DOWNSAMPLE_QUEUE_DEPTH:
            # Backpressure: sample 1 Hz per channel; visible in Stream Health, never silent.
            now = time.monotonic()
            last = self._downsample_last.get(frame.channel_key, 0.0)
            if now - last < 1.0:
                return
            self._downsample_last[frame.channel_key] = now
        self._loop.call_soon_threadsafe(self._queue.put_nowait, frame)

    # — main loop —
    async def run(self) -> None:
        self._loop = asyncio.get_running_loop()
        self.started_at = datetime.now(timezone.utc)
        self._adapter = make_adapter(self.source, self.channels)
        self._adapter.start(self._emit)
        emit_log(level="info", service="telemetry_stream", action="worker_started",
                 message=f"stream worker started source={self.source}")
        buffer: list[Frame] = []
        last_flush = time.monotonic()
        try:
            while not self._stopping:
                timeout = max(0.05, self.flush_interval_s - (time.monotonic() - last_flush))
                try:
                    frame = await asyncio.wait_for(self._queue.get(), timeout=timeout)
                    buffer.append(frame)
                    self._ingest_to_ring(frame)
                except asyncio.TimeoutError:
                    pass
                if time.monotonic() - last_flush >= self.flush_interval_s:
                    if buffer:
                        rows, buffer = buffer, []
                        try:
                            await asyncio.to_thread(self._flush_bronze, rows)
                        except Exception as exc:  # noqa: BLE001
                            emit_log(level="error", service="telemetry_stream",
                                     action="bronze_flush_failed", message=str(exc), error=exc)
                    await self._watchdog()
                    last_flush = time.monotonic()
        except asyncio.CancelledError:
            pass
        finally:
            if self._adapter:
                self._adapter.stop()
            emit_log(level="info", service="telemetry_stream", action="worker_stopped",
                     message="stream worker stopped")

    def _ingest_to_ring(self, frame: Frame) -> None:
        if frame.value is None:
            return
        self.last_frame_at = datetime.now(timezone.utc)
        ring = self._ring.setdefault(frame.channel_key, deque())
        ring.append((frame.ts_source, frame.value))
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.ring_seconds)
        while ring and ring[0][0] < cutoff:
            ring.popleft()
        self._latest[frame.channel_key] = (frame.ts_source, frame.value)

    # — sync DB work (always via asyncio.to_thread) —
    def _flush_bronze(self, rows: list[Frame]) -> None:
        from app.db import get_telemetry_cursor as get_cursor
        batch_id = str(uuid.uuid4())
        with get_cursor() as cur:
            self._ensure_partitions(cur)
            cur.executemany(
                """INSERT INTO tel_stream_readings_bronze
                     (env_id, business_id, source, channel_key, ts_source, value, payload, batch_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)""",
                [(self.env_id, self.business_id, f.source, f.channel_key, f.ts_source,
                  f.value, json.dumps(f.payload, default=str), batch_id) for f in rows])
            cur.execute(
                """INSERT INTO tel_pipeline_status (env_id, business_id, surface, status, as_of_ts, reason)
                   VALUES (%s, %s, 'stream_ingest', 'fresh', now(), NULL)
                   ON CONFLICT (env_id, surface)
                   DO UPDATE SET status = 'fresh', as_of_ts = now(), reason = NULL""",
                (self.env_id, self.business_id))
        if self._stale:
            self._stale = False
            emit_log(level="info", service="telemetry_stream", action="stream_recovered",
                     message="frames flowing again; pipeline status fresh")

    def _ensure_partitions(self, cur) -> None:
        from datetime import date
        for day in (date.today(), date.today() + timedelta(days=1)):
            key = day.isoformat()
            if key in self._ensured_partitions:
                continue
            pname = f"tel_stream_readings_bronze_{day.strftime('%Y_%m_%d')}"
            cur.execute(
                f"""DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '{pname}') THEN
                        EXECUTE format(
                          'CREATE TABLE %I PARTITION OF tel_stream_readings_bronze FOR VALUES FROM (%L) TO (%L)',
                          '{pname}', '{day.isoformat()}', '{(day + timedelta(days=1)).isoformat()}');
                    END IF;
                END $$;""")
            self._ensured_partitions.add(key)

    async def _watchdog(self) -> None:
        if self.last_frame_at is None:
            ref = self.started_at
        else:
            ref = self.last_frame_at
        if ref is None:
            return
        silence = (datetime.now(timezone.utc) - ref).total_seconds()
        if silence > WATCHDOG_STALE_S and not self._stale:
            self._stale = True
            reason = f"no frames since {ref.isoformat()}"
            emit_log(level="error", service="telemetry_stream", action="stream_stale", message=reason)
            try:
                await asyncio.to_thread(self._set_status_sync, "stale", reason)
            except Exception as exc:  # noqa: BLE001
                emit_log(level="error", service="telemetry_stream",
                         action="status_write_failed", message=str(exc), error=exc)
        elif silence > WATCHDOG_RESTART_S and self._adapter is not None and not self._stale:
            emit_log(level="warn", service="telemetry_stream", action="adapter_restart",
                     message=f"{int(silence)}s of silence; restarting {self.source} adapter")
            try:
                self._adapter.stop()
                self._adapter.start(self._emit)
            except Exception as exc:  # noqa: BLE001
                emit_log(level="error", service="telemetry_stream",
                         action="adapter_restart_failed", message=str(exc), error=exc)

    def _set_status_sync(self, status: str, reason: str | None) -> None:
        from app.db import get_telemetry_cursor as get_cursor
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO tel_pipeline_status (env_id, business_id, surface, status, as_of_ts, reason)
                   VALUES (%s, %s, 'stream_ingest', %s, now(), %s)
                   ON CONFLICT (env_id, surface)
                   DO UPDATE SET status = EXCLUDED.status, as_of_ts = now(), reason = EXCLUDED.reason""",
                (self.env_id, self.business_id, status, reason))

    # — read API for the routes —
    def snapshot_live(self, channels: list[str] | None = None) -> dict:
        keys = channels or sorted(self._ring.keys())
        out = []
        for k in keys:
            ring = self._ring.get(k)
            if not ring:
                continue
            out.append({
                "channel_key": k,
                "readings": [{"t": ts.isoformat(), "v": v} for ts, v in list(ring)],
                "latest": ({"t": self._latest[k][0].isoformat(), "v": self._latest[k][1]}
                           if k in self._latest else None),
            })
        return {
            "source": self.source,
            "stale": self._stale,
            "last_frame_at": self.last_frame_at.isoformat() if self.last_frame_at else None,
            "channels": out,
        }

    def switch_source(self, source: str) -> dict:
        if source not in ("iss", "capture", "adsb"):
            raise ValueError("source must be iss | capture | adsb")
        old = self.source
        if self._adapter:
            self._adapter.stop()
        self.source = source
        self._adapter = make_adapter(source, self.channels)
        self._adapter.start(self._emit)
        emit_log(level="info", service="telemetry_stream", action="source_switched",
                 message=f"{old} -> {source}")
        return {"previous": old, "source": source}

    async def stop(self) -> None:
        self._stopping = True


# ── module singleton (set by the lifespan) ───────────────────────────────────────────────────────
_worker: StreamWorker | None = None


def set_stream_worker(worker: StreamWorker | None) -> None:
    global _worker
    _worker = worker


def get_stream_worker() -> StreamWorker | None:
    return _worker
