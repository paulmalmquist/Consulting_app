"""
Canonical-runtime contract assertions for Winston autonomous eval v1.

Thin adapter over `backend.app.assistant_runtime.response_contract`. The
shared module owns the real implementation; this file preserves the
historical `detect_canonical_failures` signature so `postgres_sink.py`
and any other eval-loop consumers don't change.

Import is lazy — the backend `app` package must be on `sys.path`, which
happens in `runner.bootstrap_backend_imports()`. Tests and services that
call this function outside the runner lifecycle should call
`runner.bootstrap_backend_imports()` themselves first, or inject the path.
"""
from __future__ import annotations

from typing import Any

# Public constants preserved for any downstream grep. The authoritative
# source lives in the shared contract module; we re-export via function.


def _load_contract():
    """Lazy import — backend path may not be on sys.path at module load."""
    from app.assistant_runtime.response_contract import (  # noqa: PLC0415
        CANONICAL_LANES,
        validate_turn,
    )
    return validate_turn, CANONICAL_LANES


# Back-compat constants. Values resolved lazily via accessor if callers
# reference them at module level; import-at-call is the safe form.
CANONICAL_LANES: frozenset[str] = frozenset({"A_FAST", "B_LOOKUP", "C_ANALYSIS"})
LEGACY_LANE: str = "F"


def detect_canonical_failures(
    *,
    scenario: dict[str, Any],
    result: dict[str, Any],
    baseline: dict[str, Any] | None = None,
    latency_regression_multiplier: float = 2.0,
) -> list[dict[str, Any]]:
    """Return a list of {category, evidence} dicts for any canonical-runtime
    contract failures detected in this turn result.

    Thin shim over `validate_turn`. The returned shape preserves the
    original `{category, evidence}` contract so `postgres_sink.py` does
    not need to change.
    """
    validate_turn, _ = _load_contract()

    events = list(result.get("events") or [])
    expectations = (scenario or {}).get("expected") or {}

    # `validate_turn` consumes the same event-list shape the runner produces.
    validation = validate_turn(
        events,
        scenario_expectations=expectations,
        baseline=baseline,
        latency_regression_multiplier=latency_regression_multiplier,
    )

    # Adapt {category, event_index, severity, detail} → {category, evidence}.
    out: list[dict[str, Any]] = []
    for v in validation["violations"]:
        out.append({"category": v["category"], "evidence": v["detail"]})
    return out


__all__ = [
    "CANONICAL_LANES",
    "LEGACY_LANE",
    "detect_canonical_failures",
]
