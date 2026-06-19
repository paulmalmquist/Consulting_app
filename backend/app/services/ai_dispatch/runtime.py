"""Runtime, frontend-controllable dispatch flags.

The Gemma on/off toggle is process-local state, initialized from ``AI_DISPATCH_GEMMA_ENABLED`` and
flippable at runtime via the admin ``/api/ai/dispatch/config`` endpoint (no redeploy needed). It
resets to the env default on restart — a deliberately conservative MVP (a backend restart can't leave
Gemma silently on). When Gemma is off, Gemma-eligible modes fall back to the small frontier model;
they never fail closed just because the toggle is off.
"""
from __future__ import annotations

_gemma_enabled: bool | None = None


def _default() -> bool:
    from app import config

    return bool(getattr(config, "AI_DISPATCH_GEMMA_ENABLED", False))


def gemma_enabled() -> bool:
    """Current runtime Gemma toggle (lazy-initialized from the env default)."""
    global _gemma_enabled
    if _gemma_enabled is None:
        _gemma_enabled = _default()
    return _gemma_enabled


def set_gemma_enabled(value: bool) -> bool:
    """Flip the runtime Gemma toggle. Returns the new value."""
    global _gemma_enabled
    _gemma_enabled = bool(value)
    return _gemma_enabled
