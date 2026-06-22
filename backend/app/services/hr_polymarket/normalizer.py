"""Normalize public WebSocket and REST reconciliation payloads."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from app.events.envelope import EventEnvelope
from app.services.hr_polymarket.models import NormalizedMarketEvent

SUPPORTED_EVENT_TYPES = {
    "book",
    "price_change",
    "last_trade_price",
    "best_bid_ask",
    "new_market",
    "market_resolved",
    "tick_size_change",
}


class PolymarketNormalizationError(ValueError):
    """A feed message cannot be normalized without losing identity."""


def normalize_message(
    raw_message: str | bytes | dict[str, Any] | list[Any],
    *,
    received_at: datetime | None = None,
    reconciled: bool = False,
) -> list[NormalizedMarketEvent]:
    received = received_at or datetime.now(timezone.utc)
    payload = _decode(raw_message)
    items = payload if isinstance(payload, list) else [payload]
    events: list[NormalizedMarketEvent] = []

    for item in items:
        if not isinstance(item, dict):
            raise PolymarketNormalizationError("message item is not an object")
        event_type = str(item.get("event_type") or item.get("type") or "").strip()
        if event_type not in SUPPORTED_EVENT_TYPES:
            raise PolymarketNormalizationError(
                f"unsupported event_type: {event_type or 'missing'}"
            )

        if event_type == "price_change":
            changes = item.get("price_changes")
            if not isinstance(changes, list) or not changes:
                raise PolymarketNormalizationError("price_change missing price_changes")
            for change in changes:
                if not isinstance(change, dict):
                    raise PolymarketNormalizationError(
                        "price_change item is not an object"
                    )
                expanded = {
                    **change,
                    "event_type": event_type,
                    "market": item.get("market"),
                    "timestamp": item.get("timestamp"),
                }
                events.append(_normalize_one(expanded, item, received, reconciled))
            continue

        events.append(_normalize_one(item, item, received, reconciled))

    return events


def to_event_envelope(event: NormalizedMarketEvent) -> EventEnvelope:
    return EventEnvelope(
        event_type=f"hr.polymarket.{event.event_type}",
        idempotency_key=f"hr.polymarket:{event.event_id}",
        occurred_at=event.observed_at,
        source_service="hr-polymarket-ingest",
        payload=event.model_dump(mode="json"),
    )


def _normalize_one(
    payload: dict[str, Any],
    raw: dict[str, Any],
    received_at: datetime,
    reconciled: bool,
) -> NormalizedMarketEvent:
    observed_at = _timestamp(payload.get("timestamp"), received_at)
    market_id = _string(
        payload.get("market")
        or payload.get("condition_id")
        or payload.get("conditionId")
    )
    asset_id = _string(payload.get("asset_id"))
    event_type = str(payload["event_type"])
    canonical = json.dumps(
        {
            "event_type": event_type,
            "market_id": market_id,
            "asset_id": asset_id,
            "timestamp": observed_at.isoformat(),
            "payload": payload,
            "reconciled": reconciled,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    event_id = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return NormalizedMarketEvent(
        event_id=event_id,
        event_type=event_type,
        market_id=market_id,
        asset_id=asset_id,
        observed_at=observed_at,
        received_at=received_at,
        reconciled=reconciled,
        payload=payload,
        raw=raw,
    )


def _decode(value: str | bytes | dict[str, Any] | list[Any]) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    text = value.strip()
    if text == "PONG":
        return []
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise PolymarketNormalizationError("message is not valid JSON") from exc


def _timestamp(value: Any, fallback: datetime) -> datetime:
    if value in (None, ""):
        return fallback
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return fallback
    if numeric > 10_000_000_000:
        numeric /= 1000.0
    try:
        return datetime.fromtimestamp(numeric, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return fallback


def _string(value: Any) -> str | None:
    return str(value) if value not in (None, "") else None
