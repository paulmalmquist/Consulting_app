"""Approval escrow + execution preflight for ADE Ops (PR 5A).

The approval/execution-CONTROL spine — with **no provider writes**. A PR-4
recommendation can be escrowed into an `ApprovalRequest` (opaque token + TTL +
human approval state); a human can approve it; it expires after the TTL; and an
execution preflight gate requires a rollback plan, observation window, target,
provider, risk tier, and evidence before anything could ever run.

The hard invariant PR 5A holds: **even an approved, preflight-passed request does
not execute.** `EXECUTION_ENABLED = False`; there is no provider-write path, no
subprocess, no CLI call here. `can_execute()` always returns blocked with
`execution_not_enabled`. PR 5B introduces simulated (non-prod) execution; PR 5C
introduces a single, fully-gated real provider write.

Time is injected (`now`) so TTL behavior is deterministic in tests; production
callers pass `datetime.now(timezone.utc)`.
"""
from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum

from pydantic import BaseModel, Field

from app.services.ade_ops.models import RiskTier

# PR 5A: the execution capability is intentionally OFF. Flipping this is a
# separate, deliberate PR (5B simulated / 5C real) — not a config toggle here.
EXECUTION_ENABLED = False

DEFAULT_TTL_SECONDS = 3600
# Preflight gate: every dimension must be present before execution is even eligible.
PREFLIGHT_REQUIRED = ("rollback_plan", "observation_window", "target_ref", "provider", "risk_tier", "evidence")


