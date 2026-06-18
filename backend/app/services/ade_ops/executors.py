"""Read-only executors for the 5 PR-1 commands.

Each returns an OpsRunResult in one of three states: OK (real evidence),
DEGRADED (partial evidence + a null_reason for the missing dimension), or
BLOCKED (no usable source). No executor fabricates: every Evidence item carries
a real ``source``, and a dimension with no wired source is reported via
null_reason, never as a zero or an invented number.
"""
from __future__ import annotations

from collections.abc import Callable

from app.services.ade_ops.models import (
    Evidence,
    OpsCommandRequest,
    OpsConfidence,
    OpsNullReason,
    OpsRunResult,
    OpsSkillDef,
    OpsStatus,
)


def _result(skill: OpsSkillDef, **kw) -> OpsRunResult:
    return OpsRunResult(name=skill.name, risk_tier=skill.risk_tier, mode=skill.mode,
                        approval_required=skill.approval_required, **kw)


# ── scan_pipelines (tier 0) — REAL but DEGRADED, per-source ────────────────────

def _scan_pipelines(skill: OpsSkillDef, req: OpsCommandRequest) -> OpsRunResult:
    evidence: list[Evidence] = []

    # In-repo source 1: the ADE Ops skill catalog itself.
    from app.services.ade_ops.registry import ops_registry
    evidence.append(Evidence(
        label="ade_ops_skills", value=len(ops_registry.list_all()),
        source="app.services.ade_ops.registry"))

    # In-repo source 2: the live MCP tool registry (real count; honest if empty).
    try:
        from app.mcp.registry import registry as mcp_registry
        evidence.append(Evidence(
            label="mcp_tools", value=len(mcp_registry.list_all()),
            source="app.mcp.registry"))
    except Exception:  # noqa: BLE001 — never fabricate; just omit on failure
        pass

    # In-repo source 3: recent governed activity (business-scoped).
    if req.business_id:
        try:
            from app.services import governance
            recent = governance.list_decisions(req.business_id, limit=50)
            evidence.append(Evidence(
                label="recent_governed_decisions", value=len(recent),
                source="ai_decision_audit_log"))
        except Exception:  # noqa: BLE001
            pass

    # Cloud pipelines: explicitly NOT configured in PR 1 — reported, not faked.
    evidence.append(Evidence(
        label="cloud_pipelines", value="data_source_not_configured",
        source="(none — cloud adapters land in PR 3)"))

    return _result(
        skill, status=OpsStatus.DEGRADED,
        recommendation="Governed ops + MCP inventory available; cloud pipeline inventory is not configured yet.",
        confidence=OpsConfidence.MEDIUM, evidence=evidence,
        null_reason=OpsNullReason.DATA_SOURCE_NOT_CONFIGURED,  # for the cloud dimension
    )


# ── trust_number (tier 1) — REAL (DEGRADED): governed grounding signal ─────────

def _trust_number(skill: OpsSkillDef, req: OpsCommandRequest) -> OpsRunResult:
    metric = (req.inputs.get("metric_name") or req.inputs.get("metric_ref") or "").strip()
    if not metric:
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.INVALID_INPUTS,
                       recommendation=None)
    if not req.business_id:
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.AUTH_CONTEXT_UNAVAILABLE,
                       recommendation=None)

    evidence: list[Evidence] = []
    try:
        from app.services import governance
        stats = governance.compute_audit_stats(req.business_id, env_id=req.env_id)
        evidence.append(Evidence(
            label="total_decisions", value=stats.get("total_decisions"),
            source="ai_decision_audit_log"))
        if stats.get("avg_grounding_score") is not None:
            evidence.append(Evidence(
                label="avg_grounding_score", value=stats.get("avg_grounding_score"),
                source="ai_decision_audit_log"))
        evidence.append(Evidence(
            label="success_rate",
            value=(round(stats["successful"] / stats["total_decisions"], 3)
                   if stats.get("total_decisions") else None),
            source="ai_decision_audit_log"))
    except Exception:  # noqa: BLE001
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.DURABLE_SOURCE_UNAVAILABLE,
                       recommendation=None)

    # External lineage (dashboard → metric → table → refresh) is not wired in PR 1.
    evidence.append(Evidence(
        label="external_lineage", value="data_source_not_configured",
        source="(none — lineage catalog lands in PR 2+)"))

    return _result(
        skill, status=OpsStatus.DEGRADED,
        recommendation=f"Partial trust signal for '{metric}' from the governed decision log; external lineage is not wired, so this is not a full certification.",
        confidence=OpsConfidence.LOW, evidence=evidence,
        null_reason=OpsNullReason.DATA_SOURCE_NOT_CONFIGURED,  # lineage dimension
    )


# ── Cloud-dependent commands (tier 1) — FAIL CLOSED in PR 1 ────────────────────

def _blocked_no_source(skill: OpsSkillDef, req: OpsCommandRequest) -> OpsRunResult:
    return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                   null_reason=OpsNullReason.DATA_SOURCE_NOT_CONFIGURED,
                   recommendation=None)


EXECUTORS: dict[str, Callable[[OpsSkillDef, OpsCommandRequest], OpsRunResult]] = {
    "ade.inventory.scan_pipelines": _scan_pipelines,
    "ade.lineage.trust_number": _trust_number,
    "ade.freshness.assess": _blocked_no_source,
    "ade.cost.show_hotspots": _blocked_no_source,
    "ade.compute.recommend_rightsize": _blocked_no_source,
}
