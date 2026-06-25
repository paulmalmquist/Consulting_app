"""Stargate bridge core — Kafka (or capture replay) into ring buffers for SSE.

Ships in backend/app/services so it deploys with the Railway backend (mounted
behind STARGATE_BRIDGE_ENABLED, default off — see app/main.py). The route
surface (FastAPI APIRouter + the standalone create_app factory) lives in
app/routes/stargate_bridge.py. Live state is the in-memory ring buffers only —
no Postgres in this lane.

Modes:
  cloud    consume Confluent Cloud; agg/anomaly topics are populated by the
           managed Flink statements (PR 4).
  local    consume local Redpanda; no Flink exists locally, so an in-process
           5s tumbling aggregator fills the agg/anomaly buffers, labeled
           "local-emulation" in /stargate/health — the fallback is visible,
           never silent.
  capture  no broker at all: preload + replay a recorded fixture. This is the
           CI path, the laptop demo floor, AND the only mode supported in the
           Railway image — broker modes need confluent-kafka + proto_gen, which
           ship only in the laptop tooling venv, so consume_forever there fails
           visibly (consumer_alive: false) rather than silently.

SSE protocol: each event is one JSON frame
  {server_ts_ms, mode, telemetry: [...], agg: [...], anomalies: [...],
   dlq: [...], dlq_count, health: {...}}
carrying only items the connection has not seen yet (per-connection cursors),
telemetry downsampled to <= MAX_POINTS_PER_PRINTER per printer per frame.

Import purity (load-bearing — do not break it): this module imports only stdlib
+ anyio + app.services.stargate_signal_mapping, and (lazily, broker modes only)
app.events.protobuf_codec + the scripts-dir proto_gen. It must NEVER import
app.config or app.observability: app/config.py hard-exits without DATABASE_URL,
and the laptop tooling venv has none, so a config import here would kill
`uvicorn bridge:app`.
"""

from __future__ import annotations

import base64
import json
import os
import threading
import time
from collections import defaultdict, deque
from pathlib import Path

import anyio

import app.services.stargate_signal_mapping as sm


class StargateTopics:
    TELEMETRY = "stargate.printer.telemetry.v1"
    AGG_5S = "stargate.printer.telemetry.agg5s.v1"
    ANOMALIES = "stargate.printer.anomalies.v1"
    DEAD_LETTER = "stargate.printer.dlq.v1"
    # AI-triage output (Confluent Streaming Agent explains upstream anomalies; it
    # is not the detector). Consumed by the durable serving-slice consumer, not
    # the in-memory SSE bridge below.
    TRIAGE = "stargate.printer.anomaly.triage.v1"


def telemetry_message_class():
    """The generated protobuf message class (lazy — broker modes only; resolvable
    only where the scripts dir is on sys.path, i.e. the laptop tooling venv)."""
    from proto_gen.stargate_telemetry_pb2 import StargateTelemetry

    return StargateTelemetry

FRAME_INTERVAL_S = 0.10
MAX_POINTS_PER_PRINTER = 20
SNAPSHOT_TELEMETRY_TAIL = 600
# Fixed epoch for capture preload so two cold starts produce byte-identical
# buffers (the determinism check in tests and the verification table).
CAPTURE_BASE_MS = 1_700_000_000_000

RING_SIZES = {"telemetry": 2000, "agg": 240, "anomalies": 200, "dlq": 100}

# Live "Rules vs baseline" lane: per-printer recent history feeds the rolling-MAD baseline scorer
# and the 5s/15s/60s feature windows. RESCORE_EVERY bounds the recompute cost so a cloud-rate stream
# does not score on every point (it always rescores when the hard rule fires, so anomalies are exact).
RECENT_MAXLEN = 700                # ~60s+ of one printer's points at replay cadence
SCORE_WINDOW_POINTS = 60           # trailing temps fed to the champion (matches the live ETL)
RESCORE_EVERY = 5                  # rescore at most every Nth point per printer (rule fire forces it)


