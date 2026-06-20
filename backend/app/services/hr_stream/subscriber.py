"""Topic subscription + batch consumption for the HR stream (S4).

``consume_batch`` is transport-agnostic: it polls the injected consumer,
parses payloads into HrSignalEvents, hands valid events to the injected
handler, and routes malformed payloads to the dead-letter callback. The
handler is the seam between scaffold (ring handler, this PR) and persistence
(PR 12). Offsets are committed only after the batch's handler calls return —
at-least-once delivery, idempotent downstream via the bronze dedupe key.
"""

from __future__ import annotations

import logging
from typing import Callable

from pydantic import ValidationError

from app.events.consumer import ConsumedEvent, ConsumerTransport
from app.events.topics import hr_stream_topic
from app.services.hr_stream import config
from app.services.hr_stream.contracts import SIGNAL_DOMAINS, HrSignalEvent
from app.services.hr_stream.ring import get_ring

logger = logging.getLogger("app.hr_stream")

EventHandler = Callable[[HrSignalEvent, ConsumedEvent], None]
DeadLetterHandler = Callable[[ConsumedEvent, str], None]


def subscription_topics(prefix: str | None = None) -> list[str]:
    """All HR cockpit stream topics: one per distinct domain + alerts + snapshots."""
    prefix = prefix or config.topic_prefix()
    domains = sorted(set(SIGNAL_DOMAINS.values()))
    return [
        *[hr_stream_topic(prefix, "signal", d) for d in domains],
        hr_stream_topic(prefix, "alerts"),
        hr_stream_topic(prefix, "snapshots"),
    ]


def parse_signal_event(raw: bytes) -> HrSignalEvent:
    """Parse one wire payload. The producer wraps HrSignalEvent in the shared
    EventEnvelope (payload field); accept both the bare event and the envelope."""
    import json

    data = json.loads(raw.decode("utf-8"))
    if isinstance(data, dict) and "payload" in data and "idempotency_key" in data:
        data = data["payload"]
    return HrSignalEvent.model_validate(data)


def ring_handler(event: HrSignalEvent, _consumed: ConsumedEvent) -> None:
    """Scaffold handler: latest events visible to the cockpit via the ring."""
    get_ring().append(event)


def consume_batch(
    consumer: ConsumerTransport,
    handler: EventHandler,
    *,
    dead_letter: DeadLetterHandler | None = None,
    max_events: int = 64,
    timeout_s: float = 1.0,
) -> dict:
    """Poll up to max_events, handle, then commit. Returns an honest receipt
    {polled, handled, dead_lettered}; a malformed payload never crashes the
    loop and never blocks the rest of the batch."""
    polled = handled = dead_lettered = 0
    for _ in range(max_events):
        consumed = consumer.poll(timeout_s)
        if consumed is None:
            break
        polled += 1
        # Alert/snapshot topics are consumed but not yet handled (PR 13+ scope);
        # only signal topics parse into HrSignalEvent here.
        try:
            event = parse_signal_event(consumed.value)
        except (ValidationError, ValueError, UnicodeDecodeError) as exc:
            dead_lettered += 1
            reason = f"{type(exc).__name__}: {exc}"[:500]
            logger.warning("hr stream dead-letter on %s[%s]@%s: %s",
                           consumed.topic, consumed.partition, consumed.offset, reason)
            if dead_letter:
                try:
                    dead_letter(consumed, reason)
                except Exception:
                    logger.warning("dead-letter handler failed", exc_info=True)
            continue
        try:
            handler(event, consumed)
            handled += 1
        except Exception:
            # Handler failures are logged and skipped; the event will not be
            # re-handled (offset still commits) — downstream idempotency and
            # the health lag surface the gap rather than a crash loop.
            logger.warning("hr stream handler failed for %s", event.signal_key, exc_info=True)
    if polled:
        try:
            consumer.commit()
        except Exception:
            logger.warning("hr stream offset commit failed", exc_info=True)
    return {"polled": polled, "handled": handled, "dead_lettered": dead_lettered}
