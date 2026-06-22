"""Tests for the BigQuery observational-only sink worker (Phase 2).

All tests run with NO credentials and NO BigQuery connection.
BQ_ENABLED is False by default, so write_row_to_bq is a no-op unless
patched to exercise the failure path.

Test inventory:
  - envelope_to_bq_row maps every EventEnvelope field correctly
  - source_service maps to BQ column "source"
  - optional tenancy (HR single-tenant: business_id / env_id = None)
  - validate_envelope: valid bytes round-trip
  - validate_envelope: rejects non-JSON
  - validate_envelope: rejects missing required fields
  - validate_envelope: rejects wrong schema_version type
  - process_message: valid envelope → ok status
  - process_message: invalid JSON → dead_letter
  - process_message: missing required field → dead_letter
  - process_message: BQ write failure → dead_letter, not silent success
  - process_message: BQ unavailable (import error) → dead_letter, not silent
  - write_row_to_bq: no-op when BQ_ENABLED=False (no credentials needed)
  - dead-letter BQ row has dead_letter=True + reason
  - idempotency_key used as insertId in BQ call
"""

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.events.envelope import EventEnvelope
from app.events.sink import (
    BigQuerySinkError,
    InvalidEnvelope,
    _dead_letter_row,
    envelope_to_bq_row,
    process_message,
    validate_envelope,
    write_row_to_bq,
)


# ── helpers ────────────────────────────────────────────────────────────────────

def _make_envelope(**overrides) -> EventEnvelope:
    defaults = dict(
        event_type="execution.completed",
        idempotency_key=f"execution.completed:{uuid4()}",
        occurred_at=datetime.now(timezone.utc),
        run_id=str(uuid4()),
        business_id=uuid4(),
    )
    defaults.update(overrides)
    return EventEnvelope(**defaults)


def _wire(env: EventEnvelope) -> bytes:
    return env.to_wire()


# ── envelope_to_bq_row ────────────────────────────────────────────────────────

def test_row_mapping_all_fields():
    env = _make_envelope(correlation_id="corr-1", env_id="env-demo")
    now = datetime.now(timezone.utc)
    row = envelope_to_bq_row(env, ingested_at=now)

    assert row["event_id"] == str(env.event_id)
    assert row["idempotency_key"] == env.idempotency_key
    assert row["event_type"] == "execution.completed"
    assert row["schema_version"] == 1
    assert row["occurred_at"] == env.occurred_at.isoformat()
    assert row["published_at"] == env.published_at.isoformat()
    assert row["correlation_id"] == "corr-1"
    assert row["run_id"] == env.run_id
    assert row["business_id"] == str(env.business_id)
    assert row["env_id"] == "env-demo"
    assert row["ingested_at"] == now.isoformat()
    assert row["dead_letter"] is False
    assert row["dead_letter_reason"] is None


def test_row_mapping_source_field():
    env = _make_envelope()
    row = envelope_to_bq_row(env)
    # envelope.source_service → BQ column "source"
    assert row["source"] == env.source_service
    assert "source_service" not in row


def test_row_mapping_optional_tenancy():
    # History Rhymes: no business_id, no env_id
    env = EventEnvelope(
        event_type="hr.signal.observed",
        idempotency_key="hr.signal.observed:mvrv_z:2026-06-03",
        occurred_at=datetime.now(timezone.utc),
    )
    row = envelope_to_bq_row(env)
    assert row["business_id"] is None
    assert row["env_id"] is None


def test_row_payload_is_json_string():
    env = _make_envelope(payload={"status": "completed", "execution_type": "default"})
    row = envelope_to_bq_row(env)
    parsed = json.loads(row["payload"])
    assert parsed["status"] == "completed"


# ── validate_envelope ─────────────────────────────────────────────────────────

def test_validate_valid_envelope():
    env = _make_envelope()
    restored = validate_envelope(_wire(env))
    assert restored.event_type == env.event_type
    assert str(restored.event_id) == str(env.event_id)


def test_validate_rejects_non_json():
    with pytest.raises(InvalidEnvelope, match="not valid JSON"):
        validate_envelope(b"this is not json")


def test_validate_rejects_missing_required_fields():
    data = json.dumps({"event_type": "execution.completed"}).encode()
    with pytest.raises(InvalidEnvelope, match="missing required fields"):
        validate_envelope(data)


def test_validate_rejects_wrong_type():
    env = _make_envelope()
    data = json.loads(_wire(env))
    data["schema_version"] = "not-an-int"
    with pytest.raises(InvalidEnvelope, match="envelope validation failed"):
        validate_envelope(json.dumps(data).encode())


# ── process_message: happy path ───────────────────────────────────────────────

def test_process_message_valid_envelope_ok():
    env = _make_envelope()
    result = process_message(_wire(env))
    assert result["status"] == "ok"
    assert result["event_type"] == "execution.completed"
    assert result["event_id"] == str(env.event_id)


def test_process_message_no_bq_write_when_disabled():
    env = _make_envelope()
    with patch("app.events.sink.write_row_to_bq") as mock_write:
        process_message(_wire(env))
    # BQ_ENABLED=False by default, so write_row_to_bq is called but is a no-op.
    # The test asserts it was at least called (no short-circuit before the call).
    mock_write.assert_called_once()


# ── process_message: invalid envelope → dead-letter ──────────────────────────

def test_process_message_invalid_json_dead_lettered():
    result = process_message(b"garbage bytes!!!!")
    assert result["status"] == "dead_letter"
    assert "not valid JSON" in result["reason"]
    assert result["bq_written"] is False


