"""Kafka consumer process for the observational BigQuery event sink."""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Any

from app.events.protobuf_codec import build_confluent_conf
from app.events.sink import process_message
from app.events.topics import Topics

logger = logging.getLogger("app.events.sink_worker")

DEFAULT_TOPICS = (
    Topics.EXECUTIONS,
    Topics.HR_SIGNALS,
    Topics.HR_POLYMARKET_MARKETS,
    Topics.HR_POLYMARKET_RAW,
    Topics.HR_POLYMARKET_FEATURES,
    Topics.HR_POLYMARKET_FORECASTS,
)


def configured_topics(raw: str | None = None) -> list[str]:
    value = raw if raw is not None else os.getenv("EVENT_SINK_TOPICS", "")
    topics = [item.strip() for item in value.split(",") if item.strip()]
    return topics or list(DEFAULT_TOPICS)


class EventSinkWorker:
    def __init__(
        self,
        *,
        topics: list[str] | None = None,
        processor: Callable[[bytes], dict[str, Any]] = process_message,
        consumer: Any | None = None,
    ) -> None:
        self.topics = topics or configured_topics()
        self.processor = processor
        self.consumer = consumer

    def run_forever(self) -> None:
        consumer = self.consumer or self._build_consumer()
        consumer.subscribe(self.topics)
        logger.info("Observational sink subscribed to %s", ", ".join(self.topics))
        try:
            while True:
                message = consumer.poll(1.0)
                if message is None:
                    continue
                if message.error():
                    raise RuntimeError(str(message.error()))
                self.process_message(message, consumer)
        except KeyboardInterrupt:
            logger.info("Observational sink stopped")
        finally:
            consumer.close()

    def process_message(
        self,
        message: Any,
        consumer: Any | None = None,
    ) -> dict[str, Any]:
        result = self.processor(message.value())
        active_consumer = consumer or self.consumer
        if active_consumer is None:
            raise RuntimeError("sink consumer is not configured")
        active_consumer.commit(message=message, asynchronous=False)
        return result

    @staticmethod
    def _build_consumer() -> Any:
        from confluent_kafka import Consumer

        config = build_confluent_conf(
            group_id=os.getenv(
                "EVENT_SINK_CONSUMER_GROUP",
                "winston-observational-bigquery-v1",
            )
        )
        config.update(
            {
                "client.id": "winston-observational-bigquery",
                "auto.offset.reset": os.getenv(
                    "EVENT_SINK_OFFSET_RESET",
                    "earliest",
                ),
                "enable.auto.commit": False,
            }
        )
        return Consumer(config)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    EventSinkWorker().run_forever()


if __name__ == "__main__":
    main()