class ApprovalState(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    EXPIRED = "expired"
    BLOCKED = "blocked"


# ── Allowlist registry SHAPE (data only — no commands, nothing runs) ──────────

@dataclass(frozen=True)
class AllowlistEntry:
    """Describes a provider action that *could* be executed in a later PR, and the
    governance it would require. Carries NO command string — shape only."""

    provider: str
    action_kind: str          # e.g. "warehouse_resize", "job_pause" — a category, not a command
    max_risk_tier: RiskTier
    requires_rollback: bool = True
    requires_observation_window: bool = True
    enabled: bool = False     # PR 5A: nothing is execution-enabled


EXECUTION_ALLOWLIST: tuple[AllowlistEntry, ...] = (
    AllowlistEntry("snowflake", "warehouse_resize", RiskTier.PROD_WRITE),
    AllowlistEntry("databricks", "job_pause", RiskTier.PROD_WRITE),
)


class PreflightResult(BaseModel):
    passed: bool
    missing: list[str] = Field(default_factory=list)
    checked: list[str] = Field(default_factory=list)


class ApprovalRequest(BaseModel):
    approval_id: str
    recommendation_id: str
    command_name: str
    category: str | None = None
    provider: str | None = None
    target_ref: str | None = None
    target_type: str | None = None
    risk_tier: RiskTier = RiskTier.RECOMMENDATION
    approval_token: str
    state: ApprovalState = ApprovalState.PENDING
    requested_by: str | None = None
    approver: str | None = None
    approved_at: str | None = None
    requested_at: str
    expires_at: str
    rollback_plan: str | None = None
    observation_window: str | None = None
    evidence: list[dict] = Field(default_factory=list)
    preflight: PreflightResult | None = None
    executed: bool = False           # PR 5A: always False; PR 5B: True only for simulation
    # PR 5B execution-ceremony fields (None until a simulated execution runs).
    execution_mode: str | None = None
    executed_at: str | None = None
    observation_window_opened_at: str | None = None
    rolled_back: bool = False
    rolled_back_at: str | None = None
    null_reason: str | None = None

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def create_approval_request(
    recommendation: dict, *, requested_by: str | None = None,
    ttl_seconds: int = DEFAULT_TTL_SECONDS, now: datetime,
    rollback_plan: str | None = None, observation_window: str | None = None,
) -> ApprovalRequest:
    """Escrow a PR-4 recommendation. A blocked recommendation is escrowed in the
    BLOCKED state (it can't be approved into execution). rollback_plan /
    observation_window may come from the recommendation or be supplied here."""
    rec_status = (recommendation.get("status") or "").lower()
    state = ApprovalState.BLOCKED if rec_status == "blocked" else ApprovalState.PENDING
    rollback = rollback_plan or ("required" if recommendation.get("rollback_required") else None)
    window = observation_window or recommendation.get("observation_window")
    return ApprovalRequest(
        approval_id=secrets.token_hex(8),
        recommendation_id=recommendation.get("recommendation_id", "unknown"),
        command_name=recommendation.get("command_name", "unknown"),
        category=recommendation.get("category"),
        provider=recommendation.get("provider"),
        target_ref=recommendation.get("target_ref"),
        target_type=recommendation.get("target_type"),
        risk_tier=RiskTier(recommendation.get("risk_tier", int(RiskTier.RECOMMENDATION))),
        approval_token=secrets.token_urlsafe(24),
        state=state,
        requested_by=requested_by,
        requested_at=_iso(now),
        expires_at=_iso(now + timedelta(seconds=ttl_seconds)),
        rollback_plan=rollback,
        observation_window=window,
        evidence=recommendation.get("evidence", []),
        null_reason=("recommendation_blocked" if state is ApprovalState.BLOCKED else None),
    )


def is_expired(req: ApprovalRequest, now: datetime) -> bool:
    return now >= datetime.fromisoformat(req.expires_at)


def refresh_state(req: ApprovalRequest, now: datetime) -> ApprovalRequest:
    """Recompute time-derived state. A pending/approved request past TTL → expired.
    A blocked request stays blocked."""
    if req.state in (ApprovalState.BLOCKED, ApprovalState.EXPIRED):
        return req
    if is_expired(req, now):
        req.state = ApprovalState.EXPIRED
        req.null_reason = "approval_expired"
    return req


def approve(req: ApprovalRequest, *, approver: str, token: str, now: datetime) -> ApprovalRequest:
    """Human approval. Fails closed on a wrong token, an expired window, or a
    blocked request — approval never resurrects a blocked/expired escrow."""
    refresh_state(req, now)
    if req.state is ApprovalState.BLOCKED:
        req.null_reason = "recommendation_blocked"
        return req
    if req.state is ApprovalState.EXPIRED or is_expired(req, now):
        req.state = ApprovalState.EXPIRED
        req.null_reason = "approval_expired"
        return req
    if not secrets.compare_digest(token, req.approval_token):
        req.null_reason = "invalid_approval_token"
        return req
    req.state = ApprovalState.APPROVED
    req.approver = approver
    req.approved_at = _iso(now)
    req.null_reason = None
    return req


def run_preflight(req: ApprovalRequest) -> PreflightResult:
    """Execution preflight: require rollback plan, observation window, target,
    provider, risk tier, and evidence. Missing any → not passed."""
    values = {
        "rollback_plan": req.rollback_plan,
        "observation_window": req.observation_window,
        "target_ref": req.target_ref,
        "provider": req.provider,
        "risk_tier": req.risk_tier,
        "evidence": req.evidence,
    }
    missing = [k for k in PREFLIGHT_REQUIRED if not values.get(k)]
    result = PreflightResult(passed=not missing, missing=missing, checked=list(PREFLIGHT_REQUIRED))
    req.preflight = result
    return result


def can_execute(req: ApprovalRequest, now: datetime) -> tuple[bool, str]:
    """Whether execution is permitted. In PR 5A the answer is ALWAYS no — even for
    an approved, preflight-passed request — because execution capability is off.
    Returns (allowed, reason). `allowed` is the gate result; PR 5A never reaches
    a provider write regardless."""
    refresh_state(req, now)
    if req.state is not ApprovalState.APPROVED:
        return (False, f"not_approved:{req.state.value}")
    pf = req.preflight or run_preflight(req)
    if not pf.passed:
        return (False, f"preflight_failed:{','.join(pf.missing)}")
    # Approved + preflight passed — but PR 5A still does not execute.
    if not EXECUTION_ENABLED:
        return (False, "execution_not_enabled")
    return (True, "ok")  # unreachable in PR 5A (EXECUTION_ENABLED is False)


def attempt_execution(req: ApprovalRequest, now: datetime) -> dict:
    """The execution entry point — which in PR 5A refuses to execute. There is no
    provider-write path here. Always returns executed=False."""
    allowed, reason = can_execute(req, now)
    # Belt-and-suspenders: even if a future bug flipped the gate, PR 5A has no
    # provider-write code, so executed stays False and we report it honestly.
    return {
        "executed": False,                 # invariant: never True in PR 5A
        "execution_enabled": EXECUTION_ENABLED,
        "gate_allowed": allowed,
        "reason": reason,
        "note": "PR 5A is control-only; provider execution lands in PR 5B (simulated) / 5C (real, fully gated).",
    }
