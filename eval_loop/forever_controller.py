from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Awaitable, Callable


@dataclass(frozen=True)
class ForeverConfig:
    max_hours: float
    cycle_limit: int
    sleep_seconds: int
    no_improvement_limit: int


async def run_forever(
    *,
    config: ForeverConfig,
    cycle_runner: Callable[[int], Awaitable[dict]],
) -> dict:
    started_at = time.perf_counter()
    cycle = 0
    no_improvement = 0
    best_failed: int | None = None
    history: list[dict] = []
    stop_reason = "cycle_complete"

    while True:
        cycle += 1
        result = await cycle_runner(cycle)
        history.append(result)
        failed_count = int(result.get("failed_count", 0))

        if best_failed is None or failed_count < best_failed:
            best_failed = failed_count
            no_improvement = 0
        else:
            no_improvement += 1

        elapsed_hours = (time.perf_counter() - started_at) / 3600
        if result.get("critical_regression"):
            stop_reason = "critical_regression"
            break
        if config.max_hours and elapsed_hours >= config.max_hours:
            stop_reason = "max_hours_reached"
            break
        if config.cycle_limit and cycle >= config.cycle_limit:
            stop_reason = "cycle_limit_reached"
            break
        if config.no_improvement_limit and no_improvement >= config.no_improvement_limit:
            stop_reason = "no_material_improvement"
            break
        await asyncio.sleep(config.sleep_seconds)

    return {
        "cycles": history,
        "stop_reason": stop_reason,
        "elapsed_hours": round((time.perf_counter() - started_at) / 3600, 4),
    }

