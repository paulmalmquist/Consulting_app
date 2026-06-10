"""Event-streaming configuration.

Self-contained so it does not bloat ``app/config.py``. Mirrors that module's
flat ``os.getenv`` pattern. Read once at import; the runtime degrades to a
no-op transport whenever the broker is not configured.
"""

from __future__ import annotations

import os


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


# Master switch. Off by default so the backbone is inert until explicitly enabled.
EVENTS_ENABLED: bool = os.getenv("EVENTS_ENABLED", "false").lower() == "true"

# Kafka bootstrap servers, e.g. "localhost:9092". Empty → no-op transport.
EVENTS_BROKER_URL: str = _clean(os.getenv("EVENTS_BROKER_URL", ""))

# auto | kafka | noop. "auto" picks kafka when enabled + broker set, else noop.
EVENTS_TRANSPORT: str = (os.getenv("EVENTS_TRANSPORT", "auto") or "auto").strip().lower()

# Hard ceiling on how long a single best-effort publish may block.
EVENTS_PUBLISH_TIMEOUT_MS: int = int(os.getenv("EVENTS_PUBLISH_TIMEOUT_MS", "200"))
