"""Tests for the HR signal ingestion publisher (Phase 5A).

No broker. Covers bundle -> envelope mapping, the per-signal payload contract,
idempotency-key shape, and that malformed bundles/signals raise
InvalidSignalBundle. Also asserts that a malformed HR payload, once on the wire,
dead-letters through the existing sink (proving the sink handles HR events with
no sink changes).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.events.hr_signal_publisher import (
    InvalidSignalBundle,
    bundle_to_envelopes,
    signal_to_envelope,
)
from app.events.topics import EventTypes, Topics


def _bundle():
    return {
        "as_of_date": "2026-06-13",
        "source": "manual_json_bundle",
        "staleness_status": "fresh",
        "signals": {
            "yield_curve_10y2y": {
                "signal_value": -0.42,
                "signal_timestamp": "2026-06-13T00:00:00+00:00",
                "units": "pct",
                "confidence": 0.86,
            },
        },
    }


# ── mapping + payload contract ───────────────────────────────────────────────

def test_bundle_maps_one_envelope_per_signal():
    b = _bundle()
    b["signals"]["credit_spread_hy"] = {
        "signal_value": 3.15, "signal_timestamp": "2026-06-13T00:00:00+00:00",
    }
    envs = bundle_to_envelopes(b)
    assert len(envs) == 2
    assert {e.payload["signal_name"] for e in envs} == {"yield_curve_10y2y", "credit_spread_hy"}


def test_payload_carries_the_full_contract():
    env = bundle_to_envelopes(_bundle())[0]
    p = env.payload
    for field in ("signal_name", "signal_value", "signal_timestamp", "source",
                  "staleness_status", "confidence", "units", "as_of_date"):
        assert field in p, f"payload missing {field}"
    assert p["signal_name"] == "yield_curve_10y2y"
    assert p["signal_value"] == -0.42
    assert p["source"] == "manual_json_bundle"
    assert p["staleness_status"] == "fresh"
    assert p["confidence"] == 0.86
    assert p["units"] == "pct"
    assert p["as_of_date"] == "2026-06-13"


def test_event_type_and_idempotency_key():
    env = bundle_to_envelopes(_bundle())[0]
    assert env.event_type == EventTypes.HR_SIGNAL_OBSERVED
    assert env.idempotency_key == "hr.signal.observed:2026-06-13:yield_curve_10y2y"
    assert env.run_id == "hr-bundle:2026-06-13"
    assert env.source_service == "hr_signal_ingestion"


def test_same_bundle_produces_stable_idempotency_keys():
    """Re-publishing the same bundle yields identical keys (BQ insertId dedup)."""
    k1 = [e.idempotency_key for e in bundle_to_envelopes(_bundle())]
    k2 = [e.idempotency_key for e in bundle_to_envelopes(_bundle())]
    assert k1 == k2


def test_datetime_timestamp_is_coerced_to_iso():
    env = signal_to_envelope(
        "x", {"signal_value": 1, "signal_timestamp": datetime(2026, 6, 13, tzinfo=timezone.utc)},
        source="s", as_of_date="2026-06-13", staleness_status="fresh",
    )
    assert env.payload["signal_timestamp"] == "2026-06-13T00:00:00+00:00"


def test_envelope_is_wire_serializable():
    env = bundle_to_envelopes(_bundle())[0]
    data = json.loads(env.to_wire())
    assert data["event_type"] == EventTypes.HR_SIGNAL_OBSERVED
    assert data["payload"]["signal_name"] == "yield_curve_10y2y"


# ── invalid bundles / signals ────────────────────────────────────────────────

def test_bundle_without_signals_raises():
    with pytest.raises(InvalidSignalBundle):
        bundle_to_envelopes({"as_of_date": "2026-06-13"})


def test_bundle_without_as_of_raises():
    with pytest.raises(InvalidSignalBundle):
        bundle_to_envelopes({"signals": {}})


def test_signal_missing_value_raises():
    with pytest.raises(InvalidSignalBundle):
        signal_to_envelope(
            "x", {"signal_timestamp": "2026-06-13T00:00:00+00:00"},
            source="s", as_of_date="2026-06-13", staleness_status="fresh",
        )


def test_signal_bad_timestamp_raises():
    with pytest.raises(InvalidSignalBundle):
        signal_to_envelope(
            "x", {"signal_value": 1, "signal_timestamp": 12345},
            source="s", as_of_date="2026-06-13", staleness_status="fresh",
        )


# ── HR event drains through the existing sink unchanged ──────────────────────

def test_hr_event_validates_through_the_sink():
    """A well-formed HR envelope passes sink.validate_envelope (no sink change)."""
    from app.events.sink import envelope_to_bq_row, validate_envelope
    env = bundle_to_envelopes(_bundle())[0]
    validated = validate_envelope(env.to_wire())
    row = envelope_to_bq_row(validated)
    assert row["event_type"] == EventTypes.HR_SIGNAL_OBSERVED
    assert row["source"] == "hr_signal_ingestion"
    assert row["dead_letter"] is False
    # The HR payload is preserved as the BQ JSON payload column.
    assert json.loads(row["payload"])["signal_name"] == "yield_curve_10y2y"


def test_malformed_hr_payload_dead_letters_through_sink():
    """A non-envelope HR message on the wire dead-letters with a clear reason."""
    from app.events.sink import process_message
    result = process_message(b'{"signal_name": "x", "not": "an envelope"}')
    assert result["status"] == "dead_letter"
    assert "missing required fields" in result["reason"]


def test_hr_topic_constant():
    assert Topics.HISTORY_RHYMES_SIGNALS == "history-rhymes.signals.v1"