def test_process_message_missing_field_dead_lettered():
    data = json.dumps({"event_type": "execution.started"}).encode()
    result = process_message(data)
    assert result["status"] == "dead_letter"
    assert result["bq_written"] is False


# ── process_message: BQ failure → explicit dead-letter ───────────────────────

def test_process_message_bq_error_routes_dead_letter():
    env = _make_envelope()
    # side_effect=exception_instance → mock raises on every call (including the
    # dead-letter BQ write). The dead-letter BQ path also swallows its own error,
    # so the function completes and returns dead_letter status.
    with patch("app.events.sink.write_row_to_bq",
               side_effect=BigQuerySinkError("simulated BQ unavailable")):
        result = process_message(_wire(env))

    assert result["status"] == "dead_letter"
    assert "bq_write_failed" in result["reason"]
    assert result["bq_written"] is False


def test_process_message_bq_import_error_routes_dead_letter():
    env = _make_envelope()
    with patch("app.events.sink.write_row_to_bq",
               side_effect=BigQuerySinkError("google-cloud-bigquery is not installed")):
        result = process_message(_wire(env))

    assert result["status"] == "dead_letter"
    assert result["bq_written"] is False


def test_bq_error_does_not_silently_succeed():
    env = _make_envelope()
    with patch("app.events.sink.write_row_to_bq",
               side_effect=BigQuerySinkError("network timeout")):
        result = process_message(_wire(env))

    # Must NOT return "ok" — BQ failure must surface as dead_letter, never masked.
    assert result["status"] != "ok"


# ── write_row_to_bq: no-op when disabled ─────────────────────────────────────

def test_write_row_noop_when_bq_disabled():
    row = envelope_to_bq_row(_make_envelope())
    with patch("app.events.sink.BQ_ENABLED", False):
        # Must not raise, must not import google.cloud.bigquery.
        write_row_to_bq(row, insert_id="test-key")


def test_write_row_raises_sink_error_on_missing_project():
    row = envelope_to_bq_row(_make_envelope())
    with patch("app.events.sink.BQ_ENABLED", True), \
         patch("app.events.sink.BQ_PROJECT_ID", ""):
        with pytest.raises(BigQuerySinkError, match="BQ_PROJECT_ID is not set"):
            write_row_to_bq(row)


def test_write_row_raises_sink_error_when_bq_not_installed():
    row = envelope_to_bq_row(_make_envelope())
    with patch("app.events.sink.BQ_ENABLED", True), \
         patch("app.events.sink.BQ_PROJECT_ID", "novendor-test"), \
         patch("app.events.sink._get_bq_client", side_effect=ImportError("no module")):
        with pytest.raises(BigQuerySinkError, match="not installed"):
            write_row_to_bq(row)


def test_write_row_raises_sink_error_on_bq_errors_list():
    row = envelope_to_bq_row(_make_envelope())
    mock_client = MagicMock()
    mock_client.insert_rows_json.return_value = [{"index": 0, "errors": [{"reason": "invalid"}]}]
    with patch("app.events.sink.BQ_ENABLED", True), \
         patch("app.events.sink.BQ_PROJECT_ID", "novendor-test"), \
         patch("app.events.sink._get_bq_client", return_value=mock_client):
        with pytest.raises(BigQuerySinkError, match="BQ insert errors"):
            write_row_to_bq(row)


def test_write_row_uses_idempotency_key_as_insert_id():
    row = envelope_to_bq_row(_make_envelope())
    mock_client = MagicMock()
    mock_client.insert_rows_json.return_value = []
    with patch("app.events.sink.BQ_ENABLED", True), \
         patch("app.events.sink.BQ_PROJECT_ID", "novendor-test"), \
         patch("app.events.sink._get_bq_client", return_value=mock_client):
        write_row_to_bq(row, insert_id="my-idempotency-key")

    _, kwargs = mock_client.insert_rows_json.call_args
    assert kwargs.get("row_ids") == ["my-idempotency-key"]


# ── dead-letter row shape ─────────────────────────────────────────────────────

def test_dead_letter_row_has_correct_shape():
    now = datetime.now(timezone.utc)
    raw = b"bad bytes"
    row = _dead_letter_row(raw, "invalid JSON", now)

    assert row["dead_letter"] is True
    assert row["dead_letter_reason"] == "invalid JSON"
    assert row["event_type"] == "dead_letter"
    assert row["source"] == "sink_worker"
    assert row["ingested_at"] == now.isoformat()
    # Raw bytes preserved in payload for debugging
    assert "bad bytes" in row["payload"]


def test_dead_letter_row_has_non_empty_required_keys():
    """event_id + idempotency_key are REQUIRED in BQ; a dead-letter row must not
    leave them null or the row itself fails to insert."""
    now = datetime.now(timezone.utc)
    row = _dead_letter_row(b"junk payload", "missing fields", now)
    assert row["event_id"], "event_id must be non-empty for the REQUIRED BQ column"
    assert row["idempotency_key"], "idempotency_key must be non-empty for the REQUIRED BQ column"
    assert row["idempotency_key"].startswith("dead_letter:")


def test_dead_letter_row_keys_are_deterministic():
    """Same raw bytes -> same synthetic keys, so a redelivered bad message dedups."""
    now = datetime.now(timezone.utc)
    a = _dead_letter_row(b"same bytes", "r1", now)
    b = _dead_letter_row(b"same bytes", "r2", now)
    assert a["event_id"] == b["event_id"]
    assert a["idempotency_key"] == b["idempotency_key"]
    # Different bytes -> different keys.
    c = _dead_letter_row(b"other bytes", "r1", now)
    assert c["idempotency_key"] != a["idempotency_key"]
