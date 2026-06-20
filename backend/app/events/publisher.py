"""Best-effort event publisher.

``publish_event`` NEVER raises and NEVER blocks beyond the transport's bounded
timeout. A down or unconfigured broker degrades to a no-op. This is the
load-bearing contract: callers (e.g. ``run_execution``) can emit freely without
risking the request path, and CI — which has no broker — exercises the no-op.
"""

from __future__ import annotations

import logging

from app.events import transport as _transport
from app.events.envelope import EventEnvelope

logger = logging.getLogger("app.events")


def publish_event(topic: str, envelope: EventEnvelope, *, key: str | None = None) -> bool:
    """Publish one envelope. Returns True only if a transport accepted it.

    Best-effort: any failure is swallowed and logged, returning False.
    """
    try:
        transport = _transport.get_transport()
        return bool(transport.send(topic, key or envelope.idempotency_key, envelope.to_wire()))
    except Exception:
        logger.warning("event publish failed for topic %s", topic, exc_info=True)
        return False
