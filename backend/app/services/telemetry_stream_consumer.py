"""Durable Kafka serving-slice consumer for the Stargate telemetry lineage lane.

Subscribes to the Stargate Confluent topics + the AI-triage topic and persists a
SERVING/PROVENANCE slice into the 10034 tables so the lineage drawer can prove
"this row came from this topic / partition / offset, this schema, and landed in
this Postgres row":

    stargate.printer.telemetry.v1        -> tel_stream_kafka_rows (record_kind=telemetry_sample, SAMPLED)
    stargate.printer.telemetry.agg5s.v1  -> tel_stream_kafka_rows (record_kind=agg5s, full)
    stargate.printer.anomalies.v1        -> tel_stream_kafka_rows (record_kind=anomaly, full)
    stargate.printer.anomaly.triage.v1   -> tel_stream_kafka_rows (record_kind=triage) + tel_stream_triage_events
    stargate.printer.dlq.v1              -> tel_stream_kafka_rows (record_kind=dlq, full)

Honesty boundary: the Postgres serving slice (Lakebase prod / Supabase local) is NOT the raw lake.
Raw telemetry is deterministically sampled (kafka_offset % RAW_SAMPLE_RATE == 0); anomalies, agg5s,
triage, and dlq persist in full. Databricks/Delta pointers stay 'not_available' until a Stargate->Delta
mapping exists — we never fabricate a Delta pointer or a Kafka offset.

This is independent of the in-memory SSE bridge (stargate_bridge.consume_forever), which is unchanged.
Default off (TELEMETRY_KAFKA_CONSUMER_ENABLED). At-least-once: persist within the handler, THEN commit
the Kafka offset. Replay-safe via the 10034 UNIQUE on the Kafka coordinate.

Runtime shape: an asyncio worker (run()) that drives the blocking confluent_kafka poll loop through
asyncio.to_thread, so shutdown/cancel is uniform with the other telemetry tasks in main.py lifespan.
All confluent_kafka imports are lazy — importing this module is always safe even where the broker
client is not installed (the backend image does not ship confluent-kafka).
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.observability.logger import emit_log

# record_kind values (must match the 10034 CHECK constraint).
KIND_TELEMETRY = "telemetry_sample"
KIND_AGG5S = "agg5s"
KIND_ANOMALY = "anomaly"
KIND_TRIAGE = "triage"
KIND_DLQ = "dlq"

# Reason strings (fail-closed lineage — explicit, never inferred).
SCHEMA_SUBJECT_UNAVAILABLE = "schema_subject_lookup_unavailable"
CONSUMER_UNAVAILABLE = "kafka_consumer_unavailable"


def topic_record_kind(topic: str) -> str | None:
    """Map a Stargate topic to its 10034 record_kind, or None if not handled."""
    from app.services.stargate_bridge import StargateTopics
    return {
        StargateTopics.TELEMETRY: KIND_TELEMETRY,
        StargateTopics.AGG_5S: KIND_AGG5S,
        StargateTopics.ANOMALIES: KIND_ANOMALY,
        StargateTopics.TRIAGE: KIND_TRIAGE,
        StargateTopics.DEAD_LETTER: KIND_DLQ,
    }.get(topic)


def subscription_topics() -> list[str]:
    """The five topics this consumer durably sinks."""
    from app.services.stargate_bridge import StargateTopics
    return [
        StargateTopics.TELEMETRY,
        StargateTopics.AGG_5S,
        StargateTopics.ANOMALIES,
        StargateTopics.TRIAGE,
        StargateTopics.DEAD_LETTER,
    ]


def read_wire_schema_id(raw: bytes) -> int | None:
    """Confluent wire frame = [magic byte 0][4-byte big-endian schema id][payload].

    Returns the schema id when the frame is present, else None (plain/unframed
    payload). subject/version are a separate SR lookup that fails closed.
    """
    if raw and len(raw) >= 5 and raw[0] == 0:
        return int.from_bytes(raw[1:5], "big")
    return None


def should_persist_raw(offset: int, sample_rate: int) -> bool:
    """Deterministic raw-telemetry sampling: persist iff offset % sample_rate == 0.

    sample_rate <= 1 persists every raw row. Only telemetry is sampled; anomalies,
    agg5s, triage, and dlq always persist.
    """
    if sample_rate <= 1:
        return True
    return offset % sample_rate == 0


def decode_payload(topic: str, raw: bytes) -> dict:
    """Decode a message to a JSON-able dict. Protobuf for telemetry; json-registry
    for the JSON topics; a raw note for dlq. Raises on undecodable payloads so the
    caller routes them to the dlq buffer."""
    from app.services.stargate_bridge import StargateTopics, loads_registry_json

    if topic == StargateTopics.TELEMETRY:
        from confluent_kafka.serialization import MessageField, SerializationContext

        from app.events.protobuf_codec import build_protobuf_deserializer
        from app.services.stargate_bridge import telemetry_message_class

        deserializer = build_protobuf_deserializer(telemetry_message_class())
        ctx = SerializationContext(StargateTopics.TELEMETRY, MessageField.VALUE)
        decoded = deserializer(raw, ctx)
        return {
            "printer_id": decoded.printer_id,
            "ts_us": decoded.ts_us,
            "layer": decoded.layer,
            "print_job_id": decoded.print_job_id,
            "x": decoded.x, "y": decoded.y, "z": decoded.z,
            "melt_pool_temp_c": decoded.melt_pool_temp_c,
            "deposition_rate_kg_hr": decoded.deposition_rate_kg_hr,
            "arm_vibration_g": decoded.arm_vibration_g,
        }
    if topic == StargateTopics.DEAD_LETTER:
        # DLQ payloads are arbitrary bytes; keep a bounded, decodable note.
        try:
            return loads_registry_json(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {"raw_note": "routed to DLQ topic (undecodable payload)"}
    # agg5s / anomalies / triage are json-registry framed.
    return loads_registry_json(raw)


@dataclass
class DecodedRow:
    """A normalized, JSON-able row ready to persist to tel_stream_kafka_rows."""
    record_kind: str
    kafka_topic: str
    kafka_partition: int
    kafka_offset: int
    kafka_timestamp: datetime | None
    kafka_key: str | None
    schema_id: int | None
    decoded_payload: dict
    printer_id: str | None = None
    print_job_id: str | None = None
    run_id: str | None = None
    anomaly_id: str | None = None
    triage_id: str | None = None
    schema_null_reason: str | None = SCHEMA_SUBJECT_UNAVAILABLE


def build_row(
    *, topic: str, partition: int, offset: int, timestamp: datetime | None,
    key: str | None, raw: bytes,
) -> DecodedRow:
    """Decode + map a message into a DecodedRow. Pulls correlation ids from the
    payload where present. Raises if the payload cannot be decoded."""
    kind = topic_record_kind(topic)
    if kind is None:
        raise ValueError(f"unhandled topic: {topic}")
    payload = decode_payload(topic, raw)
    return DecodedRow(
        record_kind=kind,
        kafka_topic=topic,
        kafka_partition=partition,
        kafka_offset=offset,
        kafka_timestamp=timestamp,
        kafka_key=key,
        schema_id=read_wire_schema_id(raw),
        decoded_payload=payload,
        printer_id=payload.get("printer_id"),
        print_job_id=payload.get("print_job_id"),
        run_id=payload.get("run_id"),
        anomaly_id=payload.get("anomaly_id"),
        triage_id=payload.get("triage_id"),
    )


# ── SQL (idempotent; replay-safe via the 10034 UNIQUE / PKs) ──────────────────────────────────────────

_INSERT_KAFKA_ROW = """
INSERT INTO tel_stream_kafka_rows (
    env_id, business_id, record_kind,
    kafka_topic, kafka_partition, kafka_offset, kafka_timestamp, kafka_key, consumer_group,
    schema_id, schema_null_reason,
    printer_id, print_job_id, run_id, anomaly_id, triage_id,
    decoded_payload
) VALUES (
    %(env_id)s, %(business_id)s, %(record_kind)s,
    %(kafka_topic)s, %(kafka_partition)s, %(kafka_offset)s, %(kafka_timestamp)s, %(kafka_key)s, %(consumer_group)s,
    %(schema_id)s, %(schema_null_reason)s,
    %(printer_id)s, %(print_job_id)s, %(run_id)s, %(anomaly_id)s, %(triage_id)s,
    %(decoded_payload)s::jsonb
)
ON CONFLICT (env_id, business_id, kafka_topic, kafka_partition, kafka_offset) DO NOTHING
RETURNING id
"""

_UPSERT_TRIAGE = """
INSERT INTO tel_stream_triage_events (
    triage_id, env_id, business_id,
    anomaly_id, printer_id, print_job_id, run_id,
    severity, status, incident_summary, likely_cause, leading_indicators,
    recommended_action, confidence, requires_human_review, null_reason,
    kafka_row_id, kafka_topic, kafka_partition, kafka_offset
) VALUES (
    %(triage_id)s, %(env_id)s, %(business_id)s,
    %(anomaly_id)s, %(printer_id)s, %(print_job_id)s, %(run_id)s,
    %(severity)s, %(status)s, %(incident_summary)s, %(likely_cause)s, %(leading_indicators)s::jsonb,
    %(recommended_action)s, %(confidence)s, %(requires_human_review)s, %(null_reason)s,
    %(kafka_row_id)s, %(kafka_topic)s, %(kafka_partition)s, %(kafka_offset)s
)
ON CONFLICT (triage_id) DO UPDATE SET
    severity = EXCLUDED.severity,
    status = EXCLUDED.status,
    incident_summary = EXCLUDED.incident_summary,
    likely_cause = EXCLUDED.likely_cause,
    leading_indicators = EXCLUDED.leading_indicators,
    recommended_action = EXCLUDED.recommended_action,
    confidence = EXCLUDED.confidence,
    requires_human_review = EXCLUDED.requires_human_review,
    null_reason = EXCLUDED.null_reason,
    kafka_row_id = EXCLUDED.kafka_row_id,
    kafka_topic = EXCLUDED.kafka_topic,
    kafka_partition = EXCLUDED.kafka_partition,
    kafka_offset = EXCLUDED.kafka_offset
