"""Confluent consumer that materializes Polymarket minute features."""

from __future__ import annotations

import json
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any

from app.events.envelope import EventEnvelope
from app.events.protobuf_codec import build_confluent_conf
from app.events.publisher import publish_event
from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.materializer import PolymarketFeatureMaterializer
from app.services.hr_polymarket.models import (
    MarketDefinition,
    NormalizedMarketEvent,
)
from app.services.hr_polymarket.repository import PolymarketRepository

logger = logging.getLogger("app.hr_polymarket.materializer")


class PolymarketMaterializerWorker:
    def __init__(
        self,
        settings: PolymarketSettings,
        *,
        materializer: PolymarketFeatureMaterializer | None = None,
        repository: PolymarketRepository | None = None,
        publisher=publish_event,
    ) -> None:
        self.settings = settings
        self.materializer = materializer or PolymarketFeatureMaterializer(settings)
        self.repository = repository or PolymarketRepository()
        self.publisher = publisher
        self.pending: deque[NormalizedMarketEvent] = deque(maxlen=5_000)
        self.last_snapshot_bucket: datetime | None = None

    def run_forever(self) -> None:
        if not self.settings.enabled:
            logger.info("Polymarket materializer disabled")
            return

        from confluent_kafka import Consumer

        config = build_confluent_conf(group_id="winston-hr-polymarket-materializer-v1")
        config.update(
            {
                "client.id": "winston-hr-polymarket-materializer",
                "auto.offset.reset": "earliest",
                "enable.auto.commit": False,
            }
        )
        consumer = Consumer(config)
        consumer.subscribe([self.settings.markets_topic, self.settings.raw_topic])
        self.repository.update_stream_status("materializer", status="starting")

        try:
            while True:
                message = consumer.poll(1.0)
                now = datetime.now(timezone.utc)
                if message is not None:
                    if message.error():
                        raise RuntimeError(str(message.error()))
                    self.process_wire(message.topic(), message.value())
                    consumer.commit(message=message, asynchronous=False)
                self.flush_minute(now)
        except KeyboardInterrupt:
            logger.info("Polymarket materializer stopped")
        except Exception as exc:
            self.repository.update_stream_status(
                "materializer",
                status="unavailable",
                connection_last_message_at=self.materializer.connection_last_message_at,
                market_last_event_at=self.materializer.market_last_event_at,
                subscribed_market_count=len(self.materializer.markets),
                last_error=f"{type(exc).__name__}: {exc}",
            )
            raise
        finally:
            consumer.close()

    def process_wire(self, topic: str, raw: bytes) -> None:
        envelope = EventEnvelope.model_validate_json(raw)
        if topic == self.settings.markets_topic:
            market = MarketDefinition.model_validate(envelope.payload)
            self.materializer.register_market(market)
            self.repository.upsert_market(market)
            self._retry_pending()
            return
        if topic == self.settings.raw_topic:
            if envelope.event_type == "hr.polymarket.connection.heartbeat":
                self.materializer.mark_connection_heartbeat(envelope.occurred_at)
                return
            event = NormalizedMarketEvent.model_validate(envelope.payload)
            if not self.materializer.can_resolve(event):
                self.pending.append(event)
                return
            self.materializer.apply(event)
            return
        raise ValueError(f"unsupported Polymarket topic: {topic}")

    def flush_minute(self, now: datetime | None = None) -> int:
        current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        bucket = current.replace(second=0, microsecond=0)
        if self.last_snapshot_bucket == bucket:
            return 0

        snapshots = self.materializer.snapshot_all(at=current)
        for snapshot in snapshots:
            self.repository.upsert_feature(snapshot)
            envelope = EventEnvelope(
                event_type="hr.polymarket.feature.snapshot",
                idempotency_key=(
                    f"hr.polymarket.feature:{snapshot.market_id}:"
                    f"{snapshot.bucket_at.isoformat()}"
                ),
                occurred_at=snapshot.bucket_at,
                source_service="hr-polymarket-materializer",
                payload=snapshot.model_dump(mode="json"),
            )
            if not self.publisher(
                self.settings.features_topic,
                envelope,
                key=snapshot.market_id,
            ):
                raise RuntimeError("required feature snapshot publish failed")

        status = "live"
        last_connection = self.materializer.connection_last_message_at
        if (
            last_connection is None
            or (current - last_connection).total_seconds()
            > self.settings.connection_stale_seconds
        ):
            status = "stale"
        self.repository.update_stream_status(
            "materializer",
            status=status,
            connection_last_message_at=last_connection,
            market_last_event_at=self.materializer.market_last_event_at,
            last_snapshot_at=current,
            subscribed_market_count=len(self.materializer.markets),
        )
        self.last_snapshot_bucket = bucket
        return len(snapshots)

    def _retry_pending(self) -> None:
        retained: deque[NormalizedMarketEvent] = deque(maxlen=self.pending.maxlen)
        while self.pending:
            event = self.pending.popleft()
            if self.materializer.can_resolve(event):
                self.materializer.apply(event)
            else:
                retained.append(event)
        self.pending = retained


def decode_envelope(raw: bytes) -> dict[str, Any]:
    """Diagnostic helper for worker smoke tests."""
    return json.loads(raw)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    PolymarketMaterializerWorker(PolymarketSettings.from_env()).run_forever()


if __name__ == "__main__":
    main()
