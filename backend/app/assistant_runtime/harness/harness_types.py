"""Core types for the Winston harness layer."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class LoopPattern(StrEnum):
    """Bounded loop patterns for multi-step assistant behavior."""

    INVESTIGATE = "investigate"
    ANALYZE = "analyze"
    EXECUTE = "execute"
    DEPLOY_VERIFY = "deploy_verify"
    SITE_TEST = "site_test"


class HarnessMode(StrEnum):
    """Operational modes controlling gate strictness and tool use."""

    SAFE = "safe"
    STANDARD = "standard"
    FAST = "fast"


class GateSeverity(StrEnum):
    """Severity levels for quality gate results."""

    INFO = "info"
    WARNING = "warning"
    FAILURE = "failure"


@dataclass(frozen=True)
class QualityGateResult:
    """Result from a single quality gate check."""

    gate_name: str
    passed: bool
    severity: GateSeverity = GateSeverity.INFO
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "gate": self.gate_name,
            "passed": self.passed,
            "severity": self.severity.value,
            "message": self.message,
        }


@dataclass(frozen=True)
class LifecycleCheckpoint:
    """Record of a lifecycle phase execution."""

    phase: str
    timestamp_ms: int
    context_summary: dict[str, Any] = field(default_factory=dict)
    outcome: str = "ok"


class LifecyclePhase(StrEnum):
    """Lifecycle phases for checkpoint instrumentation."""

    SESSION_START = "session_start"
    PRE_DISPATCH = "pre_dispatch"
    POST_DISPATCH = "post_dispatch"
    PRE_RETRIEVAL = "pre_retrieval"
    POST_RETRIEVAL = "post_retrieval"
    PRE_TOOL = "pre_tool"
    POST_TOOL = "post_tool"
    PRE_RESPONSE = "pre_response"
    POST_RESPONSE = "post_response"


# Default loop pattern configurations
LOOP_DEFAULTS: dict[LoopPattern, dict[str, Any]] = {
    LoopPattern.INVESTIGATE: {"max_iterations": 5, "timeout_ms": 30_000},
    LoopPattern.ANALYZE: {"max_iterations": 3, "timeout_ms": 25_000},
    LoopPattern.EXECUTE: {"max_iterations": 2, "timeout_ms": 20_000},
    LoopPattern.DEPLOY_VERIFY: {"max_iterations": 3, "timeout_ms": 60_000},
    LoopPattern.SITE_TEST: {"max_iterations": 5, "timeout_ms": 120_000},
}


@dataclass
class HarnessConfig:
    """Configuration for the harness layer on a given turn."""

    mode: HarnessMode = HarnessMode.STANDARD
    max_iterations: int = 3
    enable_quality_gates: bool = True
    enable_lifecycle_checkpoints: bool = True
    loop_pattern: LoopPattern | None = None
