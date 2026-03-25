"""Basic per-process token bucket rate limiter for MCP tools."""

from __future__ import annotations

import time
from dataclasses import dataclass

from app.config import MCP_RATE_LIMIT_RPM


@dataclass
class RateLimitExceeded(Exception):
    retry_after_seconds: float

    def __str__(self):
        return f"Rate limit exceeded. Retry after {self.retry_after_seconds:.1f}s"


class TokenBucket:
    """Simple token bucket rate limiter."""

    def __init__(self, rpm: int = MCP_RATE_LIMIT_RPM):
        self.capacity = rpm
        self.tokens = float(rpm)
        self.refill_rate = rpm / 60.0  # tokens per second
        self.last_refill = time.monotonic()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

    def consume(self, n: int = 1) -> None:
        """Consume n tokens or raise RateLimitExceeded."""
        self._refill()
        if self.tokens < n:
            wait = (n - self.tokens) / self.refill_rate
            raise RateLimitExceeded(retry_after_seconds=wait)
        self.tokens -= n


# Global rate limiter instance (per-process)
_global_limiter = TokenBucket()


def check_rate_limit() -> None:
    """Check the global rate limit. Raises RateLimitExceeded if over limit."""
    _global_limiter.consume()
