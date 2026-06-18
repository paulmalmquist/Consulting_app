"""ADE Ops supervisor — route a command to a skill, enforce the risk-tier gate,
run only read-only/recommendation skills, and record an immutable receipt.

The supervisor never runs a shell command and never dispatches a tier >= 2
(write-capable) skill in PR 1. It never raises: any executor error degrades the
result rather than propagating.
"""
from __future__ import annotations

from app.services.ade_ops.executors import EXECUTORS
from app.services.ade_ops.models import (
    MAX_EXECUTABLE_TIER,
    OpsCommandRequest,
    OpsMode,
    OpsNullReason,
    OpsRunResult,
    OpsStatus,
    ReceiptStatus,
    RiskTier,
)
from app.services.ade_ops.registry import ops_registry


def run_skill(req: OpsCommandRequest) -> OpsRunResult:
    skill = ops_registry.get(req.skill)
    if skill is None:
        return OpsRunResult(
            name=req.skill, risk_tier=RiskTier.INVENTORY, mode=OpsMode.READ_ONLY,
            status=OpsStatus.BLOCKED, null_reason=OpsNullReason.UNKNOWN_SKILL,
        )

    # ── Risk-tier gate: tier >= 2 (or non-executable) never runs in PR 1. ──
    # The executor is never even looked up, so no write path is reachable.
    if not skill.executable or skill.risk_tier >= MAX_EXECUTABLE_TIER + 1:
        return OpsRunResult(
            name=skill.name, risk_tier=skill.risk_tier, mode=skill.mode,
            status=OpsStatus.BLOCKED,
            null_reason=OpsNullReason.WRITE_CAPABILITY_NOT_ENABLED,
            approval_required=skill.approval_required,
        )

    executor = EXECUTORS.get(skill.name)
    if executor is None:  # registered executable but no executor wired — fail closed
        result = OpsRunResult(
            name=skill.name, risk_tier=skill.risk_tier, mode=skill.mode,
            status=OpsStatus.BLOCKED, null_reason=OpsNullReason.DURABLE_SOURCE_UNAVAILABLE,
            approval_required=skill.approval_required,
        )
    else:
        try:
            result = executor(skill, req)
        except Exception:  # noqa: BLE001 — supervisor never raises
            result = OpsRunResult(
                name=skill.name, risk_tier=skill.risk_tier, mode=skill.mode,
                status=OpsStatus.DEGRADED,
                null_reason=OpsNullReason.DURABLE_SOURCE_UNAVAILABLE,
                approval_required=skill.approval_required,
            )

    _attach_receipt(result, req)
    return result


def _attach_receipt(result: OpsRunResult, req: OpsCommandRequest) -> None:
    """Persist an immutable receipt to ai_decision_audit_log via governance.

    Honest failure handling: governance.record_decision returns None when the
    insert fails (it swallows the DB exception). We surface that as
    receipt_status=FAILED + null_reason=receipt_write_failed and DO NOT claim a
    receipt_id — never the old silent "no receipts" symptom. With no business
    context we skip the write rather than write unscoped.
    """
    if not req.business_id:
        result.receipt_status = ReceiptStatus.SKIPPED
        return

    from app.services import governance

    receipt_id = governance.record_decision(
        business_id=req.business_id,
        env_id=req.env_id,
        actor="ade_ops",
        decision_type="ade_op",
        tool_name=result.name,
        input_summary={"skill": req.skill, "inputs": req.inputs},
        output_summary=result.to_dict(),
        confidence=result.confidence.to_numeric() if result.confidence else None,
        success=(result.status == OpsStatus.OK),
        tags=[f"tier{int(result.risk_tier)}", "ade_op", result.mode.value],
    )
    if receipt_id:
        result.receipt_id = receipt_id
        result.receipt_status = ReceiptStatus.WRITTEN
    else:
        result.receipt_status = ReceiptStatus.FAILED
        # Don't clobber a meaningful executor null_reason on an otherwise-OK run;
        # only set receipt_write_failed when nothing else explains the result.
        if result.null_reason is None:
            result.null_reason = OpsNullReason.RECEIPT_WRITE_FAILED
        if result.status == OpsStatus.OK:
            result.status = OpsStatus.DEGRADED
