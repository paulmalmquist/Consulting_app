"""In-process ring buffer for HR stream events.

The broker-less dev path (and the synthetic mode's read source until
persistence lands in PR 12): a bounded deque holding the most recent events,
plus a latest-per-key view for the cockpit. Thread-safe via a single lock —
writers are the generator/consumer tasks, readers are request handlers.
"""

from __future__ import annotations

import threading
from collections import deque
from datetime import datetime

from app.services.hr_stream.contracts import HrSignalEvent

_RING_MAX = 512


class SignalRing:
    def __init__(self, maxlen: int = _RING_MAX) -> None:
        self._events: deque[HrSignalEvent] = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def append(self, event: HrSignalEvent) -> None:
        with self._lock:
            self._events.append(event)

    def extend(self, events: list[HrSignalEvent]) -> None:
        with self._lock:
            self._events.extend(events)

    def latest_per_key(self) -> dict[str, HrSignalEvent]:
        """Most recent event per signal key, by observed_at."""
        with self._lock:
            out: dict[str, HrSignalEvent] = {}
            for ev in self._events:
                cur = out.get(ev.signal_key)
                if cur is None or ev.observed_at >= cur.observed_at:
                    out[ev.signal_key] = ev
            return out

    def latest_event_at(self) -> datetime | None:
        with self._lock:
            if not self._events:
                return None
            return max(ev.ingested_at for ev in self._events)

    def size(self) -> int:
        with self._lock:
            return len(self._events)


_ring = SignalRing()


def get_ring() -> SignalRing:
    return _ring


def reset_ring() -> None:
    """Test helper — drop all buffered events."""
    global _ring
    _ring = SignalRing()
