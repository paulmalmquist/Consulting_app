"""Audit Dashboard service — read aggregates for the ADE governed-fabric audit view (plan PR 3).

Operational reads only, over a hot window (default 30 days) of the existing tables:
  - ai_decision_audit_log  (AI decisions, grounding, tokens, latency)
  - app.audit_events       (MCP tool-call receipts, redacted I/O)

No new tables, no writes. Historical compliance/cost analytics belong in BigQuery
(winston_ops.audit_events_bq) via the manual export scaffold — not in Postgres.

Cost is an ESTIMATE derived from token counts (no per-model price table here); it is
labelled as such and never presented as an authoritative spend figure.
"""
from __future__ import annotations

from uuid import UUID

from app.db import get_cursor
from app.services import governance as governance_svc

HOT_WINDOW_DAYS = 30

# Rough blended $/1K tokens for an estimate-only cost column. Deliberately coarse:
# the dashboard labels this "estimated" and the real cost mart is a BigQuery concern.
_EST_USD_PER_1K_TOKENS = 0.005


def _calls_per_day(business_id: str | UUID, *, env_id: str | None, days: int) -> list[dict]:
    """Daily MCP tool-call counts over the hot window, oldest→newest."""
    conditions = ["business_id = %s", "action = %s", "created_at >= now() - make_interval(days => %s)"]
    params: list = [str(business_id), "mcp.tool_call", days]
    if env_id:
        # app.audit_events has no env_id column; env scoping is business_id-only.
        pass
    where = " AND ".join(conditions)
    with get_cursor() as cur:
        cur.execute(
            f"""SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                       COUNT(*)::int AS calls,
                       COUNT(*) FILTER (WHERE success = false)::int AS failed
                FROM app.audit_events
                WHERE {where}
                GROUP BY 1
                ORDER BY 1 ASC""",
            params,
        )
        return cur.fetchall()


def _estimated_cost(business_id: str | UUID, *, env_id: str | None, days: int) -> float | None:
    """Token-based cost estimate over the hot window. None if no token data."""
    conditions = ["business_id = %s", "created_at >= now() - make_interval(days => %s)"]
    params: list = [str(business_id), days]
    if env_id:
        conditions.append("env_id = %s")
        params.append(env_id)
    where = " AND ".join(conditions)
    with get_cursor() as cur:
        cur.execute(
            f"""SELECT COALESCE(SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)),0)::bigint AS tokens
                FROM ai_decision_audit_log
                WHERE {where}""",
            params,
        )
        row = cur.fetchone() or {}
        tokens = row.get("tokens") or 0
        if tokens <= 0:
            return None
        return round((tokens / 1000.0) * _EST_USD_PER_1K_TOKENS, 4)


def summary(business_id: str | UUID, *, env_id: str | None = None, days: int = HOT_WINDOW_DAYS) -> dict:
    """Assemble the dashboard stat strip + calls-per-day series.

    Reuses governance.compute_audit_stats for the success/grounding aggregates and
    adds a calls-per-day series and an estimated-cost figure.
    """
    stats = governance_svc.compute_audit_stats(business_id, env_id=env_id)
    total = stats.get("total_decisions", 0) or 0
    successful = stats.get("successful", 0) or 0
    return {
        "window_days": days,
        "total_decisions": total,
        "successful": successful,
        "failed": stats.get("failed", 0),
        "success_rate": round(successful / total, 3) if total else None,
        "avg_latency_ms": stats.get("avg_latency_ms"),
        "avg_grounding_score": stats.get("avg_grounding_score"),
        "high_grounding": stats.get("high_grounding", 0),
        "mixed_grounding": stats.get("mixed_grounding", 0),
        "low_grounding": stats.get("low_grounding", 0),
        "top_tools": stats.get("top_tools", []),
        "calls_per_day": _calls_per_day(business_id, env_id=env_id, days=days),
        "estimated_cost_usd": _estimated_cost(business_id, env_id=env_id, days=days),
        "cost_is_estimate": True,
    }


def decisions(
    business_id: str | UUID,
    *,
    env_id: str | None = None,
    tool_name: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """AI decision log rows with grounding scores. Thin pass-through to governance."""
    rows = governance_svc.list_decisions(
        business_id, env_id=env_id, tool_name=tool_name, limit=limit, offset=offset
    )
    return [_decision_row(r) for r in rows]


def lineage(business_id: str | UUID, tool_name: str, *, env_id: str | None = None, limit: int = 100) -> list[dict]:
    """All decisions for one tool, newest first — the per-tool lineage view."""
    rows = governance_svc.list_decisions(
        business_id, env_id=env_id, tool_name=tool_name, limit=limit
    )
    return [_decision_row(r) for r in rows]


def _decision_row(r: dict) -> dict:
    gs = r.get("grounding_score")
    return {
        "id": str(r["id"]) if r.get("id") is not None else None,
        "actor": r.get("actor"),
        "decision_type": r.get("decision_type"),
        "tool_name": r.get("tool_name"),
        "model_used": r.get("model_used"),
        "latency_ms": r.get("latency_ms"),
        "grounding_score": float(gs) if gs is not None else None,
        "grounding_low": (gs is not None and float(gs) < 0.5),
        "success": r.get("success"),
        "error_message": r.get("error_message"),
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
    }
