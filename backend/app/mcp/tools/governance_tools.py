"""Governance MCP tools — AI decision audit trail and accuracy stats."""
from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.governance_tools import (
    AuditStatsInput,
    ExportAccuracyReportInput,
    ExportAuditReportInput,
    GetDecisionInput,
    ListDecisionsInput,
)


def _list_decisions(ctx: McpContext, inp: ListDecisionsInput) -> dict:
    from app.services.governance import list_decisions

    rows = list_decisions(
        inp.business_id,
        env_id=inp.env_id,
        decision_type=inp.decision_type,
        tool_name=inp.tool_name,
        limit=inp.limit,
        offset=inp.offset,
    )
    return {
        "decisions": [_serialize_row(r) for r in rows],
        "count": len(rows),
        "limit": inp.limit,
        "offset": inp.offset,
    }


def _get_decision(ctx: McpContext, inp: GetDecisionInput) -> dict:
    from app.services.governance import get_decision

    row = get_decision(inp.decision_id)
    if not row:
        return {"error": "Decision not found", "decision_id": inp.decision_id}
    return _serialize_row(row)


def _audit_stats(ctx: McpContext, inp: AuditStatsInput) -> dict:
    from app.services.governance import compute_audit_stats

    return compute_audit_stats(inp.business_id, env_id=inp.env_id)


def _export_audit_report(ctx: McpContext, inp: ExportAuditReportInput) -> dict:
    from app.services.governance import compute_audit_stats, list_decisions

    stats = compute_audit_stats(inp.business_id, env_id=inp.env_id)
    decisions = list_decisions(inp.business_id, env_id=inp.env_id, limit=inp.limit)
    return {
        "report_type": "ai_decision_audit",
        "stats": stats,
        "decisions": [_serialize_row(r) for r in decisions],
        "decision_count": len(decisions),
    }


def _export_accuracy_report(ctx: McpContext, inp: ExportAccuracyReportInput) -> dict:
    from app.services.governance import compute_audit_stats, list_decisions

    stats = compute_audit_stats(inp.business_id, env_id=inp.env_id)
    # Get recent decisions with grounding scores for the report
    decisions = list_decisions(inp.business_id, env_id=inp.env_id, limit=100)
    scored = [d for d in decisions if d.get("grounding_score") is not None]

    return {
        "report_type": "ai_accuracy_report",
        "stats": {
            "avg_grounding_score": stats.get("avg_grounding_score"),
            "high_grounding": stats.get("high_grounding", 0),
            "mixed_grounding": stats.get("mixed_grounding", 0),
            "low_grounding": stats.get("low_grounding", 0),
            "total_scored": len(scored),
            "total_decisions": stats.get("total_decisions", 0),
        },
        "summary": (
            f"Winston AI Accuracy Report: {len(scored)} scored responses. "
            f"Average grounding score: {stats.get('avg_grounding_score', 'N/A')}. "
            f"High confidence: {stats.get('high_grounding', 0)}, "
            f"Mixed: {stats.get('mixed_grounding', 0)}, "
            f"Low: {stats.get('low_grounding', 0)}. "
            "All AI-assisted decisions are logged and auditable."
        ),
        "scored_decisions": [_serialize_row(d) for d in scored[:50]],
    }


def _serialize_row(row: dict) -> dict:
    """Ensure all values are JSON-safe."""
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif isinstance(v, (int, float, str, bool, list, dict)) or v is None:
            out[k] = v
        else:
            out[k] = str(v)
    return out


def register_governance_tools():
    registry.register(ToolDef(
        name="governance.list_decisions",
        description="List AI decision audit log entries with optional filters by decision type, tool name, and environment",
        module="bm",
        permission="read",
        input_model=ListDecisionsInput,
        handler=_list_decisions,
        tags=frozenset({"governance", "audit", "compliance"}),
    ))
    registry.register(ToolDef(
        name="governance.get_decision",
        description="Fetch a single AI decision audit record by ID, including full input/output summaries",
        module="bm",
        permission="read",
        input_model=GetDecisionInput,
        handler=_get_decision,
        tags=frozenset({"governance", "audit", "compliance"}),
    ))
    registry.register(ToolDef(
        name="governance.audit_stats",
        description="Get aggregate AI decision stats: total decisions, success rate, avg latency, grounding score distribution, top tools",
        module="bm",
        permission="read",
        input_model=AuditStatsInput,
        handler=_audit_stats,
        tags=frozenset({"governance", "audit", "compliance"}),
    ))
    registry.register(ToolDef(
        name="governance.export_audit_report",
        description="Export a structured AI decision audit report with stats and decision records for LP reporting or compliance review",
        module="bm",
        permission="read",
        input_model=ExportAuditReportInput,
        handler=_export_audit_report,
        tags=frozenset({"governance", "audit", "compliance", "report"}),
    ))
    registry.register(ToolDef(
        name="governance.export_accuracy_report",
        description="Generate an AI accuracy report showing grounding score distribution, confidence levels, and data sourcing breakdown — ready for LP distribution",
        module="bm",
        permission="read",
        input_model=ExportAccuracyReportInput,
        handler=_export_accuracy_report,
        tags=frozenset({"governance", "audit", "compliance", "report"}),
    ))
