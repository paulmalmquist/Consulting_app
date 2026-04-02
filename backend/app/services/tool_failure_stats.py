"""Tool failure statistics for the AI gateway.

Queries ``ai_gateway_logs.tool_calls_json`` to surface the top failing tools,
common error patterns, and hallucinated tool names.
"""
from __future__ import annotations

import json
import logging
from collections import Counter, defaultdict
from typing import Any

from app.db import get_cursor

logger = logging.getLogger(__name__)


def get_tool_failure_stats(
    *,
    business_id: str | None = None,
    days: int = 7,
    limit: int = 20,
) -> dict[str, Any]:
    """Aggregate tool call outcomes over the given time window.

    Returns:
    - top_failing_tools: tools ranked by failure count
    - hallucinated_tools: tool names not found in registry
    - missing_params: most commonly missing required parameters
    - summary: overall success/failure counts
    """
    conditions = ["created_at > NOW() - INTERVAL '%s days'"]
    params: list[Any] = [days]

    if business_id:
        conditions.append("business_id = %s")
        params.append(business_id)

    where = " AND ".join(conditions)

    sql = f"""
    SELECT tool_calls_json
    FROM ai_gateway_logs
    WHERE {where}
      AND tool_call_count > 0
      AND tool_calls_json IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5000
    """

    tool_success: Counter[str] = Counter()
    tool_failure: Counter[str] = Counter()
    error_samples: defaultdict[str, list[str]] = defaultdict(list)
    hallucinated: Counter[str] = Counter()
    missing_params_counter: Counter[str] = Counter()

    try:
        with get_cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

        for row in rows:
            raw = row["tool_calls_json"]
            if isinstance(raw, str):
                try:
                    calls = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    continue
            elif isinstance(raw, list):
                calls = raw
            else:
                continue

            for tc in calls:
                name = tc.get("name", "unknown")
                if tc.get("success"):
                    tool_success[name] += 1
                else:
                    tool_failure[name] += 1
                    err = tc.get("error", "")
                    if err and len(error_samples[name]) < 3:
                        error_samples[name].append(str(err)[:200])
                    if "not found" in str(err).lower() or "unknown tool" in str(err).lower():
                        hallucinated[name] += 1
                    if "required" in str(err).lower() or "missing" in str(err).lower():
                        missing_params_counter[name] += 1

    except Exception:
        logger.exception("Failed to query tool failure stats")
        return {"error": "Failed to query tool failure stats"}

    # Build top failing tools list
    top_failing = []
    for name, fail_count in tool_failure.most_common(limit):
        total = tool_success[name] + fail_count
        top_failing.append({
            "tool_name": name,
            "total_calls": total,
            "failures": fail_count,
            "failure_rate_pct": round(fail_count / total * 100, 1) if total > 0 else 0,
            "error_samples": error_samples.get(name, []),
        })

    total_calls = sum(tool_success.values()) + sum(tool_failure.values())
    total_failures = sum(tool_failure.values())

    return {
        "window_days": days,
        "summary": {
            "total_calls": total_calls,
            "total_failures": total_failures,
            "failure_rate_pct": round(total_failures / total_calls * 100, 1) if total_calls > 0 else 0,
            "unique_tools_used": len(set(tool_success.keys()) | set(tool_failure.keys())),
        },
        "top_failing_tools": top_failing,
        "hallucinated_tools": [
            {"tool_name": name, "count": count}
            for name, count in hallucinated.most_common(10)
        ],
        "missing_params_tools": [
            {"tool_name": name, "count": count}
            for name, count in missing_params_counter.most_common(10)
        ],
    }
