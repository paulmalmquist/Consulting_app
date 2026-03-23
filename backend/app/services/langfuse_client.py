"""Langfuse LLM observability client — singleton wrapper with graceful no-op."""
from __future__ import annotations

import logging
import threading
from typing import Any

from app.config import LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY

logger = logging.getLogger(__name__)

try:
    from langfuse import Langfuse
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

_instance: Any = None
_lock = threading.Lock()


def get_langfuse() -> Any | None:
    """Return the Langfuse singleton, or None if not configured/available."""
    global _instance
    if not _AVAILABLE or not LANGFUSE_PUBLIC_KEY:
        return None
    if _instance is not None:
        return _instance
    with _lock:
        if _instance is not None:
            return _instance
        try:
            _instance = Langfuse(
                public_key=LANGFUSE_PUBLIC_KEY,
                secret_key=LANGFUSE_SECRET_KEY,
                host=LANGFUSE_HOST,
            )
            logger.info("Langfuse client initialized (host=%s)", LANGFUSE_HOST)
        except Exception:
            logger.exception("Failed to initialize Langfuse — tracing disabled")
            return None
    return _instance


class NoOpSpan:
    """Silent no-op span used when Langfuse is not configured."""

    def update(self, **kwargs: Any) -> "NoOpSpan":
        return self

    def end(self, **kwargs: Any) -> None:
        pass


class NoOpTrace:
    """Silent no-op trace used when Langfuse is not configured."""

    id: str = ""

    def span(self, **kwargs: Any) -> NoOpSpan:
        return NoOpSpan()

    def generation(self, **kwargs: Any) -> NoOpSpan:
        return NoOpSpan()

    def update(self, **kwargs: Any) -> "NoOpTrace":
        return self

    def score(self, **kwargs: Any) -> None:
        pass


def create_trace(
    *,
    name: str,
    session_id: str | None = None,
    user_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    tags: list[str] | None = None,
    input: Any = None,
) -> Any:
    """Create a Langfuse trace or return a NoOpTrace."""
    lf = get_langfuse()
    if lf is None:
        return NoOpTrace()
    try:
        return lf.trace(
            name=name,
            session_id=session_id,
            user_id=user_id,
            metadata=metadata or {},
            tags=tags or [],
            input=input,
        )
    except Exception:
        logger.exception("Failed to create Langfuse trace")
        return NoOpTrace()


def flush() -> None:
    """Flush pending Langfuse events. Safe to call when not configured."""
    lf = get_langfuse()
    if lf is not None:
        try:
            lf.flush()
        except Exception:
            logger.debug("Langfuse flush failed", exc_info=True)
