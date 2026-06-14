"""History Rhymes signal ingestion publisher (Phase 5A).

Maps a History Rhymes signal bundle into per-signal ``EventEnvelope`` events and
publishes them to ``history-rhymes.signals.v1`` via the existing best-effort
``publish_event``. This is the producer side of the HR ingestion path; the
existing observational sink (#177, on GKE) drains the topic into BigQuery
unchanged — no new streaming abstraction.

A "bundle" is the shape History Rhymes already produces from its manual JSON
path: a mapping of ``signal_name -> {value, timestamp, units, ...}`` plus
bundle-level provenance (source, as_of_date, staleness). This module does NOT
read or write Postgres and does NOT touch the decision runner — it only emits
events. The decision runner keeps reading Postgres (authoritative); these events
are additive observability, never an app read source.

Per-signal payload (the contract the BigQuery row carries):
  signal_name, signal_value, signal_timestamp, source, staleness_status,
  confidence, units, as_of_date
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.events.envelope import EventEnvelope
from app.events.publisher import publish_event
from app.events.topics import EventTypes, Topics


class InvalidSignalBundle(ValueError):
    """Raised when a bundle or a signal within it is missing required fields."""


# A signal is identified by its name; these per-signal fields must be present.
_REQUIRED_SIGNAL_FIELDS = ("signal_value", "signal_timestamp")


def _coerce_iso(value: Any) -> str:
    """Normalize a timestamp to an ISO-8601 string (UTC if naive)."""
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise InvalidSignalBundle(f"signal_timestamp must be a datetime or ISO string, got {value!r}")


def signal_to_envelope(
    signal_name: str,
    signal: dict[str, Any],
    *,
    source: str,
    as_of_date: str,
    staleness_status: str,
    occurred_at: datetime | None = None,
    business_id: UUID | None = None,
    env_id: str | None = None,
) -> EventEnvelope:
    """Build one ``hr.signal.observed`` envelope for a single HR signal.

    ``idempotency_key`` is ``hr.signal.observed:{as_of_date}:{signal_name}`` so a
    re-publish of the same bundle dedups at the BigQuery insertId layer.
    """
    if not signal_name:
        raise InvalidSignalBundle("signal_name is required")
    missing = [f for f in _REQUIRED_SIGNAL_FIELDS if f not in signal]
    if missing:
        raise InvalidSignalBundle(f"signal {signal_name!r} missing fields: {missing}")

    signal_timestamp = _coerce_iso(signal["signal_timestamp"])
    payload = {
        "signal_name": signal_name,
        "signal_value": signal["signal_value"],
        "signal_timestamp": signal_timestamp,
        "source": source,
        "staleness_status": staleness_status,
        "confidence": signal.get("confidence"),
        "units": signal.get("units"),
        "as_of_date": as_of_date,
    }
    return EventEnvelope(
        event_type=EventTypes.HR_SIGNAL_OBSERVED,
        idempotency_key=f"{EventTypes.HR_SIGNAL_OBSERVED}:{as_of_date}:{signal_name}",
        occurred_at=occurred_at or datetime.now(timezone.utc),
        run_id=f"hr-bundle:{as_of_date}",
        business_id=business_id,
        env_id=env_id,
        source_service="hr_signal_ingestion",
        payload=payload,
    )


def bundle_to_envelopes(
    bundle: dict[str, Any],
    *,
    occurred_at: datetime | None = None,
    business_id: UUID | None = None,
    env_id: str | None = None,
) -> list[EventEnvelope]:
    """Map a full HR signal bundle to a list of per-signal envelopes.

    Bundle shape:
      {
        "as_of_date": "2026-06-13",
        "source": "manual_json_bundle",
        "staleness_status": "fresh",
        "signals": { "<signal_name>": {"signal_value": ..., "signal_timestamp": ..., ...}, ... }
      }
    """
    if "signals" not in bundle or not isinstance(bundle["signals"], dict):
        raise InvalidSignalBundle("bundle missing a 'signals' mapping")
    as_of_date = bundle.get("as_of_date")
    if not as_of_date:
        raise InvalidSignalBundle("bundle missing 'as_of_date'")
    source = bundle.get("source", "manual_json_bundle")
    staleness_status = bundle.get("staleness_status", "unknown")

    envelopes: list[EventEnvelope] = []
    for name, sig in bundle["signals"].items():
        envelopes.append(
            signal_to_envelope(
                name, sig,
                source=source, as_of_date=as_of_date, staleness_status=staleness_status,
                occurred_at=occurred_at, business_id=business_id, env_id=env_id,
            )
        )
    return envelopes


def publish_signal_bundle(
    bundle: dict[str, Any],
    *,
    occurred_at: datetime | None = None,
    business_id: UUID | None = None,
    env_id: str | None = None,
) -> dict[str, Any]:
    """Publish every signal in a bundle to the HR topic. Best-effort.

    Returns a summary: how many envelopes were built and how many publishes the
    transport accepted. publish_event never raises (no-op without a broker), so
    this is safe to call from the manual ingest path.
    """
    envelopes = bundle_to_envelopes(
        bundle, occurred_at=occurred_at, business_id=business_id, env_id=env_id,
    )
    accepted = 0
    for env in envelopes:
        if publish_event(Topics.HISTORY_RHYMES_SIGNALS, env):
            accepted += 1
    return {
        "topic": Topics.HISTORY_RHYMES_SIGNALS,
        "signals": len(envelopes),
        "accepted": accepted,
        "as_of_date": bundle.get("as_of_date"),
    }
