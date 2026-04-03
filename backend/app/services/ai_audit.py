"""Nightly AI audit job — finds unresolved confirmations, stuck processing,
repeated tool failures, missing-param patterns, latency outliers, and
candidate new skills.

Writes findings to ``ai_audit_findings`` and emerging patterns to
``ai_skill_candidates``.

Run via: ``python -m app.services.ai_audit`` or from a cron/scheduler.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from app.db import get_cursor
from app.services.pending_action_manager import expire_stale_actions

logger = logging.getLogger(__name__)


def run_nightly_audit(*, lookback_hours: int = 24) -> dict[str, Any]:
    """Execute all audit checks and write findings.  Returns summary."""
    audit_run_id = str(uuid.uuid4())
    findings: list[dict[str, Any]] = []

    # 1. Expire stale pending actions
    expired_count = expire_stale_actions()
    if expired_count:
        findings.append(_finding(
            audit_run_id=audit_run_id,
            finding_type="unresolved_confirmation",
            severity="warning",
            title=f"{expired_count} pending confirmation(s) expired without resolution",
            detail={"expired_count": expired_count},
        ))

    # 2. Find unresolved pending confirmations still awaiting
    findings.extend(_find_unresolved_confirmations(audit_run_id))

    # 3. Find missed confirmations (user said "yes" but no tool was called)
    findings.extend(_find_missed_confirmations(audit_run_id, lookback_hours))

    # 4. Find processing-stuck incidents (long elapsed_ms with no done)
    findings.extend(_find_processing_stuck(audit_run_id, lookback_hours))

    # 5. Find repeated tool failures
    findings.extend(_find_repeated_tool_failures(audit_run_id, lookback_hours))

    # 6. Find repeated missing-param patterns
    findings.extend(_find_repeated_missing_params(audit_run_id, lookback_hours))

    # 7. Measure p50/p95 latency by lane
    findings.extend(_measure_latency_by_lane(audit_run_id, lookback_hours))

    # 8. Mine skill candidates
    skill_count = _mine_skill_candidates(lookback_hours)

    # Write all findings
    _persist_findings(findings)

    summary = {
        "audit_run_id": audit_run_id,
        "finding_count": len(findings),
        "skill_candidates_found": skill_count,
        "findings_by_type": {},
    }
    for f in findings:
        ft = f["finding_type"]
        summary["findings_by_type"][ft] = summary["findings_by_type"].get(ft, 0) + 1

    logger.info("Nightly audit complete: %s", json.dumps(summary))
    return summary


def _finding(
    *,
    audit_run_id: str,
    finding_type: str,
    severity: str = "info",
    title: str,
    detail: dict[str, Any] | None = None,
    conversation_id: str | None = None,
    pending_action_id: str | None = None,
    tool_name: str | None = None,
    lane: str | None = None,
    count: int | None = None,
    p50_ms: int | None = None,
    p95_ms: int | None = None,
    business_id: str | None = None,
) -> dict[str, Any]:
    return {
        "audit_run_id": audit_run_id,
        "finding_type": finding_type,
        "severity": severity,
        "title": title,
        "detail": json.dumps(detail or {}),
        "conversation_id": conversation_id,
        "pending_action_id": pending_action_id,
        "tool_name": tool_name,
        "lane": lane,
        "count": count,
        "p50_ms": p50_ms,
        "p95_ms": p95_ms,
        "business_id": business_id,
    }


def _find_unresolved_confirmations(audit_run_id: str) -> list[dict]:
    findings = []
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT pending_action_id, conversation_id, action_type, created_at, business_id
                   FROM ai_pending_actions
                   WHERE status = 'awaiting_confirmation'
                   ORDER BY created_at DESC LIMIT 100""",
            )
            rows = cur.fetchall()
            for row in rows:
                findings.append(_finding(
                    audit_run_id=audit_run_id,
                    finding_type="unresolved_confirmation",
                    severity="warning",
                    title=f"Unresolved confirmation: {row['action_type']}",
                    detail={"created_at": row["created_at"].isoformat() if row.get("created_at") else None},
                    conversation_id=str(row["conversation_id"]),
                    pending_action_id=str(row["pending_action_id"]),
                    tool_name=row["action_type"],
                    business_id=str(row["business_id"]) if row.get("business_id") else None,
                ))
    except Exception:
        logger.exception("Failed to find unresolved confirmations")
    return findings


