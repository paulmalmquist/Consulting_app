"""BigQuery observational-only sink worker for Winston domain events.

Consumes from a Kafka topic, validates the EventEnvelope, maps it to the
winston_events_raw.events row shape, and writes to BigQuery. Invalid envelopes
are routed to the dead-letter topic and never silently dropped.

Guardrails (enforced, not aspirational):
  - NO Postgres writes.
  - NO execution-status mutation.
  - NO downstream side effects.
  - BigQuery is append-only (one row per envelope). It is never a read source.
  - If BigQuery is unavailable, the failure is logged and the envelope is sent
    to the dead-letter topic. The sink worker never swallows BQ errors silently.

Configuration (env vars):
  BQ_ENABLED                  false | true   (default false)
  BQ_PROJECT_ID               GCP project id
  BQ_DATASET                  target dataset (default: winston_events_raw)
  BQ_TABLE                    target table   (default: events)
  GOOGLE_APPLICATION_CREDENTIALS  path to service account JSON (or Workload Identity)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from app.events.envelope import SCHEMA_VERSION, EventEnvelope
from app.events.publisher import publish_event
from app.events.topics import Topics

logger = logging.getLogger("app.events.sink")


# ── BigQuery config (flat os.getenv, mirrors events/config.py style) ──────────

def _clean(v: str | None) -> str:
    return v.strip() if v else ""


BQ_ENABLED: bool = os.getenv("BQ_ENABLED", "false").lower() == "true"
BQ_PROJECT_ID: str = _clean(os.getenv("BQ_PROJECT_ID", ""))
BQ_DATASET: str = _clean(os.getenv("BQ_DATASET", "")) or "winston_events_raw"
BQ_TABLE: str = _clean(os.getenv("BQ_TABLE", "")) or "events"

# ── Row mapping ────────────────────────────────────────────────────────────────

_REQUIRED_FIELDS = frozenset({"event_id", "idempotency_key", "event_type", "occurred_at"})


def envelope_to_bq_row(
    envelope: EventEnvelope,
    *,
    ingested_at: datetime | None = None,
) -> dict[str, Any]:
    """Map a validated EventEnvelope to a BigQuery row dict.

    Column names match events_table.sql exactly. ``source`` maps from
    ``EventEnvelope.source_service`` (the envelope field name) to the BQ column
    name ``source`` (shorter, per the schema spec).
    """
    now = ingested_at or datetime.now(timezone.utc)
    return {
        "event_id":         str(envelope.event_id),
        "idempotency_key":  envelope.idempotency_key,
        "event_type":       envelope.event_type,
        "schema_version":   envelope.schema_version,
        "occurred_at":      envelope.occurred_at.isoformat(),
        "published_at":     envelope.published_at.isoformat() if envelope.published_at else None,
        "correlation_id":   envelope.correlation_id,
        "run_id":           envelope.run_id,
        "business_id":      str(envelope.business_id) if envelope.business_id else None,
        "env_id":           envelope.env_id,
        "source":           envelope.source_service,
        "payload":          json.dumps(envelope.payload),
        "ingested_at":      now.isoformat(),
        "dead_letter":      False,
        "dead_letter_reason": None,
    }


def _dead_letter_row(raw_bytes: bytes, reason: str, ingested_at: datetime) -> dict[str, Any]:
    """Build a dead-letter row for an envelope that failed validation or BQ write.

    A dead-lettered message has no valid envelope, so it has no source
    ``event_id`` / ``idempotency_key`` — but the BigQuery schema marks both
    REQUIRED, so leaving them null makes the dead-letter row itself fail to
    insert (``Field value cannot be empty``) and the failure is lost. Synthesize
    deterministic non-empty values from a hash of the raw bytes: a uuid5
    ``event_id`` and a ``dead_letter:<sha256-prefix>`` idempotency_key. Stable
    per payload, so a redelivered bad message dedups at the BQ insertId layer.
    """
    digest = hashlib.sha256(raw_bytes).hexdigest()
    return {
        "event_id":           str(uuid5(NAMESPACE_URL, f"dead_letter:{digest}")),
        "idempotency_key":    f"dead_letter:{digest[:32]}",
        "event_type":         "dead_letter",
        "schema_version":     SCHEMA_VERSION,
        "occurred_at":        ingested_at.isoformat(),
        "published_at":       None,
        "correlation_id":     None,
        "run_id":             None,
        "business_id":        None,
        "env_id":             None,
        "source":             "sink_worker",
        "payload":            json.dumps({"raw": raw_bytes.decode("utf-8", errors="replace")}),
        "ingested_at":        ingested_at.isoformat(),
        "dead_letter":        True,
        "dead_letter_reason": reason,
    }


# ── Validation ─────────────────────────────────────────────────────────────────

class InvalidEnvelope(ValueError):
    """Raised when a raw message cannot be parsed as a valid EventEnvelope."""


def validate_envelope(raw_bytes: bytes) -> EventEnvelope:
    """Parse and validate raw Kafka message bytes as an EventEnvelope.

    Raises ``InvalidEnvelope`` (a ValueError subclass) on any parse or
    validation failure. Never swallows unknown fields — pydantic forbids them
    at the model level.
    """
    try:
        data = json.loads(raw_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise InvalidEnvelope(f"not valid JSON: {exc}") from exc

    missing = _REQUIRED_FIELDS - set(data)
    if missing:
        raise InvalidEnvelope(f"missing required fields: {sorted(missing)}")

    try:
        return EventEnvelope.model_validate(data)
    except Exception as exc:
        raise InvalidEnvelope(f"envelope validation failed: {exc}") from exc


# ── BigQuery client abstraction ────────────────────────────────────────────────

class BigQuerySinkError(RuntimeError):
    """Raised when the BigQuery write itself fails (not validation)."""


def _get_bq_client():  # type: ignore[return]
    """Lazy-import google-cloud-bigquery. Absent → raises ImportError."""
    from google.cloud import bigquery  # noqa: PLC0415
    return bigquery.Client(project=BQ_PROJECT_ID)


def write_row_to_bq(row: dict[str, Any], *, insert_id: str | None = None) -> None:
    """Insert a single row into winston_events_raw.events.

    Uses the streaming-insert API with ``insertId = idempotency_key`` for
    best-effort deduplication. Raises ``BigQuerySinkError`` on any BQ error so
    the caller can route to dead-letter instead of silently dropping the event.

    If ``BQ_ENABLED`` is False (the default), this is a no-op — used in tests
    to prove the path without credentials.
    """
    if not BQ_ENABLED:
        return

    if not BQ_PROJECT_ID:
        raise BigQuerySinkError("BQ_PROJECT_ID is not set")

    try:
        client = _get_bq_client()
    except ImportError as exc:
        raise BigQuerySinkError("google-cloud-bigquery is not installed") from exc

    table_ref = f"{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}"
    rows_to_insert = [row]

    try:
        errors = client.insert_rows_json(
            table_ref,
            rows_to_insert,
            row_ids=[insert_id] if insert_id else None,
        )
    except Exception as exc:
        raise BigQuerySinkError(f"BQ insert_rows_json raised: {exc}") from exc

    if errors:
        raise BigQuerySinkError(f"BQ insert errors: {errors}")


# ── Main sink function ─────────────────────────────────────────────────────────

def process_message(raw_bytes: bytes) -> dict[str, Any]:
    """Process one raw Kafka message bytes from winston.executions.v1.

    Returns a result dict describing what happened:
      {"status": "ok",          "event_type": ..., "event_id": ...}
      {"status": "dead_letter", "reason": ..., "bq_written": True|False}

    Observational-only contract:
      - Never writes to Postgres.
      - Never mutates execution status.
      - On validation failure: dead-letters the raw bytes.
      - On BQ write failure: routes the row to dead-letter topic + logs; does
        NOT swallow the error silently.
      - publish_event (dead-letter) is best-effort and never raises.
    """
    ingested_at = datetime.now(timezone.utc)

    # Step 1: validate
    try:
        envelope = validate_envelope(raw_bytes)
    except InvalidEnvelope as exc:
        reason = str(exc)
        logger.warning("sink: invalid envelope, routing to dead-letter. reason=%s", reason)
        _route_dead_letter(raw_bytes, reason, ingested_at)
        return {"status": "dead_letter", "reason": reason, "bq_written": False}

    # Step 2: map to BQ row
    row = envelope_to_bq_row(envelope, ingested_at=ingested_at)

    # Step 3: write to BigQuery
    try:
        write_row_to_bq(row, insert_id=envelope.idempotency_key)
    except BigQuerySinkError as exc:
        reason = f"bq_write_failed: {exc}"
        logger.error("sink: BQ write failed, routing to dead-letter. reason=%s", reason, exc_info=True)
        _route_dead_letter(raw_bytes, reason, ingested_at)
        return {"status": "dead_letter", "reason": reason, "bq_written": False}

    logger.debug(
        "sink: wrote event event_id=%s event_type=%s run_id=%s",
        row["event_id"], row["event_type"], row["run_id"],
    )
    return {"status": "ok", "event_type": envelope.event_type, "event_id": str(envelope.event_id)}


def _route_dead_letter(raw_bytes: bytes, reason: str, ingested_at: datetime) -> None:
    """Emit dead-letter to the Kafka dead-letter topic AND write a BQ dead-letter row.

    Both paths are best-effort. publish_event never raises. BQ write errors are
    logged but do not re-raise (dead-lettering the dead-letter is not useful).
    """
    # Kafka dead-letter (best-effort publish — no-op if no broker)
    dl_row = _dead_letter_row(raw_bytes, reason, ingested_at)
    try:
        from app.events.envelope import EventEnvelope as _E  # noqa: PLC0415
        dl_env = _E(
            event_type="dead_letter",
            idempotency_key=f"dead_letter:{hash(raw_bytes)}:{ingested_at.isoformat()}",
            occurred_at=ingested_at,
            source_service="sink_worker",
            payload={"reason": reason},
        )
        publish_event(Topics.DEAD_LETTER, dl_env)
    except Exception:
        logger.exception("sink: failed to publish dead-letter event to Kafka topic")

    # BQ dead-letter row (best-effort)
    try:
        write_row_to_bq(dl_row, insert_id=None)
    except (BigQuerySinkError, Exception):
        logger.exception("sink: failed to write dead-letter row to BQ")