"""

_UPSERT_OFFSET = """
INSERT INTO tel_stream_consumer_offsets (
    env_id, business_id, consumer_group, topic, partition,
    last_processed_offset, next_committed_offset, lag, status, null_reason, updated_at
) VALUES (
    %(env_id)s, %(business_id)s, %(consumer_group)s, %(topic)s, %(partition)s,
    %(last_processed_offset)s, %(next_committed_offset)s, %(lag)s, %(status)s, %(null_reason)s, now()
)
ON CONFLICT (env_id, consumer_group, topic, partition) DO UPDATE SET
    last_processed_offset = EXCLUDED.last_processed_offset,
    next_committed_offset = EXCLUDED.next_committed_offset,
    lag = EXCLUDED.lag,
    status = EXCLUDED.status,
    null_reason = EXCLUDED.null_reason,
    updated_at = now()
"""


def persist_row(cur: Any, row: DecodedRow, *, env_id: str, business_id: str, consumer_group: str) -> None:
    """Insert one row into tel_stream_kafka_rows (idempotent) and, for triage,
    upsert tel_stream_triage_events. Uses the caller's cursor (one txn per batch)."""
    cur.execute(_INSERT_KAFKA_ROW, {
        "env_id": env_id, "business_id": business_id, "record_kind": row.record_kind,
        "kafka_topic": row.kafka_topic, "kafka_partition": row.kafka_partition,
        "kafka_offset": row.kafka_offset, "kafka_timestamp": row.kafka_timestamp,
        "kafka_key": row.kafka_key, "consumer_group": consumer_group,
        "schema_id": row.schema_id, "schema_null_reason": row.schema_null_reason,
        "printer_id": row.printer_id, "print_job_id": row.print_job_id, "run_id": row.run_id,
        "anomaly_id": row.anomaly_id, "triage_id": row.triage_id,
        "decoded_payload": json.dumps(row.decoded_payload, default=str),
    })
    inserted = cur.fetchone()
    kafka_row_id = (inserted["id"] if isinstance(inserted, dict) else inserted[0]) if inserted else None

    if row.record_kind == KIND_TRIAGE and row.triage_id:
        p = row.decoded_payload
        cur.execute(_UPSERT_TRIAGE, {
            "triage_id": row.triage_id, "env_id": env_id, "business_id": business_id,
            "anomaly_id": row.anomaly_id, "printer_id": row.printer_id,
            "print_job_id": row.print_job_id, "run_id": row.run_id,
            "severity": p.get("severity"),
            "status": p.get("status") or "not_available",
            "incident_summary": p.get("incident_summary"),
            "likely_cause": p.get("likely_cause"),
            "leading_indicators": json.dumps(p.get("leading_indicators") or [], default=str),
            "recommended_action": p.get("recommended_action"),
            "confidence": p.get("confidence"),
            "requires_human_review": bool(p.get("requires_human_review", True)),
            "null_reason": p.get("null_reason"),
            "kafka_row_id": kafka_row_id, "kafka_topic": row.kafka_topic,
            "kafka_partition": row.kafka_partition, "kafka_offset": row.kafka_offset,
        })


