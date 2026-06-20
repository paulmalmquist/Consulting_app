"""Normalized History Rhymes stream event contracts.

Wire shapes from docs/plans/history-rhymes/streaming-architecture.md. The
signal-key -> domain crosswalk MUST stay identical to the frontend copy in
repo-b/src/lib/historyrhymes/signals.ts (SIGNAL_KEYS).
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, model_validator

SignalKey = Literal[
    "mvrv_z", "yc_10y2y", "vix_term", "housing",
    "cmbs_delinq", "fed_tone", "crypto_flow", "macro_surprise",
]

SignalDomain = Literal[
    "macro", "market", "crypto", "credit", "real_estate", "sentiment", "options",
]

# Mirror of repo-b/src/lib/historyrhymes/signals.ts SIGNAL_KEYS — keep in sync.
SIGNAL_DOMAINS: dict[str, str] = {
    "mvrv_z": "crypto",
    "yc_10y2y": "macro",
    "vix_term": "options",
    "housing": "real_estate",
    "cmbs_delinq": "credit",
    "fed_tone": "sentiment",
    "crypto_flow": "crypto",
    "macro_surprise": "macro",
}

QualityStatus = Literal["fresh", "stale", "missing"]


def idempotency_key(signal_key: str, observed_at: datetime, source: str) -> str:
    """Deterministic dedupe key: replays and consumer restarts are harmless."""
    raw = f"{signal_key}|{observed_at.isoformat()}|{source}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class SignalQuality(BaseModel):
    status: QualityStatus = "fresh"
    null_reason: str | None = None
    source_lag_seconds: float | None = None
    validation_errors: list[str] = Field(default_factory=list)


class HrSignalEvent(BaseModel):
    """One observed value on one signal channel."""

    event_id: UUID = Field(default_factory=uuid4)
    event_type: Literal["signal.observed"] = "signal.observed"
    source: str
    topic: str
    signal_key: SignalKey
    domain: SignalDomain
    observed_at: datetime
    ingested_at: datetime
    value: float | str | None = None
    unit: str | None = None
    previous_value: float | None = None
    delta: float | None = None
    window: str = "daily"
    freshness_ttl_seconds: int = 86400
    quality: SignalQuality = Field(default_factory=SignalQuality)
    tags: list[str] = Field(default_factory=list)
    raw: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _null_value_requires_reason(self) -> "HrSignalEvent":
        # Honesty rule: a missing value must say why. A null value with no
        # reason is indistinguishable from a bug, so it fails validation.
        if self.value is None and (
            self.quality.status != "missing" or not self.quality.null_reason
        ):
            raise ValueError(
                "null value requires quality.status='missing' and a null_reason"
            )
        return self

    @property
    def dedupe_key(self) -> str:
        return idempotency_key(self.signal_key, self.observed_at, self.source)


AlertType = Literal["honeypot", "crowding", "divergence", "data_quality", "regime_shift"]
AlertSeverity = Literal["info", "watch", "warning", "critical"]
RecommendedAction = Literal["pause", "watch", "reduce_confidence", "review"]


class HrAlertEvent(BaseModel):
    """One triggered alert on the alerts topic."""

    event_id: UUID = Field(default_factory=uuid4)
    event_type: Literal["alert.triggered"] = "alert.triggered"
    alert_type: AlertType
    severity: AlertSeverity
    message: str
    signal_keys: list[SignalKey] = Field(default_factory=list)
    observed_at: datetime
    recommended_action: RecommendedAction = "review"
    evidence: dict = Field(default_factory=dict)
