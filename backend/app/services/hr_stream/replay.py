"""JSONL replay fixture loader for HR stream (PR 13, S6).

Replay mode lets the cockpit receive a pre-recorded event stream without a
live broker. Captured events are read from a JSONL file, validated, and
injected into the ring buffer preserving their original observed_at timestamps
so the cockpit sees realistic time deltas.

File format: one JSON object per line, each a bare HrSignalEvent payload
(produced by model_dump(mode="json")). Empty lines and comment lines (#) are
skipped.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.services.hr_stream.contracts import HrSignalEvent
from app.services.hr_stream.ring import get_ring

logger = logging.getLogger("app.hr_stream.replay")

# Default capture fixture shipped with the repo for local dev/demo.
DEFAULT_FIXTURE = Path(__file__).parent / "fixtures" / "sample_signals.jsonl"


def load_fixture(path: Path | str | None = None) -> list[HrSignalEvent]:
    """Parse a JSONL replay file into validated HrSignalEvent objects.

    Returns only successfully parsed events; malformed lines are logged and
    skipped. Returns [] when the file is missing (not an error — the caller
    surfaces this as a degraded_reason).
    """
    target = Path(path) if path else DEFAULT_FIXTURE
    if not target.exists():
        logger.info("hr replay: fixture not found at %s", target)
        return []

    events: list[HrSignalEvent] = []
    skipped = 0
    with target.open(encoding="utf-8") as fh:
        for lineno, raw in enumerate(fh, 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            try:
                data = json.loads(line)
                events.append(HrSignalEvent.model_validate(data))
            except Exception as exc:
                skipped += 1
                logger.warning("hr replay: skipping line %d: %s", lineno, exc)

    logger.info("hr replay: loaded %d events (%d skipped) from %s", len(events), skipped, target)
    return events


def replay_into_ring(events: list[HrSignalEvent]) -> int:
    """Inject replay events into the ring buffer in observed_at order.

    Returns count of injected events. The ring's newer-only silver guard
    downstream handles de-duplication — replay is safe to call multiple times.
    """
    ordered = sorted(events, key=lambda e: e.observed_at)
    get_ring().extend(ordered)
    return len(ordered)
