"""Long-running public Polymarket discovery and WebSocket ingestion worker."""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from app.events.envelope import EventEnvelope
from app.events.publisher import publish_event
from app.services.hr_polymarket.client import PolymarketPublicClient
from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.models import MarketDefinition
from app.services.hr_polymarket.normalizer import (
    PolymarketNormalizationError,
    normalize_message,
    to_event_envelope,
)

logger = logging.getLogger("app.hr_polymarket.ingest")

Publisher = Callable[..., bool]


class PolymarketIngestionWorker:
    def __init__(
        self,
        settings: PolymarketSettings,
        *,
        client: PolymarketPublicClient | None = None,
        publisher: Publisher = publish_event,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.settings = settings
        self.client = client or PolymarketPublicClient(settings)
        self.publisher = publisher
        self.monotonic = monotonic
        self.last_connection_message_at: datetime | None = None
        self.last_market_event_at: datetime | None = None
        self.reconnect_count = 0

    async def run_forever(self) -> None:
        if not self.settings.enabled:
            logger.info("Polymarket worker disabled")
            return

        delay = 1.0
        while True:
            try:
                result = await asyncio.to_thread(self.client.discover_markets)
                if not result.selected:
                    raise RuntimeError("Polymarket discovery selected zero markets")
                self._publish_markets(result.selected)

                import websockets

                async with websockets.connect(
                    self.settings.websocket_url,
                    ping_interval=None,
                    close_timeout=5,
                    max_size=4 * 1024 * 1024,
                ) as websocket:
                    delay = 1.0
                    await self.run_session(websocket, result.selected)
            except asyncio.CancelledError:
                raise
            except Exception:
                self.reconnect_count += 1
                logger.exception(
                    "Polymarket stream session failed; reconnecting in %.1fs", delay
                )
                await asyncio.sleep(delay + random.uniform(0, min(delay / 4, 2)))
                delay = min(delay * 2, 60.0)

    async def run_session(
        self,
        websocket: Any,
        markets: list[MarketDefinition],
        *,
        max_messages: int | None = None,
    ) -> None:
        current = {market.market_id: market for market in markets}
        current_assets = _asset_ids(current.values())
        await websocket.send(
            json.dumps(
                {
                    "assets_ids": sorted(current_assets),
                    "type": "market",
                    "custom_feature_enabled": True,
                }
            )
        )

        now = self.monotonic()
        next_ping = now + 10.0
        next_discovery = now + self.settings.discovery_seconds
        next_reconcile = now + self.settings.reconcile_seconds
        processed = 0

        while max_messages is None or processed < max_messages:
            now = self.monotonic()
            timeout = max(
                min(next_ping, next_discovery, next_reconcile) - now,
                0.01,
            )
            message: Any | None = None
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=timeout)
            except asyncio.TimeoutError:
                pass

            if message is not None:
                self.last_connection_message_at = datetime.now(timezone.utc)
                if message == "PONG":
                    self._publish_heartbeat(self.last_connection_message_at)
                else:
                    self._publish_raw_message(message)
                    self.last_market_event_at = datetime.now(timezone.utc)
                    processed += 1

            now = self.monotonic()
            if now >= next_ping:
                await websocket.send("PING")
                next_ping = now + 10.0

            if now >= next_discovery:
                result = await asyncio.to_thread(self.client.discover_markets)
                replacement = {market.market_id: market for market in result.selected}
                replacement_assets = _asset_ids(replacement.values())
                added = sorted(replacement_assets - current_assets)
                removed = sorted(current_assets - replacement_assets)
                if added:
                    await websocket.send(
                        json.dumps(
                            {
                                "assets_ids": added,
                                "operation": "subscribe",
                                "custom_feature_enabled": True,
                            }
                        )
                    )
                if removed:
                    await websocket.send(
                        json.dumps(
                            {"assets_ids": removed, "operation": "unsubscribe"}
                        )
                    )
                self._publish_markets(result.selected)
                current = replacement
                current_assets = replacement_assets
                next_discovery = now + self.settings.discovery_seconds

            if now >= next_reconcile:
                await asyncio.to_thread(self.reconcile_books, list(current.values()))
                next_reconcile = now + self.settings.reconcile_seconds

    def reconcile_books(self, markets: list[MarketDefinition]) -> None:
        for market in markets:
            for asset_id in market.asset_ids:
                try:
                    payload = self.client.get_order_book(asset_id)
                    payload.setdefault("market", market.condition_id)
                    self._publish_normalized(payload, reconciled=True)
                except Exception as exc:
                    self._publish_dead_letter(
                        reason=f"order_book_reconciliation_failed:{type(exc).__name__}",
                        raw={"market_id": market.market_id, "asset_id": asset_id},
                    )

    def _publish_markets(self, markets: list[MarketDefinition]) -> None:
        observed_at = datetime.now(timezone.utc)
        for market in markets:
            envelope = EventEnvelope(
                event_type="hr.polymarket.market.discovered",
                idempotency_key=f"hr.polymarket.market:{market.market_id}",
                occurred_at=observed_at,
                source_service="hr-polymarket-ingest",
                payload=market.model_dump(mode="json"),
            )
            self._publish_required(
                self.settings.markets_topic,
                envelope,
                key=market.market_id,
            )

    def _publish_heartbeat(self, observed_at: datetime) -> None:
        envelope = EventEnvelope(
            event_type="hr.polymarket.connection.heartbeat",
            idempotency_key=(
                "hr.polymarket.connection.heartbeat:"
                f"{int(observed_at.timestamp())}"
            ),
            occurred_at=observed_at,
            source_service="hr-polymarket-ingest",
            payload={"received_at": observed_at.isoformat()},
        )
        self._publish_required(
            self.settings.raw_topic,
            envelope,
            key="connection",
        )

    def _publish_raw_message(self, message: Any) -> None:
        try:
            self._publish_normalized(message)
        except PolymarketNormalizationError as exc:
            self._publish_dead_letter(reason=str(exc), raw=_safe_raw(message))

    def _publish_normalized(self, message: Any, *, reconciled: bool = False) -> None:
        for event in normalize_message(message, reconciled=reconciled):
            key = event.market_id or event.asset_id or event.event_id
            self._publish_required(
                self.settings.raw_topic,
                to_event_envelope(event),
                key=key,
            )

    def _publish_dead_letter(self, *, reason: str, raw: Any) -> None:
        now = datetime.now(timezone.utc)
        envelope = EventEnvelope(
            event_type="hr.polymarket.dead_letter",
            idempotency_key=(
                f"hr.polymarket.dead_letter:{int(now.timestamp() * 1_000_000)}"
            ),
            occurred_at=now,
            source_service="hr-polymarket-ingest",
            payload={"reason": reason, "raw": raw},
        )
        if not self.publisher(
            self.settings.dead_letter_topic,
            envelope,
            key=envelope.idempotency_key,
        ):
            logger.error("Failed to publish Polymarket dead-letter event: %s", reason)

    def _publish_required(
        self,
        topic: str,
        envelope: EventEnvelope,
        *,
        key: str,
    ) -> None:
        if not self.publisher(topic, envelope, key=key):
            raise RuntimeError(f"required publish failed for {topic}")


def _asset_ids(markets: Any) -> set[str]:
    return {
        asset_id
        for market in markets
        for asset_id in (market.yes_token_id, market.no_token_id)
    }


def _safe_raw(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (str, dict, list)):
        return value
    return repr(value)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(
        PolymarketIngestionWorker(PolymarketSettings.from_env()).run_forever()
    )


if __name__ == "__main__":
    main()
