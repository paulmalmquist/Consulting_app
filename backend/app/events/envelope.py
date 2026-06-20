"""Canonical Winston event envelope.

One shape for every domain event Winston emits. Postgres stays the system of
record; these envelopes are additive emissions that land in the event lake
(BigQuery) for analytics, replay, and observability — never a read source.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

SCHEMA_VERSION = 1


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class EventEnvelope(BaseModel):
    """Stable wire contract for a single domain event.

    Required: ``idempotency_key``, ``event_type``, ``occurred_at``. Everything
    else is defaulted or optional. ``business_id``/``env_id`` are optional
    because some domains (History Rhymes) are single-tenant and carry neither.
    """

    # identity / idempotency
    event_id: UUID = Field(default_factory=uuid4)
    idempotency_key: str
    event_type: str
    schema_version: int = SCHEMA_VERSION

    # time
    occurred_at: datetime
    published_at: datetime = Field(default_factory=_now_utc)

    # correlation
    correlation_id: str | None = None
    run_id: str | None = None

    # tenancy (optional — single-tenant domains leave these unset)
    business_id: UUID | None = None
    env_id: str | None = None

    # producer + payload
    source_service: str = "backend"
    payload: dict = Field(default_factory=dict)

    def to_wire(self) -> bytes:
        """Serialize to JSON bytes (handles UUID and datetime)."""
        return self.model_dump_json().encode("utf-8")
