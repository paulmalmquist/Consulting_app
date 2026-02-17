"""Typed deterministic finance run envelopes."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

from .utils import deterministic_hash


@dataclass(frozen=True)
class FinRunEnvelope:
    tenant_id: str
    business_id: str
    partition_id: str
    engine_kind: str
    as_of_date: date
    idempotency_key: str
    dataset_version_id: str | None = None
    fin_rule_version_id: str | None = None
    input_ref_table: str | None = None
    input_ref_id: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)


def build_envelope_hash(envelope: FinRunEnvelope | dict[str, Any]) -> str:
    payload = asdict(envelope) if isinstance(envelope, FinRunEnvelope) else envelope
    return deterministic_hash(payload)
