"""Type contracts for the AI provider dispatch layer.

Pure data + enums only. This module imports nothing from the database or the
provider adapters, so it is safe to import from the CLI without a live DB.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from pydantic import BaseModel, Field


# ── Enums ───────────────────────────────────────────────────────────


class ProviderName(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMMA_GCP = "gemma_gcp"


class TaskMode(StrEnum):
    # OpenAI-leaning (code / structured / tool execution)
    CODE = "code"
    TOOL_EXECUTION = "tool_execution"
    SQL_DRAFT = "sql_draft"
    EVAL_GRADING = "eval_grading"
    # Claude-leaning (long-context reasoning / review)
    PLANNING = "planning"
    ADVERSARIAL_REVIEW = "adversarial_review"
    RESEARCH_SYNTHESIS = "research_synthesis"
    # Gemma-leaning (cheap private inference)
    SUMMARIZATION = "summarization"
    CLASSIFICATION = "classification"
    LOW_RISK_RAG = "low_risk_rag"
    LOG_EXPLANATION = "log_explanation"
    TELEMETRY_NARRATIVE = "telemetry_narrative"


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Privacy(StrEnum):
    PUBLIC = "public"
    INTERNAL = "internal"
    SENSITIVE = "sensitive"


class DispatchStatus(StrEnum):
    SUCCESS = "success"
    DEGRADED = "degraded"
    BLOCKED = "blocked"
    UNAVAILABLE = "unavailable"


class DispatchNullReason(StrEnum):
    PROVIDER_NOT_CONFIGURED = "provider_not_configured"
    PROVIDER_DISABLED = "provider_disabled"
    CAPABILITY_UNAVAILABLE = "capability_unavailable"
    RISK_TIER_FORBIDDEN = "risk_tier_forbidden"
    PRIVACY_FORBIDDEN = "privacy_forbidden"
    NO_ELIGIBLE_PROVIDER = "no_eligible_provider"
    INVALID_INPUTS = "invalid_inputs"
    FALLBACK_DISABLED = "fallback_disabled"
    PROVIDER_CALL_FAILED = "provider_call_failed"
    RECEIPT_WRITE_FAILED = "receipt_write_failed"


# ── Ordering helpers (used by the policy gate) ──────────────────────

_RISK_ORDER: dict[RiskLevel, int] = {
    RiskLevel.LOW: 0,
    RiskLevel.MEDIUM: 1,
    RiskLevel.HIGH: 2,
}

_PRIVACY_ORDER: dict[Privacy, int] = {
    Privacy.PUBLIC: 0,
    Privacy.INTERNAL: 1,
    Privacy.SENSITIVE: 2,
}


def risk_rank(level: RiskLevel) -> int:
    return _RISK_ORDER[RiskLevel(level)]


def privacy_rank(level: Privacy) -> int:
    return _PRIVACY_ORDER[Privacy(level)]


# ── Provider definition (frozen registry entry) ─────────────────────


@dataclass(frozen=True)
class ProviderDef:
    """A registry entry describing one provider's governed capabilities.

    Mirrors the frozen-dataclass pattern of ``model_registry.ModelCaps`` and
    ``mcp.registry.ToolDef``. ``max_risk`` / ``max_privacy`` are inclusive
    ceilings; ``requires_env`` lists the env vars that must be non-empty for the
    provider to be considered *available*.
    """

    name: ProviderName
    display_name: str
    default_model: str
    allowed_modes: frozenset[TaskMode]
    max_risk: RiskLevel
    max_privacy: Privacy
    fallback_allowed: bool
    requires_env: tuple[str, ...] = ()


# ── Request / decision / result contracts ───────────────────────────


class AIRequest(BaseModel):
    """A dispatch request. ``task`` is the prompt/instruction text."""

    task: str
    mode: TaskMode
    risk_level: RiskLevel = RiskLevel.LOW
    privacy: Privacy = Privacy.INTERNAL
    env_id: str | None = None
    business_id: str | None = None
    require_citations: bool = False
    allow_fallback: bool = False
    forced_provider: ProviderName | None = None
    max_tokens: int = 1024
    metadata: dict = Field(default_factory=dict)


class RoutingDecision(BaseModel):
    """The outcome of provider selection — always transparent about *why*.

    ``rejected`` maps every non-selected provider to the reason it lost, so the
    router can never silently drop a provider.
    """

    status: DispatchStatus
    selected_provider: ProviderName | None = None
    selected_model: str | None = None
    routing_reason: str = ""
    eligible: list[ProviderName] = Field(default_factory=list)
    rejected: dict[str, str] = Field(default_factory=dict)
    fallback_used: bool = False
    fallback_reason: str | None = None
    null_reason: DispatchNullReason | None = None


class Usage(BaseModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class DispatchResult(BaseModel):
    """The full result of ``run_dispatch`` — the dispatch layer's output contract."""

    request_id: str
    status: DispatchStatus
    routing_reason: str = ""
    provider: ProviderName | None = None
    model: str | None = None
    answer: str | None = None
    usage: Usage = Field(default_factory=Usage)
    latency_ms: int | None = None
    fallback_used: bool = False
    rejected: dict[str, str] = Field(default_factory=dict)
    receipt_id: str | None = None
    receipt_status: str = "skipped"  # written | failed | skipped
    null_reason: DispatchNullReason | None = None


# ── Provider adapter return type ────────────────────────────────────


@dataclass
class ProviderCompletion:
    """What a provider adapter returns from ``complete()``."""

    text: str
    model: str
    usage: Usage = field(default_factory=Usage)
    finish_reason: str | None = None
