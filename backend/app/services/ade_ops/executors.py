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

    # Cloud providers (PR 3): real per-provider config status via the read-only
    # adapters. With no telemetry wired (the default), each reports not_configured
    # with its own null_reason — honest, never faked.
    try:
        from app.services.ade_ops.cloud import providers as cloud_providers
        for st in cloud_providers.all_provider_status():
            evidence.append(Evidence(
                label=f"cloud:{st.provider.value}",
                value=(st.status.value if st.status.value == "configured"
                       else f"{st.status.value} ({st.null_reason})"),
                source=st.evidence_source or "ade_ops.cloud"))
    except Exception:  # noqa: BLE001 — never fabricate; omit on failure
        pass

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


# ── assess_freshness (tier 1) — REAL for Winston durable products (PR 2) ───────

def _assess_freshness(skill: OpsSkillDef, req: OpsCommandRequest) -> OpsRunResult:
    """Real freshness for a *known* durable data product; fail closed otherwise.

    A cloud platform (snowflake/databricks/gcp/aws) is explicitly out of scope in
    PR 2 and fails closed. An unknown product id fails closed. A known durable
    product is read from its own freshness contract (no fabricated timestamp).
    """
    platform = (req.inputs.get("platform") or "").strip().lower()
    if platform in {"snowflake", "databricks", "gcp", "aws", "bigquery"}:
        # Cloud-platform freshness lands in PR 3.
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.DATA_SOURCE_NOT_CONFIGURED,
                       recommendation=None)

    product_id = (req.inputs.get("data_product_id") or req.inputs.get("table_name") or "").strip()
    if not product_id:
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.INVALID_INPUTS, recommendation=None)
    if not req.business_id:
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.AUTH_CONTEXT_UNAVAILABLE, recommendation=None)

    from app.services.ade_ops import freshness as fr

    product = fr.resolve_product(product_id)
    if product is None:
        # Known-unknown: not a durable product ADE Ops can read yet.
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.DATA_SOURCE_NOT_CONFIGURED, recommendation=None)

    try:
        reading = fr.read_product(product, req.env_id or "", req.business_id)
    except Exception:  # noqa: BLE001
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.DURABLE_SOURCE_UNAVAILABLE, recommendation=None)
    if reading is None:
        # Product is registered but its freshness contract has no row here
        # (e.g. tables not migrated / surface never marked) — fail closed, no guess.
        return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                       null_reason=OpsNullReason.DURABLE_SOURCE_UNAVAILABLE, recommendation=None)

    recommendation, conf = fr.recommend_cadence(reading, product)
    evidence = [
        Evidence(label="product", value=product.label, source=reading.source),
        Evidence(label="status", value=reading.status, source=reading.source),
        Evidence(label="as_of", value=reading.as_of.isoformat() if reading.as_of else None,
                 source=reading.source),
        Evidence(label="age_seconds", value=reading.age_seconds, source=reading.source),
        Evidence(label="target_cadence_seconds", value=product.cadence_seconds,
                 source="ade_ops.freshness.DURABLE_PRODUCTS"),
    ]
    if reading.detail:
        evidence.append(Evidence(label="pipeline_reason", value=reading.detail, source=reading.source))

    # A failed/stale product is real-but-degraded; a fresh one is OK.
    status = OpsStatus.OK if reading.status == "fresh" else OpsStatus.DEGRADED
    null_reason = None if status == OpsStatus.OK else OpsNullReason.DURABLE_SOURCE_UNAVAILABLE if reading.status == "failed" else None
    return _result(skill, status=status, recommendation=recommendation,
                   confidence={"low": OpsConfidence.LOW, "medium": OpsConfidence.MEDIUM, "high": OpsConfidence.HIGH}[conf],
                   evidence=evidence, null_reason=null_reason)


# ── show_cost_hotspots (tier 1, PR 3) — AVAILABILITY ONLY, no recommendation ──

def _show_cost_hotspots(skill: OpsSkillDef, req: OpsCommandRequest) -> OpsRunResult:
    """PR 3 reports per-provider cost-OBSERVATION availability from the read-only
    adapters; it does NOT compute hotspots or recommend anything (that is PR 4).

    With no provider telemetry wired (the default), every provider is
    not_configured -> the command stays recommendation-disabled and fails closed,
    but it can still report which providers *could* offer cost observation.
    """
    from app.services.ade_ops.cloud import providers as cloud_providers
    statuses = cloud_providers.all_provider_status()
    evidence = [
        Evidence(
            label=f"cost_observation:{st.provider.value}",
            value=("available" if st.cost_observation_available
                   else f"unavailable ({st.null_reason})" if st.null_reason else "unavailable"),
            source=st.evidence_source or "ade_ops.cloud")
        for st in statuses
    ]
    any_cost = any(st.cost_observation_available for st in statuses)
    if not any_cost:
        # No provider can offer cost observation yet -> fail closed, no recommendation.
        return _result(skill, status=OpsStatus.BLOCKED, evidence=evidence,
                       null_reason=OpsNullReason.DATA_SOURCE_NOT_CONFIGURED,
                       recommendation=None)
    # Some provider exposes cost observation, but PR 3 does not optimize: report
    # availability only, explicitly no recommendation yet.
    return _result(skill, status=OpsStatus.DEGRADED, evidence=evidence,
                   confidence=OpsConfidence.LOW,
                   recommendation="Cost observation is available, but hotspot analysis and recommendations are not enabled until PR 4.",
                   null_reason=None)


# ── recommend_rightsize (tier 1) — RECOMMENDATION-DISABLED in PR 3 ────────────

def _blocked_no_source(skill: OpsSkillDef, req: OpsCommandRequest) -> OpsRunResult:
    return _result(skill, status=OpsStatus.BLOCKED, evidence=[],
                   null_reason=OpsNullReason.DATA_SOURCE_NOT_CONFIGURED,
                   recommendation=None)


EXECUTORS: dict[str, Callable[[OpsSkillDef, OpsCommandRequest], OpsRunResult]] = {
    "ade.inventory.scan_pipelines": _scan_pipelines,
    "ade.lineage.trust_number": _trust_number,
    "ade.freshness.assess": _assess_freshness,
    "ade.cost.show_hotspots": _show_cost_hotspots,
    "ade.compute.recommend_rightsize": _blocked_no_source,  # no optimization until PR 4
}
