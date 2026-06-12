"""History Rhymes stream status routes (S3).

GET /api/hr/v1/stream/health never 500s and never exposes secrets: the
payload is allowlisted to mode/provider/status/consumer_group/topic_prefix/
latest_event_at/lag_seconds/degraded_reason. Missing configuration is the
``not_configured`` status with HTTP 200 — an unconfigured stream is a state,
not a server error.

Status semantics: docs/plans/history-rhymes/streaming-architecture.md.
hr_* module is single-tenant analytics (no env_id/RLS — ARCHITECTURE.md).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter

from app.services.hr_stream import config
from app.services.hr_stream.ring import get_ring

logger = logging.getLogger("app.hr_stream")

router = APIRouter(prefix="/api/hr/v1/stream", tags=["history-rhymes-stream"])

# A synthetic ring older than 3 tick intervals is delayed, not connected.
_DELAY_FACTOR = 3.0


def _base_payload(mode: str) -> dict:
    return {
        "mode": mode,
        "provider": config.kafka_provider() if mode == "live_kafka" else None,
        "status": "not_configured",
        "consumer_group": config.consumer_group(),
        "topic_prefix": config.topic_prefix(),
        "latest_event_at": None,
        "lag_seconds": None,
        "degraded_reason": None,
    }


def build_health() -> dict:
    """Pure-ish health snapshot builder (unit-tested directly)."""
    mode = config.stream_mode()
    payload = _base_payload(mode)

    if mode == "off":
        payload["status"] = "not_configured"
        payload["degraded_reason"] = "HR_STREAM_MODE=off"
        return payload

    if mode == "synthetic":
        ring = get_ring()
        latest = ring.latest_event_at()
        if latest is None:
            payload["status"] = "disconnected"
            payload["degraded_reason"] = "synthetic generator has produced no events"
            return payload
        lag = (datetime.now(timezone.utc) - latest).total_seconds()
        payload["latest_event_at"] = latest.isoformat()
        payload["lag_seconds"] = round(lag, 1)
        threshold = config.synthetic_tick_seconds() * _DELAY_FACTOR
        if lag >= threshold:
            payload["status"] = "delayed"
            payload["degraded_reason"] = (
                f"latest synthetic event is {lag:.0f}s old (threshold {threshold:.0f}s)"
            )
        else:
            payload["status"] = "connected"
        return payload

    # replay / live_kafka: the runner lands in PR 13 (consumer in PR 11,
    # persistence in PR 12). Until then these modes are honestly incomplete.
    payload["status"] = "disconnected"
    payload["degraded_reason"] = f"{mode} consumer not implemented (PR 11-13 pending)"
    return payload


@router.get("/health")
def stream_health() -> dict:
    try:
        return build_health()
    except Exception:
        # Fail closed, not 500: the chip shows disconnected with a reason.
        logger.warning("hr stream health computation failed", exc_info=True)
        payload = _base_payload("off")
        payload["status"] = "disconnected"
        payload["degraded_reason"] = "health computation failed; see backend logs"
        return payload