def record_offset(
    cur: Any, *, env_id: str, business_id: str, consumer_group: str,
    topic: str, partition: int, offset: int, lag: int | None, status: str,
    null_reason: str | None = None,
) -> None:
    """Upsert the durable offset receipt (last_processed_offset = offset; the Kafka
    commit point is offset + 1)."""
    cur.execute(_UPSERT_OFFSET, {
        "env_id": env_id, "business_id": business_id, "consumer_group": consumer_group,
        "topic": topic, "partition": partition,
        "last_processed_offset": offset, "next_committed_offset": offset + 1,
        "lag": lag, "status": status, "null_reason": null_reason,
    })


# ── worker ────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class _Stats:
    polled: int = 0
    persisted: int = 0
    sampled_out: int = 0
    dead_lettered: int = 0
    last_offsets: dict = field(default_factory=dict)   # (topic, partition) -> offset


class TelemetryStreamConsumer:
    """Async worker: durable Stargate -> Postgres serving-slice sink.

    run() drives a blocking confluent_kafka poll loop via asyncio.to_thread so it
    cancels cleanly from the FastAPI lifespan. Fail-closed: if the broker client or
    creds are missing, it writes a not_available offset receipt and idles instead
    of raising.
    """

    def __init__(
        self, *, env_id: str, business_id: str, consumer_group: str, sample_rate: int,
        batch_size: int = 128, poll_timeout_s: float = 1.0,
    ) -> None:
        self.env_id = env_id
        self.business_id = business_id
        self.consumer_group = consumer_group
        self.sample_rate = sample_rate
        self.batch_size = batch_size
        self.poll_timeout_s = poll_timeout_s
        self._stopping = False
        self._consumer = None
        self.stats = _Stats()

    def _build_consumer(self):
        """Build a durable confluent_kafka.Consumer (manual commit, earliest).
        Returns None if the client/creds are unavailable (fail closed)."""
        try:
            from confluent_kafka import Consumer

            from app.events.protobuf_codec import build_confluent_conf
        except Exception as exc:  # confluent-kafka not in image
            emit_log(level="warn", service="backend", action="telemetry_consumer.unavailable",
                     message="confluent-kafka unavailable; telemetry consumer idle", context={}, error=exc)
            return None
        conf = build_confluent_conf(group_id=self.consumer_group)
        # Durable sink overrides: at-least-once, replay from earliest, manual commit.
        conf["enable.auto.commit"] = False
        conf["auto.offset.reset"] = "earliest"
        try:
            consumer = Consumer(conf)
            consumer.subscribe(subscription_topics())
            return consumer
        except Exception as exc:
            emit_log(level="warn", service="backend", action="telemetry_consumer.connect_failed",
                     message="telemetry consumer failed to connect; idle", context={}, error=exc)
            return None

    def _write_unavailable_receipt(self) -> None:
        """Record a fail-closed status so the lineage surface shows the gap honestly."""
        try:
            from app.db import get_telemetry_cursor
            with get_telemetry_cursor() as cur:
                for topic in subscription_topics():
                    record_offset(cur, env_id=self.env_id, business_id=self.business_id,
                                  consumer_group=self.consumer_group, topic=topic, partition=0,
                                  offset=-1, lag=None, status="stalled",
                                  null_reason=CONSUMER_UNAVAILABLE)
        except Exception:
            pass  # best-effort

    def _handle_message(self, msg) -> None:
        """Decode + persist one Kafka message, then commit its offset. Runs in the
        poll thread. Never raises out of the loop; decode failures -> dlq buffer."""
        topic = msg.topic()
        partition = msg.partition()
        offset = msg.offset()
        raw = msg.value() or b""
        self.stats.polled += 1

        kind = topic_record_kind(topic)
        # Deterministic raw sampling: skip non-sampled telemetry but still advance the offset.
        if kind == KIND_TELEMETRY and not should_persist_raw(offset, self.sample_rate):
            self.stats.sampled_out += 1
            self._commit(msg, topic, partition, offset, persisted=False)
            return

        try:
            ts = self._msg_timestamp(msg)
            key = msg.key()
            key_s = key.decode("utf-8", "replace") if isinstance(key, (bytes, bytearray)) else key
            row = build_row(topic=topic, partition=partition, offset=offset,
                            timestamp=ts, key=key_s, raw=raw)
        except Exception as exc:
            self.stats.dead_lettered += 1
            self._ingest_dlq(topic, f"decode failed: {exc!r}"[:200], raw)
            self._commit(msg, topic, partition, offset, persisted=False)
            return

        try:
            from app.db import get_telemetry_cursor
            with get_telemetry_cursor() as cur:
                persist_row(cur, row, env_id=self.env_id, business_id=self.business_id,
                            consumer_group=self.consumer_group)
                record_offset(cur, env_id=self.env_id, business_id=self.business_id,
                              consumer_group=self.consumer_group, topic=topic, partition=partition,
                              offset=offset, lag=self._lag(msg), status="ok")
            self.stats.persisted += 1
        except Exception as exc:
            # DB write failed -> do NOT commit the Kafka offset; it will be redelivered.
            emit_log(level="warn", service="backend", action="telemetry_consumer.persist_failed",
                     message="telemetry consumer persist failed; will redeliver",
                     context={"topic": topic, "offset": offset}, error=exc)
            return

        self._commit(msg, topic, partition, offset, persisted=True)

    def _commit(self, msg, topic: str, partition: int, offset: int, *, persisted: bool) -> None:
        self.stats.last_offsets[(topic, partition)] = offset
        try:
            if self._consumer is not None:
                self._consumer.commit(msg, asynchronous=False)
        except Exception:
            pass  # next poll redelivers; idempotent insert absorbs it

    @staticmethod
    def _msg_timestamp(msg) -> datetime | None:
        try:
            kind, ms = msg.timestamp()
            if ms and ms > 0:
                return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
        except Exception:
            pass
        return None

    def _lag(self, msg) -> int | None:
        try:
            if self._consumer is None:
                return None
            _, high = self._consumer.get_watermark_offsets(
                _TopicPartition(msg.topic(), msg.partition()), timeout=1.0)
            return max(0, high - msg.offset() - 1) if high is not None else None
        except Exception:
            return None

    def _ingest_dlq(self, topic: str, reason: str, raw: bytes) -> None:
        """Persist a decode failure as a dlq record (best-effort, full)."""
        try:
            from app.db import get_telemetry_cursor
            with get_telemetry_cursor() as cur:
                row = DecodedRow(
                    record_kind=KIND_DLQ, kafka_topic=topic, kafka_partition=0, kafka_offset=-1,
                    kafka_timestamp=None, kafka_key=None, schema_id=None,
                    decoded_payload={"reason": reason, "source_topic": topic})
                # dlq decode-failure note uses a synthetic-but-honest coordinate; skip if it collides.
                persist_row(cur, row, env_id=self.env_id, business_id=self.business_id,
                            consumer_group=self.consumer_group)
        except Exception:
            pass

    def _poll_loop(self) -> None:
        """Blocking poll loop (runs in a thread)."""
        consumer = self._consumer
        if consumer is None:
            return
        while not self._stopping:
            msg = consumer.poll(self.poll_timeout_s)
            if msg is None:
                continue
            if msg.error():
                continue
            try:
                self._handle_message(msg)
            except Exception:
                emit_log(level="warn", service="backend", action="telemetry_consumer.loop_error",
                         message="telemetry consumer handler raised (skipped)", context={})

    async def run(self) -> None:
        """Lifespan entrypoint. Builds the consumer, then drives the poll loop in a
        thread until stop() is called or the task is cancelled."""
        self._consumer = await asyncio.to_thread(self._build_consumer)
        if self._consumer is None:
            await asyncio.to_thread(self._write_unavailable_receipt)
            emit_log(level="info", service="backend", action="telemetry_consumer.idle",
                     message="telemetry consumer idle (no broker); fail-closed receipt written",
                     context={"group": self.consumer_group})
            return
        emit_log(level="info", service="backend", action="telemetry_consumer.started",
                 message="telemetry durable consumer started",
                 context={"group": self.consumer_group, "sample_rate": self.sample_rate,
                          "topics": subscription_topics()})
        try:
            await asyncio.to_thread(self._poll_loop)
        finally:
            self._stopping = True
            if self._consumer is not None:
                try:
                    await asyncio.to_thread(self._consumer.close)
                except Exception:
                    pass

    def stop(self) -> None:
        self._stopping = True


def _TopicPartition(topic: str, partition: int):
    from confluent_kafka import TopicPartition
    return TopicPartition(topic, partition)
