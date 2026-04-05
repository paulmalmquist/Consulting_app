"""Bounded loop controller for multi-step assistant behavior.

Wraps async iteration with max_iterations, timeout, and stop conditions.
Framework only — not yet wired to the tool execution loop.
"""
from __future__ import annotations

import time
from typing import Any, AsyncGenerator, Callable

from app.assistant_runtime.harness.harness_types import (
    HarnessConfig,
    LoopPattern,
    LOOP_DEFAULTS,
)


class LoopController:
    """Controls bounded iteration for a given loop pattern."""

    def __init__(
        self,
        pattern: LoopPattern,
        *,
        config: HarnessConfig | None = None,
        stop_conditions: list[Callable[..., bool]] | None = None,
    ) -> None:
        defaults = LOOP_DEFAULTS.get(pattern, {})
        self._pattern = pattern
        self._max_iterations = (config.max_iterations if config else None) or defaults.get("max_iterations", 3)
        self._timeout_ms = defaults.get("timeout_ms", 30_000)
        self._stop_conditions = stop_conditions or []
        self._iteration = 0
        self._started_ms = int(time.time() * 1000)

    @property
    def pattern(self) -> LoopPattern:
        return self._pattern

    @property
    def iteration(self) -> int:
        return self._iteration

    @property
    def max_iterations(self) -> int:
        return self._max_iterations

    def should_continue(self, context: dict[str, Any] | None = None) -> bool:
        """Check whether the loop should continue."""
        if self._iteration >= self._max_iterations:
            return False

        elapsed = int(time.time() * 1000) - self._started_ms
        if elapsed > self._timeout_ms:
            return False

        for condition in self._stop_conditions:
            try:
                if condition(context or {}):
                    return False
            except Exception:
                pass

        return True

    def advance(self) -> int:
        """Advance iteration counter and return current iteration."""
        self._iteration += 1
        return self._iteration

    def summary(self) -> dict[str, Any]:
        """Return loop execution summary."""
        return {
            "pattern": self._pattern.value,
            "iterations": self._iteration,
            "max_iterations": self._max_iterations,
            "elapsed_ms": int(time.time() * 1000) - self._started_ms,
            "timeout_ms": self._timeout_ms,
        }
