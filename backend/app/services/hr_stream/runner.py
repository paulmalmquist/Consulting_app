"""Mode-dispatch lifespan task for the HR stream (PR 13, S6).

Exactly one background task runs at startup when HR_STREAM_MODE != off:
  - synthetic: delegates to run_synthetic_loop() (defined in synthetic.py)
  - replay:    loads the JSONL fixture once, injects into ring, then writes
               health every HEALTH_INTERVAL seconds (no ongoing loop needed)
  - live_kafka: subscribe → consume_batch loop with persistence and health

All paths write health to the DB via write_health() every HEALTH_INTERVAL
seconds so the health endpoint reflects real state, not the stale ring probe.
DB unavailability is logged and skipped — the ring-based fallback in the
health route covers DB-down.

The runner registers as a FastAPI lifespan context manager. Shutdown is
triggered by asyncio.CancelledError which is caught and propagates cleanly.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from app.services.hr_stream import config
from app.services.hr_stream.contracts import SIGNAL_DOMAINS

logger = logging.getLogger("app.hr_stream.runner")

HEALTH_INTERVAL = 30  # seconds between DB health writes


async def _write_health_safe(snapshot: dict) -> None:
    """Best-effort DB health write — never raises."""
    try:
        from app.db import get_cursor
        from app.services.hr_stream.persist import write_health

        with get_cursor() as cur:
            write_health(cur, snapshot)
    except Exception:
        logger.debug("hr runner: health write failed (non-fatal)", exc_info=True)


async def _replay_task() -> None:
    """Replay mode: inject fixture once, then write health until cancelled."""
    from app.services.hr_stream.replay import load_fixture, replay_into_ring

    events = load_fixture()
    count = replay_into_ring(events)

    if count == 0:
        status = "disconnected"
        reason = "replay fixture missing or empty"
    else:
        status = "replaying"
        reason = None

    logger.info("hr runner: replay mode loaded %d events (status=%s)", count, status)

    while True:
        from app.services.hr_stream.ring import get_ring
        ring = get_ring()
        latest = ring.latest_event_at()
        lag = (datetime.now(timezone.utc) - latest).total_seconds() if latest else None

        snapshot = {
            "mode": "replay",
            "provider": None,
            "status": status,
            "consumer_group": config.consumer_group(),
            "topic_prefix": config.topic_prefix(),
            "latest_event_at": latest,
            "lag_seconds": round(lag, 1) if lag is not None else None,
            "degraded_reason": reason,
        }
        await _write_health_safe(snapshot)
        await asyncio.sleep(HEALTH_INTERVAL)


async def _live_kafka_task() -> None:
    """Live Kafka mode: subscribe → consume_batch loop with persist + health."""
    from app.events.consumer import get_consumer
    from app.services.hr_stream.persist import commit_offset, persist_event
    from app.services.hr_stream.ring import get_ring
    from app.services.hr_stream.subscriber import consume_batch, ring_handler, subscription_topics

    consumer = get_consumer()
    mode_label = "live_kafka"

    if consumer.name == "noop":
        logger.warning("hr runner: live_kafka mode but consumer resolved to noop — check credentials")

    prefix = config.topic_prefix()
    topics = subscription_topics(prefix)
    consumer.subscribe(topics)
    logger.info("hr runner: live_kafka subscribed to %d topics", len(topics))

    last_health_write = 0.0
    group = config.consumer_group()

    def persist_handler(event, consumed):
        """Ring + DB persist (at-least-once; idempotent on dedupe_key)."""
        ring_handler(event, consumed)
        try:
            from app.db import get_cursor
            with get_cursor() as cur:
                persist_event(cur, event, mode=mode_label)
                commit_offset(cur, group, consumed.topic, consumed.partition, consumed.offset)
        except Exception:
            logger.warning("hr runner: persist failed for %s", event.signal_key, exc_info=True)

    while True:
        try:
            consume_batch(consumer, persist_handler, max_events=128, timeout_s=1.0)
        except Exception:
            logger.warning("hr runner: consume_batch raised unexpectedly", exc_info=True)

        now = asyncio.get_event_loop().time()
        if now - last_health_write >= HEALTH_INTERVAL:
            ring = get_ring()
            latest = ring.latest_event_at()
            lag = (datetime.now(timezone.utc) - latest).total_seconds() if latest else None
            status = "connected" if latest and lag is not None and lag < 120 else "delayed"
            snapshot = {
                "mode": mode_label,
                "provider": config.kafka_provider(),
                "status": status if consumer.name != "noop" else "disconnected",
                "consumer_group": group,
                "topic_prefix": prefix,
                "latest_event_at": latest,
                "lag_seconds": round(lag, 1) if lag is not None else None,
                "degraded_reason": "consumer is noop — check credentials" if consumer.name == "noop" else None,
            }
            await _write_health_safe(snapshot)
            last_health_write = now

        await asyncio.sleep(0.1)  # yield; actual pacing comes from Kafka poll timeout


@asynccontextmanager
async def hr_stream_lifespan():
    """FastAPI lifespan hook: start the correct runner task, cancel at shutdown."""
    mode = config.stream_mode()
    task = None

    if mode == "off":
        logger.debug("hr_stream: mode=off, no runner started")
        yield
        return

    if mode == "synthetic":
        from app.services.hr_stream.synthetic import run_synthetic_loop
        coro = run_synthetic_loop()
    elif mode == "replay":
        coro = _replay_task()
    elif mode == "live_kafka":
        coro = _live_kafka_task()
    else:
        logger.warning("hr_stream: unknown mode %r, runner not started", mode)
        yield
        return

    task = asyncio.create_task(coro, name=f"hr_stream_{mode}")
    logger.info("hr_stream: started %s runner task", mode)

    try:
        yield
    finally:
        if task and not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            logger.info("hr_stream: %s runner stopped", mode)