def _find_missed_confirmations(audit_run_id: str, hours: int) -> list[dict]:
    """Find cases where a user message matches confirm patterns but the next
    assistant message did NOT execute a tool with confirmed=true."""
    findings = []
    try:
        with get_cursor() as cur:
            cur.execute(
                """WITH confirm_msgs AS (
                     SELECT m.conversation_id, m.message_id, m.content, m.created_at
                     FROM ai_messages m
                     WHERE m.role = 'user'
                       AND m.created_at > now() - interval '%s hours'
                       AND lower(trim(m.content)) IN (
                         'yes', 'yep', 'yeah', 'sure', 'ok', 'okay',
                         'go ahead', 'proceed', 'do it', 'confirm', 'confirmed',
                         'approve', 'execute'
                       )
                   ),
                   next_assistant AS (
                     SELECT cm.conversation_id, cm.message_id AS user_msg_id,
                            am.tool_calls, am.content AS assistant_content
                     FROM confirm_msgs cm
                     JOIN LATERAL (
                       SELECT tool_calls, content
                       FROM ai_messages
                       WHERE conversation_id = cm.conversation_id
                         AND role = 'assistant'
                         AND created_at > cm.created_at
                       ORDER BY created_at ASC LIMIT 1
                     ) am ON true
                   )
                   SELECT * FROM next_assistant
                   WHERE tool_calls IS NULL
                      OR tool_calls::text NOT LIKE '%%confirmed%%true%%'
                   LIMIT 50""",
                (hours,),
            )
            rows = cur.fetchall()
            if rows:
                findings.append(_finding(
                    audit_run_id=audit_run_id,
                    finding_type="missed_confirmation",
                    severity="warning",
                    title=f"{len(rows)} confirmation(s) where user said 'yes' but no tool was re-executed with confirmed=true",
                    detail={"count": len(rows), "sample_conversations": [str(r["conversation_id"]) for r in rows[:5]]},
                    count=len(rows),
                ))
    except Exception:
        logger.exception("Failed to find missed confirmations")
    return findings


def _find_processing_stuck(audit_run_id: str, hours: int) -> list[dict]:
    """Find requests with extremely high elapsed_ms (>30s) that may indicate stuck processing."""
    findings = []
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT id, conversation_id, route_lane, elapsed_ms, route_model, error_message
                   FROM ai_gateway_logs
                   WHERE created_at > now() - interval '%s hours'
                     AND elapsed_ms > 30000
                   ORDER BY elapsed_ms DESC LIMIT 50""",
                (hours,),
            )
            rows = cur.fetchall()
            if rows:
                findings.append(_finding(
                    audit_run_id=audit_run_id,
                    finding_type="processing_stuck",
                    severity="warning",
                    title=f"{len(rows)} request(s) exceeded 30s processing time",
                    detail={
                        "count": len(rows),
                        "worst_ms": rows[0]["elapsed_ms"] if rows else None,
                        "sample_ids": [str(r["id"]) for r in rows[:5]],
                    },
                    count=len(rows),
                ))
    except Exception:
        logger.exception("Failed to find processing-stuck incidents")
    return findings


def _find_repeated_tool_failures(audit_run_id: str, hours: int) -> list[dict]:
    """Find tools that failed repeatedly in the lookback window."""
    findings = []
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT tool_name, count(*) AS fail_count,
                          array_agg(DISTINCT error_message) FILTER (WHERE error_message IS NOT NULL) AS errors
                   FROM ai_tool_calls
                   WHERE created_at > now() - interval '%s hours'
                     AND success = false
                   GROUP BY tool_name
                   HAVING count(*) >= 3
                   ORDER BY count(*) DESC LIMIT 20""",
                (hours,),
            )
            rows = cur.fetchall()
            for row in rows:
                findings.append(_finding(
                    audit_run_id=audit_run_id,
                    finding_type="repeated_tool_failure",
                    severity="critical" if row["fail_count"] >= 10 else "warning",
                    title=f"Tool '{row['tool_name']}' failed {row['fail_count']} times",
                    detail={"errors": row.get("errors", [])},
                    tool_name=row["tool_name"],
                    count=row["fail_count"],
                ))
    except Exception:
        logger.exception("Failed to find repeated tool failures")
    return findings


