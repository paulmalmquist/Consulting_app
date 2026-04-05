"""Lifecycle checkpoint framework for the Winston assistant runtime.

Records phase transitions during a request. Purely observational —
checkpoints log but do not block execution.
"""
from __future__ import annotations

import time
from typing import Any

from app.assistant_runtime.harness.harness_types import (
    HarnessConfig,
    LifecycleCheckpoint,
    LifecyclePhase,
)


class LifecycleManager:
    """Records lifecycle checkpoints for a single assistant turn."""

    def __init__(self, config: HarnessConfig | None = None) -> None:
        self._config = config or HarnessConfig()
        self._checkpoints: list[LifecycleCheckpoint] = []
        self._start_ms = _now_ms()

    def checkpoint(
        self,
        phase: LifecyclePhase | str,
        *,
        context_summary: dict[str, Any] | None = None,
        outcome: str = "ok",
    ) -> LifecycleCheckpoint:
        """Record a checkpoint at the given phase."""
        if not self._config.enable_lifecycle_checkpoints:
            cp = LifecycleCheckpoint(
                phase=str(phase),
                timestamp_ms=_now_ms() - self._start_ms,
            )
            return cp

        cp = LifecycleCheckpoint(
            phase=str(phase),
            timestamp_ms=_now_ms() - self._start_ms,
            context_summary=context_summary or {},
            outcome=outcome,
        )
        self._checkpoints.append(cp)
        return cp

    def get_checkpoints(self) -> list[LifecycleCheckpoint]:
        """Return all recorded checkpoints."""
        return list(self._checkpoints)

    def elapsed_since_start_ms(self) -> int:
        return _now_ms() - self._start_ms


def _now_ms() -> int:
    return int(time.time() * 1000)
