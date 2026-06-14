"""Winston event-streaming primitives.

Public surface: build an ``EventEnvelope``, pick a ``Topics`` constant, call
``publish_event``. Everything is best-effort and inert until ``EVENTS_ENABLED``
plus a broker URL are configured.
"""

from __future__ import annotations

from app.events.envelope import SCHEMA_VERSION, EventEnvelope
from app.events.publisher import publish_event
from app.events.topics import EventTypes, Topics

__all__ = ["EventEnvelope", "EventTypes", "SCHEMA_VERSION", "Topics", "publish_event"]