def _durable_enabled() -> bool:
    """The durable sink is default OFF. When off, the bridge never imports app.db (purity preserved)."""
    return os.environ.get("STARGATE_DURABLE_SINK_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def _sample_n() -> int:
    """Raw telemetry is deterministically sampled (offset % N) for the durable sink; anomalies / agg5s /
    DLQ persist in full."""
    try:
        return max(1, int(os.environ.get("STARGATE_SINK_SAMPLE_N", "20")))
    except ValueError:
        return 20


class SeqRing:
    """Fixed-length ring with a monotonic sequence number, so each SSE
    connection can cursor through items without re-sending or deduping."""

    def __init__(self, maxlen: int) -> None:
        self.maxlen = maxlen
        self._items: list[tuple[int, dict]] = []
        self._next_seq = 0
        self._lock = threading.Lock()

    def append(self, item: dict) -> int:
        with self._lock:
            seq = self._next_seq
            self._next_seq += 1
            self._items.append((seq, item))
            if len(self._items) > self.maxlen:
                self._items = self._items[-self.maxlen:]
            return seq

    def since(self, cursor: int) -> tuple[list[dict], int]:
        with self._lock:
            fresh = [item for seq, item in self._items if seq >= cursor]
            return fresh, self._next_seq

    def tail(self, n: int) -> list[dict]:
        with self._lock:
            return [item for _, item in self._items[-n:]]

    def __len__(self) -> int:
        with self._lock:
            return len(self._items)


class BridgeState:
    def __init__(self, mode: str) -> None:
        self.mode = mode
        self.rings = {name: SeqRing(size) for name, size in RING_SIZES.items()}
        self.aggregator = sm.TumblingAggregator()
        self.aggregator_mw = sm.MultiWindowAggregator()
        self.started_at = time.time()
        self.msgs_in = 0
        self.last_message_ts = 0.0
        self._rate_window: list[float] = []
        self.consumer_alive = False
        # Rules-vs-baseline lane state. _recent holds each printer's trailing points (for the scorer +
        # feature windows); _scored is the latest scored snapshot per printer (drives the live lane,
        # including the case where the baseline flags REVIEW BEFORE the hard rule fires); _offsets is
        # the per-partition synthetic Kafka offset counter for capture-mode provenance.
        self._recent: dict[str, deque] = {}
        self._scored: dict[str, dict] = {}
        # Per-(topic, partition) synthetic Kafka offset counter for capture-mode provenance. Each record
        # kind lives on its own topic (telemetry / anomalies / agg5s / dlq), so their coordinates never
        # collide on the durable UNIQUE (env, business, topic, partition, offset).
        self._offsets: dict[tuple[str, int], int] = defaultdict(int)
        self._since_score: dict[str, int] = defaultdict(int)

    def _next_offset(self, topic: str, partition: int) -> int:
        key = (topic, partition)
        offset = self._offsets[key]
        self._offsets[key] += 1
        return offset

    # -- ingest -------------------------------------------------------------

    def ingest_telemetry(self, record: dict, *, emulate_flink: bool, now_ms: int | None = None,
                         kafka_meta: dict | None = None) -> None:
        printer_id = record.get("printer_id", "?")
        ts_us = int(record.get("ts_us", 0))

        # Telemetry-topic coordinate. Real ones arrive via kafka_meta (broker modes, wired in the cloud
        # pass); in capture/replay they are deterministically synthesized and labeled synthetic.
        if kafka_meta is not None:
            tel_partition = int(kafka_meta["partition"])
            tel_offset = int(kafka_meta["offset"])
            schema_id = kafka_meta.get("schema_id")
            synthetic = False
        else:
            tel_partition = sm.synthetic_partition(printer_id)
            tel_offset = self._next_offset(StargateTopics.TELEMETRY, tel_partition)
            schema_id = None
            synthetic = True

        self.rings["telemetry"].append(record)
        self._mark_in()

        dq = self._recent.setdefault(printer_id, deque(maxlen=RECENT_MAXLEN))
        dq.append(record)

        rule_fired = sm.is_anomalous(record["melt_pool_temp_c"], record["arm_vibration_g"])
        # Rescore on a cadence so a cloud-rate stream doesn't recompute per point — but always rescore
        # when the rule fires (so every anomaly carries an exact score) or before the first scored frame.
        self._since_score[printer_id] += 1
        if rule_fired or printer_id not in self._scored or self._since_score[printer_id] >= RESCORE_EVERY:
            self._since_score[printer_id] = 0
            self._scored[printer_id] = self._build_scored(printer_id, record, ts_us, rule_fired, list(dq))

        durable = _durable_enabled()
        # Durable: raw telemetry, deterministically sampled (anomalies / agg5s / dlq persist in full below).
        if durable and tel_offset % _sample_n() == 0:
            tel_prov = self._provenance(record, printer_id, tel_partition, tel_offset, schema_id, synthetic,
                                        StargateTopics.TELEMETRY)
            self._sink("telemetry_sample", record, tel_prov,
                       printer_id=printer_id, print_job_id=record.get("print_job_id"))

        if rule_fired:
            snap = self._scored[printer_id]
            routing = {"routed_to": "anomalies", "reason": "cold_melt_pool_and_high_vibration"}
            # The anomaly belongs to the anomalies topic (Flink routes it there), so it gets its OWN
            # coordinate — never the telemetry coordinate (which would collide on the durable UNIQUE).
            an_partition = sm.synthetic_partition(printer_id)
            an_offset = self._next_offset(StargateTopics.ANOMALIES, an_partition)
            an_prov = self._provenance(record, printer_id, an_partition, an_offset, None, True,
                                       StargateTopics.ANOMALIES)
            self.rings["anomalies"].append({
                "printer_id": printer_id,
                "ts_us": ts_us,
                "layer": record["layer"],
                "print_job_id": record["print_job_id"],
                "melt_pool_temp_c": record["melt_pool_temp_c"],
                "arm_vibration_g": record["arm_vibration_g"],
                "rule": snap["rule"],
                "scorer": snap["scorer"],
                "feature_window": snap["feature_window"],
                "routing": routing,
                "provenance": an_prov,
            })
            if durable:
                self._sink("anomaly", record, an_prov, printer_id=printer_id,
                           print_job_id=record.get("print_job_id"), normalized={
                               "rule": snap["rule"], "scorer": snap["scorer"],
                               "feature_window": snap["feature_window"], "routing": routing})
        if emulate_flink:
            self.aggregator.add(
                record["printer_id"], record["ts_us"],
                record["melt_pool_temp_c"], record["arm_vibration_g"],
            )
            flush_at = now_ms if now_ms is not None else int(time.time() * 1000)
            for row in self.aggregator.flush_closed(flush_at):
                self.rings["agg"].append(row)
                if durable:
                    self._sink_agg(row)

    def _build_scored(self, printer_id: str, record: dict, ts_us: int, rule_fired: bool,
                      recent: list[dict]) -> dict:
        """The per-printer Rules-vs-baseline snapshot: the hard-rule result beside the baseline scorer,
        plus the 5s/15s/60s feature windows. The scorer is the rolling-MAD baseline — never an LSTM."""
        temps = [float(r["melt_pool_temp_c"]) for r in recent[-SCORE_WINDOW_POINTS:]]
        return {
            "printer_id": printer_id,
            "ts_us": ts_us,
            "rule": {
                "fired": rule_fired,
                "predicate": sm.PREDICATE_TEXT,
                "temp_c": record["melt_pool_temp_c"],
                "vib_g": record["arm_vibration_g"],
            },
            "scorer": sm.score_baseline(temps),
            "feature_window": self.aggregator_mw.features(recent, ts_us) if ts_us else {},
        }

    def _provenance(self, record: dict, printer_id: str, partition: int, offset: int,
                    schema_id: int | None, synthetic: bool,
                    topic: str = StargateTopics.TELEMETRY) -> dict:
        source = {"capture": "recorded_capture", "cloud": "confluent_cloud",
                  "local": "local_redpanda"}.get(self.mode, "recorded_capture")
        return {
            "provenance_source": source,
            "kafka_topic": topic,
            "kafka_partition": partition,
            "kafka_offset": offset,
            "schema_id": schema_id,
            "schema_null_reason": sm.CAPTURE_SCHEMA_NULL_REASON if synthetic else None,
            "capture_id": record.get("capture_id"),
            "synthetic": synthetic,
        }

    # -- durable sink (gated, lazy, best-effort — never breaks the SSE hot path) ----------

    def _sink(self, record_kind: str, decoded: dict, provenance: dict, *,
              normalized: dict | None = None, printer_id: str | None = None,
              print_job_id: str | None = None) -> None:
        """Persist one durable row when STARGATE_DURABLE_SINK_ENABLED. Lazy-imports app.db ONLY here, so
        the bridge stays import-pure when the sink is off. Any DB failure is swallowed: the live stream
        must never break because a durable write failed."""
        try:
            from app.db import get_telemetry_cursor   # lazy: reached only when the sink is enabled
            from app.services import telemetry_stream_consumer as sink

            env_id = os.environ.get("STARGATE_SINK_ENV_ID", "telemetry-demo")
            business_id = os.environ.get("STARGATE_SINK_BUSINESS_ID",
                                         "7e1eb000-0000-4000-a000-000000000001")
            with get_telemetry_cursor() as cur:
                sink.persist_kafka_row(
                    cur, env_id=env_id, business_id=business_id, record_kind=record_kind,
                    provenance=provenance, decoded_payload=decoded, normalized_payload=normalized,
                    printer_id=printer_id, print_job_id=print_job_id)
        except Exception:
            pass  # best-effort; the SSE hot path is never blocked by a durable-sink failure

    def _sink_agg(self, row: dict) -> None:
        printer_id = row.get("printer_id")
        partition = sm.synthetic_partition(printer_id or "?")
        offset = self._next_offset(StargateTopics.AGG_5S, partition)
        prov = self._provenance(row, printer_id or "?", partition, offset, None, True, StargateTopics.AGG_5S)
        self._sink("agg5s", row, prov, printer_id=printer_id)

    def ingest_dlq(self, topic: str, reason: str, raw: bytes) -> None:
        entry = {
            "ts_ms": int(time.time() * 1000),
            "topic": topic,
            "reason": reason,
            "raw_preview": base64.b64encode(raw[:64]).decode("ascii"),
            "raw_bytes": len(raw),
        }
        self.rings["dlq"].append(entry)
        if _durable_enabled():
            partition = 0
            offset = self._next_offset(StargateTopics.DEAD_LETTER, partition)
            prov = self._provenance(entry, "?", partition, offset, None, True, StargateTopics.DEAD_LETTER)
            self._sink("dlq", entry, prov)

    def _mark_in(self) -> None:
        self.msgs_in += 1
        now = time.time()
        self.last_message_ts = now
        self._rate_window.append(now)
        if len(self._rate_window) > 5000:
            self._rate_window = self._rate_window[-2500:]

    # -- views --------------------------------------------------------------

    def aggregation_source(self) -> str:
        if self.mode == "cloud":
            return "flink"
        if self.mode == "local":
            return "local-emulation"
        return "capture"

    def health(self) -> dict:
        now = time.time()
        recent = [t for t in self._rate_window if now - t <= 5.0]
        return {
            "mode": self.mode,
            "aggregation_source": self.aggregation_source(),
            "consumer_alive": self.consumer_alive,
            "msgs_in_total": self.msgs_in,
            "msgs_in_per_sec": round(len(recent) / 5.0, 1),
            "last_message_age_ms": (
                int((now - self.last_message_ts) * 1000) if self.last_message_ts else None
            ),
            "dlq_count": len(self.rings["dlq"]),
            "buffers": {name: len(ring) for name, ring in self.rings.items()},
            "uptime_s": round(now - self.started_at, 1),
        }

    def snapshot(self) -> dict:
        return {
            "mode": self.mode,
            "server_ts_ms": int(time.time() * 1000),
            "telemetry": self.rings["telemetry"].tail(SNAPSHOT_TELEMETRY_TAIL),
            "agg": self.rings["agg"].tail(RING_SIZES["agg"]),
            "anomalies": self.rings["anomalies"].tail(RING_SIZES["anomalies"]),
            "dlq": self.rings["dlq"].tail(RING_SIZES["dlq"]),
            "dlq_count": len(self.rings["dlq"]),
            "scored": self.scored_view(),
            "health": self.health(),
        }

    def scored_view(self) -> list[dict]:
        """Current Rules-vs-baseline state, one entry per printer. Tiny (<= printer count), so it rides
        every SSE frame in full — it is current state, not a cursored stream of events."""
        return [self._scored[pid] for pid in sorted(self._scored)]


# -- capture mode -------------------------------------------------------------

def fixture_path() -> Path:
    """The single definition of the capture fixture location (reader + the
    capture_fixture.py writer both call this). Default ships inside app/data so
    it lands in the Railway image; STARGATE_CAPTURE_PATH overrides it."""
    override = os.getenv("STARGATE_CAPTURE_PATH", "")
    if override:
        return Path(override)
    # this module is backend/app/services/stargate_bridge.py -> parents[1] = backend/app
    return Path(__file__).resolve().parents[1] / "data" / "stargate" / "replay_capture.jsonl"


def load_fixture_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def parse_fixture_line(line: str) -> tuple[str, int, dict | None]:
    """-> (kind, offset_ms, record). Unparseable or explicitly bad lines are the
    DLQ path — the fixture deliberately contains both."""
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return "bad", 0, None
    if not isinstance(obj, dict) or obj.get("kind") not in ("telemetry", "bad"):
        return "bad", int(obj.get("offset_ms", 0)) if isinstance(obj, dict) else 0, None
    if obj["kind"] == "bad":
        return "bad", int(obj.get("offset_ms", 0)), None
    return "telemetry", int(obj.get("offset_ms", 0)), obj.get("data")


def preload_capture(state: BridgeState, lines: list[str]) -> None:
    """Deterministic cold-start state: every fixture line lands in the buffers
    with timestamps rebased onto the fixed CAPTURE_BASE_MS epoch."""
    max_offset = 0
    for line in lines:
        kind, offset_ms, record = parse_fixture_line(line)
        max_offset = max(max_offset, offset_ms)
        if kind == "bad" or record is None:
            state.ingest_dlq(StargateTopics.TELEMETRY, "unparseable capture line", line.encode("utf-8"))
            continue
        rebased = dict(record)
        rebased["ts_us"] = (CAPTURE_BASE_MS + offset_ms) * 1000
        state.ingest_telemetry(rebased, emulate_flink=True, now_ms=CAPTURE_BASE_MS + offset_ms)
    # Close every remaining window so the preloaded agg state is complete.
    for row in state.aggregator.flush_closed(CAPTURE_BASE_MS + max_offset + 10 * 60 * 1000):
        state.rings["agg"].append(row)


async def replay_capture_forever(state: BridgeState, lines: list[str]) -> None:
    """Demo autoplay: loop the fixture on wall-clock time so the dashboard keeps
    moving. Preload already established history; this keeps the present alive."""
    parsed = [parse_fixture_line(line) for line in lines]
    parsed = [(k, off, rec) for k, off, rec in parsed]
    while True:
        loop_start = time.time()
        last_offset = 0
        for kind, offset_ms, record in parsed:
            delay = (offset_ms - last_offset) / 1000.0
            last_offset = offset_ms
            if delay > 0:
                await anyio.sleep(delay)
            now_ms = int(time.time() * 1000)
            if kind == "bad" or record is None:
                state.ingest_dlq(StargateTopics.TELEMETRY, "unparseable capture line (replay)", b"<capture>")
                continue
            live = dict(record)
            live["ts_us"] = now_ms * 1000
            state.ingest_telemetry(live, emulate_flink=True, now_ms=now_ms)
        # brief gap between loops so job boundaries stay visible
        await anyio.sleep(max(0.5, 2.0 - (time.time() - loop_start) % 2.0))


# -- broker modes --------------------------------------------------------------

def loads_registry_json(raw: bytes) -> dict:
    """JSON rows from managed Flink sinks arrive json-registry framed (magic
    byte + 4-byte schema id before the JSON). Accept both framed and plain."""
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        if len(raw) > 5 and raw[0] == 0:
            return json.loads(raw[5:])
        raise


def consume_forever(state: BridgeState) -> None:
    """Daemon thread: consume the Stargate topics. Telemetry decode failures are
    routed to the DLQ topic (best-effort) AND surfaced in the DLQ buffer."""
    from confluent_kafka import Consumer, Producer
    from confluent_kafka.serialization import MessageField, SerializationContext

    from app.events.protobuf_codec import build_confluent_conf, build_protobuf_deserializer

    deserializer = build_protobuf_deserializer(telemetry_message_class())
    ctx = SerializationContext(StargateTopics.TELEMETRY, MessageField.VALUE)

    topics = [StargateTopics.TELEMETRY, StargateTopics.DEAD_LETTER]
    if state.mode == "cloud":
        topics += [StargateTopics.AGG_5S, StargateTopics.ANOMALIES]

    consumer = Consumer(build_confluent_conf(group_id=f"stargate-bridge-{int(time.time())}"))
    consumer.subscribe(topics)
    dlq_producer = Producer(build_confluent_conf())
    state.consumer_alive = True
    emulate = state.mode == "local"

    try:
        while True:
            msg = consumer.poll(0.2)
            if emulate:
                for row in state.aggregator.flush_closed(int(time.time() * 1000)):
                    state.rings["agg"].append(row)
            if msg is None or msg.error():
                continue
            topic = msg.topic()
            raw = msg.value() or b""
            if topic == StargateTopics.TELEMETRY:
                try:
                    decoded = deserializer(raw, ctx)
                    record = {
                        "printer_id": decoded.printer_id,
                        "ts_us": decoded.ts_us,
                        "layer": decoded.layer,
                        "print_job_id": decoded.print_job_id,
                        "x": decoded.x, "y": decoded.y, "z": decoded.z,
                        "melt_pool_temp_c": decoded.melt_pool_temp_c,
                        "deposition_rate_kg_hr": decoded.deposition_rate_kg_hr,
                        "arm_vibration_g": decoded.arm_vibration_g,
                    }
                except Exception as exc:  # corrupted payload -> DLQ, never crash
                    state.ingest_dlq(topic, f"deserialize failed: {exc!r}"[:200], raw)
                    try:
                        dlq_producer.produce(StargateTopics.DEAD_LETTER, value=raw)
                        dlq_producer.poll(0)
                    except Exception:
                        pass  # DLQ publish is best-effort; the buffer entry is the record
                    continue
                state.ingest_telemetry(record, emulate_flink=emulate)
            elif topic == StargateTopics.DEAD_LETTER:
                state.ingest_dlq(topic, "routed to DLQ topic", raw)
            elif topic == StargateTopics.AGG_5S:
                try:
                    state.rings["agg"].append(loads_registry_json(raw))
                except (json.JSONDecodeError, UnicodeDecodeError):
                    state.ingest_dlq(topic, "agg row not JSON", raw)
            elif topic == StargateTopics.ANOMALIES:
                try:
                    state.rings["anomalies"].append(loads_registry_json(raw))
                except (json.JSONDecodeError, UnicodeDecodeError):
                    state.ingest_dlq(topic, "anomaly row not JSON", raw)
    finally:
        state.consumer_alive = False
        consumer.close()


# -- app ------------------------------------------------------------------------

def downsample_per_printer(items: list[dict], max_per_printer: int) -> list[dict]:
    by_printer: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        by_printer[item.get("printer_id", "?")].append(item)
    out: list[dict] = []
    for printer_items in by_printer.values():
        if len(printer_items) <= max_per_printer:
            out.extend(printer_items)
        else:
            step = len(printer_items) / max_per_printer
            picked = [printer_items[int(i * step)] for i in range(max_per_printer - 1)]
            picked.append(printer_items[-1])  # always keep the newest point
            out.extend(picked)
    out.sort(key=lambda r: r.get("ts_us", 0))
    return out


# -- startup helpers (shared by main.py's lifespan and the standalone factory) --

def resolve_mode() -> str:
    """STARGATE_MODE from env, defaulted/validated; sets local-broker defaults."""
    mode = os.getenv("STARGATE_MODE", "capture").strip().lower()
    if mode not in ("cloud", "local", "capture"):
        mode = "capture"
    if mode == "local":
        os.environ.setdefault("CONFLUENT_BOOTSTRAP_SERVERS", "localhost:9092")
        os.environ.setdefault("CONFLUENT_SR_URL", "http://localhost:8081")
    return mode


def resolve_autoplay() -> bool:
    return os.getenv("STARGATE_CAPTURE_AUTOPLAY", "1") != "0"


def initialize(state: "BridgeState") -> list[str] | None:
    """Bring a fresh BridgeState online for its mode.

    capture -> preload the fixture and RETURN its lines (the caller owns the
    event loop, so it creates the replay_capture_forever task itself when
    autoplay is on). broker modes -> spawn the daemon consumer thread and
    return None. Keeping the autoplay task creation with the caller means this
    works identically from main.py's lifespan and from create_app's lifespan.
    """
    if state.mode == "capture":
        lines = load_fixture_lines(fixture_path())
        preload_capture(state, lines)
        return lines
    threading.Thread(target=consume_forever, args=(state,), daemon=True).start()
    return None