def _find_repeated_missing_params(audit_run_id: str, hours: int) -> list[dict]:
    """Find tools where missing params are a recurring pattern."""
    findings = []
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT tool_name,
                          count(*) AS miss_count
                   FROM ai_tool_calls
                   WHERE created_at > now() - interval '%s hours'
                     AND success = false
                     AND lower(error_message) LIKE '%%required%%'
                   GROUP BY tool_name
                   HAVING count(*) >= 2
                   ORDER BY count(*) DESC LIMIT 20""",
                (hours,),
            )
            rows = cur.fetchall()
            for row in rows:
                findings.append(_finding(
                    audit_run_id=audit_run_id,
                    finding_type="repeated_missing_param",
                    severity="warning",
                    title=f"Tool '{row['tool_name']}' hit missing-param errors {row['miss_count']} times",
                    tool_name=row["tool_name"],
                    count=row["miss_count"],
                ))
    except Exception:
        logger.exception("Failed to find repeated missing-param patterns")
    return findings


def _measure_latency_by_lane(audit_run_id: str, hours: int) -> list[dict]:
    """Compute p50/p95 latency per lane."""
    findings = []
    try:
        with get_cursor() as cur:
            cur.execute(
                """SELECT route_lane,
                          count(*) AS request_count,
                          percentile_cont(0.5) WITHIN GROUP (ORDER BY elapsed_ms) AS p50,
                          percentile_cont(0.95) WITHIN GROUP (ORDER BY elapsed_ms) AS p95
                   FROM ai_gateway_logs
                   WHERE created_at > now() - interval '%s hours'
                     AND elapsed_ms IS NOT NULL
                   GROUP BY route_lane
                   ORDER BY route_lane""",
                (hours,),
            )
            rows = cur.fetchall()
            for row in rows:
                p50 = int(row["p50"]) if row.get("p50") else None
                p95 = int(row["p95"]) if row.get("p95") else None
                findings.append(_finding(
                    audit_run_id=audit_run_id,
                    finding_type="latency_outlier" if (p95 and p95 > 15000) else "latency_measurement",
                    severity="warning" if (p95 and p95 > 15000) else "info",
                    title=f"Lane {row['route_lane']}: p50={p50}ms p95={p95}ms ({row['request_count']} requests)",
                    lane=row["route_lane"],
                    count=row["request_count"],
                    p50_ms=p50,
                    p95_ms=p95,
                ))
    except Exception:
        logger.exception("Failed to measure latency by lane")
    return findings


def _persist_findings(findings: list[dict]) -> None:
    if not findings:
        return
    try:
        with get_cursor() as cur:
            for f in findings:
                cur.execute(
                    """INSERT INTO ai_audit_findings (
                         audit_run_id, finding_type, severity, title, detail,
                         conversation_id, pending_action_id, tool_name, lane,
                         count, p50_ms, p95_ms, business_id
                       ) VALUES (
                         %s, %s, %s, %s, %s,
                         %s, %s, %s, %s,
                         %s, %s, %s, %s
                       )""",
                    (
                        f["audit_run_id"], f["finding_type"], f["severity"],
                        f["title"], f["detail"],
                        f.get("conversation_id"), f.get("pending_action_id"),
                        f.get("tool_name"), f.get("lane"),
                        f.get("count"), f.get("p50_ms"), f.get("p95_ms"),
                        f.get("business_id"),
                    ),
                )
    except Exception:
        logger.exception("Failed to persist audit findings")


def _mine_skill_candidates(hours: int) -> int:
    """Identify repeated prompt patterns and toolchains that could become skills."""
    from app.services.skill_candidate_miner import mine_candidates
    return mine_candidates(lookback_hours=hours)


# ── CLI entry point ──────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    result = run_nightly_audit(lookback_hours=int(sys.argv[1]) if len(sys.argv) > 1 else 24)
    print(json.dumps(result, indent=2))
