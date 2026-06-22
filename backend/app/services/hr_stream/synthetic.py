"""Deterministic synthetic HR signal generator (S2).

Synthetic mode exercises the real wire path without a broker: each tick
generates one event per signal key (seeded random walk inside plausible
ranges, occasional null-with-reason gaps so degraded rendering is exercised
honestly), appends to the in-process ring, and best-effort publishes through
the existing event publisher. Acceptance for this PR is broker-less (ring
only); the broker -> consumer -> persist -> cockpit path is PRs 11-13.

Determinism: same seed -> same series. The generator owns its Random
instance; nothing here touches global random state.
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timezone

from app.events.envelope import EventEnvelope
from app.events.publisher import publish_event
from app.events.topics import hr_stream_topic
from app.services.hr_stream import config
from app.services.hr_stream.contracts import (
    SIGNAL_DOMAINS,
    HrSignalEvent,
    SignalQuality,
)
from app.services.hr_stream.ring import get_ring

logger = logging.getLogger("app.hr_stream")

# Plausible value ranges per signal: (start, step_sigma, low, high, unit).
# fed_tone is categorical and handled separately.
_NUMERIC_PROFILES: dict[str, tuple[float, float, float, float, str]] = {
    "mvrv_z": (2.0, 0.15, -1.5, 7.0, "z_score"),
    "yc_10y2y": (0.5, 0.06, -1.5, 2.5, "percentage_points"),
    "vix_term": (0.05, 0.04, -0.6, 0.6, "ratio_minus_1"),
    "housing": (4.0, 0.3, -12.0, 18.0, "pct_yoy"),
    "cmbs_delinq": (4.5, 0.12, 0.5, 12.0, "pct"),
    "crypto_flow": (0.0, 0.5, -5.0, 5.0, "billions_usd_7d"),
    "macro_surprise": (0.0, 0.2, -2.0, 2.0, "index"),
}

_FED_TONES = ["dovish", "neutral", "hawkish"]

# One null-with-reason gap roughly every N events per key, so the cockpit's
# missing/degraded rendering sees real traffic, not just fixtures.
_GAP_EVERY = 24


class SyntheticGenerator:
    def __init__(self, seed: int = 1789) -> None:
        self._rng = random.Random(seed)
        self._values: dict[str, float] = {k: p[0] for k, p in _NUMERIC_PROFILES.items()}
        self._fed_idx = 1  # neutral
        self._tick_count = 0

    def generate_tick(self, now: datetime) -> list[HrSignalEvent]:
        """One event per signal key, deterministic for a given seed + call order."""
        self._tick_count += 1
        events: list[HrSignalEvent] = []
        prefix = config.topic_prefix()

        for key, (_, sigma, low, high, unit) in _NUMERIC_PROFILES.items():
            domain = SIGNAL_DOMAINS[key]
            topic = hr_stream_topic(prefix, "signal", domain)
            inject_gap = self._rng.random() < (1.0 / _GAP_EVERY)
            previous = self._values[key]
            if inject_gap:
                events.append(HrSignalEvent(
                    source="synthetic", topic=topic, signal_key=key, domain=domain,  # type: ignore[arg-type]
                    observed_at=now, ingested_at=now,
                    value=None, unit=unit, previous_value=round(previous, 4), delta=None,
                    quality=SignalQuality(status="missing", null_reason="synthetic gap injection"),
                    tags=["synthetic"],
                ))
                continue
            step = self._rng.gauss(0.0, sigma)
            value = min(high, max(low, previous + step))
            self._values[key] = value
            # Delta is derived from the rounded wire values so the emitted
            # triple (value, previous_value, delta) is internally consistent.
            wire_value, wire_prev = round(value, 4), round(previous, 4)
            events.append(HrSignalEvent(
                source="synthetic", topic=topic, signal_key=key, domain=domain,  # type: ignore[arg-type]
                observed_at=now, ingested_at=now,
                value=wire_value, unit=unit,
                previous_value=wire_prev, delta=round(wire_value - wire_prev, 4),
                quality=SignalQuality(status="fresh", source_lag_seconds=0.0),
                tags=["synthetic"],
            ))

        # fed_tone: categorical random walk over dovish/neutral/hawkish.
        prev_tone = _FED_TONES[self._fed_idx]
        if self._rng.random() < 0.15:
            self._fed_idx = min(2, max(0, self._fed_idx + self._rng.choice((-1, 1))))
        events.append(HrSignalEvent(
            source="synthetic",
            topic=hr_stream_topic(prefix, "signal", SIGNAL_DOMAINS["fed_tone"]),
            signal_key="fed_tone", domain="sentiment",
            observed_at=now, ingested_at=now,
            value=_FED_TONES[self._fed_idx], unit="category",
            previous_value=None, delta=None,
            quality=SignalQuality(status="fresh", source_lag_seconds=0.0),
            tags=["synthetic", f"prev:{prev_tone}"],
        ))
        return events


def run_tick(generator: SyntheticGenerator, now: datetime | None = None) -> dict:
    """Generate one tick: ring always, broker best-effort.

    Returns a receipt {events, published} — published is the count the
    transport actually accepted (0 with the noop transport; never claimed
    otherwise).
    """
    now = now or datetime.now(timezone.utc)
    events = generator.generate_tick(now)
    get_ring().extend(events)

    published = 0
    for ev in events:
        envelope = EventEnvelope(
            idempotency_key=ev.dedupe_key,
            event_type=ev.event_type,
            occurred_at=ev.observed_at,
            source_service="hr_stream.synthetic",
            payload=ev.model_dump(mode="json"),
        )
        if publish_event(ev.topic, envelope, key=ev.signal_key):
            published += 1
    return {"events": len(events), "published": published}


async def run_synthetic_loop() -> None:
    """Background loop for HR_STREAM_MODE=synthetic. Cancelled at shutdown."""
    generator = SyntheticGenerator()
    interval = config.synthetic_tick_seconds()
    logger.info("hr_stream synthetic loop starting (interval=%ss)", interval)
    while True:
        try:
            run_tick(generator)
        except Exception:
            # The loop must outlive a bad tick; the gap shows up as staleness
            # in the health endpoint, never as a crashed worker.
            logger.warning("hr_stream synthetic tick failed", exc_info=True)
        await asyncio.sleep(interval)
