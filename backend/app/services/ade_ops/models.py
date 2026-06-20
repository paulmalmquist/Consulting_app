"""ADE Ops contracts: risk tiers, skill definitions, command I/O, receipts.

Pure data + enums. No I/O here. The risk-tier model is the safety spine:
tiers 0-1 are read-only/recommendation and executable in PR 1; tiers >= 2 are
write-capable and intentionally NOT executable in PR 1.
"""
from __future__ import annotations

from enum import IntEnum, StrEnum

from pydantic import BaseModel, Field

from app.assistant_runtime.turn_receipts import PermissionMode


class RiskTier(IntEnum):
    """Doc's 0-5 risk ladder. >= DRY_RUN is write-capable (blocked in PR 1)."""

    INVENTORY = 0          # read-only inventory
    RECOMMENDATION = 1     # recommendation only
    DRY_RUN = 2            # dry-run patch / generated ticket
    NONPROD_WRITE = 3      # non-prod write
    PROD_WRITE = 4         # prod write
    ROLLBACK = 5           # rollback / emergency


# Display-only mapping onto the existing MCP permission vocabulary. Tiers >= 2
# all map to a write permission so the executable gate is simply "tier >= 2".
RISK_TIER_TO_PERMISSION: dict[RiskTier, PermissionMode] = {
    RiskTier.INVENTORY: PermissionMode.READ,
    RiskTier.RECOMMENDATION: PermissionMode.ANALYZE,
    RiskTier.DRY_RUN: PermissionMode.WRITE_CONFIRMED,
    RiskTier.NONPROD_WRITE: PermissionMode.WRITE_CONFIRMED,
    RiskTier.PROD_WRITE: PermissionMode.WRITE_CONFIRMED,
    RiskTier.ROLLBACK: PermissionMode.PRIVILEGED,
}

# The highest tier the PR 1 supervisor will ever execute. Anything above is
# registered/visible but returns BLOCKED.
MAX_EXECUTABLE_TIER = RiskTier.RECOMMENDATION


class OpsMode(StrEnum):
    READ_ONLY = "read_only"
    RECOMMENDATION_ONLY = "recommendation_only"
    DRY_RUN = "dry_run"
    WRITE_GATED = "write_gated"
    ROLLBACK = "rollback"


class OpsStatus(StrEnum):
    OK = "ok"              # real evidence, usable result
    DEGRADED = "degraded"  # partial evidence; some dimension fail-closed
    BLOCKED = "blocked"    # no usable source / not permitted; null_reason set


class OpsConfidence(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

    def to_numeric(self) -> float:
        return {"low": 0.3, "medium": 0.6, "high": 0.9}[self.value]


class OpsNullReason(StrEnum):
    """Why a result is not a usable recommendation. Honest diagnostics only."""

    DATA_SOURCE_NOT_CONFIGURED = "data_source_not_configured"
    WRITE_CAPABILITY_NOT_ENABLED = "write_capability_not_enabled"
    UNKNOWN_SKILL = "unknown_skill"
    INVALID_INPUTS = "invalid_inputs"
    RECEIPT_WRITE_FAILED = "receipt_write_failed"
    AUTH_CONTEXT_UNAVAILABLE = "auth_context_unavailable"
    DURABLE_SOURCE_UNAVAILABLE = "durable_source_unavailable"
    UNSUPPORTED_COMMAND_INPUT = "unsupported_command_input"


class ReceiptStatus(StrEnum):
    WRITTEN = "written"
    FAILED = "failed"
    SKIPPED = "skipped"   # no auth/business context to scope the write


class Evidence(BaseModel):
    """A single piece of supporting evidence. ``source`` is mandatory and
    non-empty — structural enforcement of the no-fabrication rule."""

    label: str
    value: object | None = None
    source: str = Field(min_length=1)
    as_of: str | None = None


class OpsSkillDef(BaseModel):
    """A catalog entry. Pure metadata; never carries a shell/command string."""

    name: str
    family: str
    description: str
    risk_tier: RiskTier
    mode: OpsMode
    executable: bool
    approval_required: bool
    lane: str
    input_fields: list[str] = Field(default_factory=list)

    def manifest(self) -> dict:
        return {
            "name": self.name,
            "family": self.family,
            "description": self.description,
            "risk_tier": int(self.risk_tier),
            "risk_tier_name": self.risk_tier.name.lower(),
            "mode": self.mode.value,
            "executable": self.executable,
            "approval_required": self.approval_required,
            "permission_required": RISK_TIER_TO_PERMISSION[self.risk_tier].value,
            "lane": self.lane,
            "input_fields": self.input_fields,
        }


class OpsCommandRequest(BaseModel):
    """A request to run one skill. There is deliberately NO free-form command
    or shell field — only a registered skill name plus typed inputs."""

    skill: str
    inputs: dict = Field(default_factory=dict)
    env_id: str | None = None
    business_id: str | None = None


class OpsRunResult(BaseModel):
    """The doc's output contract. ``receipt_id`` is set only on a successful
    receipt write; ``receipt_status`` always tells the caller what happened."""

    name: str
    risk_tier: RiskTier
    mode: OpsMode
    status: OpsStatus
    recommendation: str | None = None
    confidence: OpsConfidence | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    null_reason: OpsNullReason | None = None
    approval_required: bool = False
    receipt_id: str | None = None
    receipt_status: ReceiptStatus = ReceiptStatus.SKIPPED
    # PR 4: governed recommendation artifacts (pre-serialized AdeOpsRecommendation
    # dicts; stored as dicts to avoid a models<->recommendations import cycle).
    recommendations: list[dict] = Field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "risk_tier": int(self.risk_tier),
            "mode": self.mode.value,
            "status": self.status.value,
            "recommendation": self.recommendation,
            "confidence": self.confidence.value if self.confidence else None,
            "evidence": [e.model_dump() for e in self.evidence],
            "null_reason": self.null_reason.value if self.null_reason else None,
            "approval_required": self.approval_required,
            "receipt_id": self.receipt_id,
            "receipt_status": self.receipt_status.value,
            "recommendations": self.recommendations,
        }
