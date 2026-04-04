from __future__ import annotations

from typing import Any


def _tool_snapshot(record: dict[str, Any]) -> tuple[list[str], list[str]]:
    receipt = record.get("turn_receipt") or {}
    tools = receipt.get("tools") or []
    return (
        [tool.get("tool_name") for tool in tools],
        [tool.get("status") for tool in tools],
    )


def _snapshot(record: dict[str, Any]) -> dict[str, Any]:
    receipt = record.get("turn_receipt") or {}
    tools, tool_statuses = _tool_snapshot(record)
    context = receipt.get("context") or {}
    retrieval = receipt.get("retrieval") or {}
    skill = receipt.get("skill") or {}
    return {
        "lane": receipt.get("lane"),
        "skill_id": skill.get("skill_id"),
        "context_status": context.get("resolution_status"),
        "environment_id": context.get("environment_id"),
        "entity_type": context.get("entity_type"),
        "entity_id": context.get("entity_id"),
        "retrieval_used": retrieval.get("used"),
        "retrieval_result_count": retrieval.get("result_count"),
        "retrieval_status": retrieval.get("status"),
        "tool_names": tools,
        "tool_statuses": tool_statuses,
        "degraded_reason": receipt.get("degraded_reason"),
        "status": receipt.get("status"),
        "duration_ms": record.get("duration_ms"),
        "first_token_ms": record.get("first_token_ms"),
    }


def diff_records(current: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any]:
    if previous is None:
        return {"changed": False, "diffs": [], "snapshot": _snapshot(current)}
    now = _snapshot(current)
    then = _snapshot(previous)
    diffs: list[dict[str, Any]] = []
    for field, current_value in now.items():
        previous_value = then.get(field)
        if current_value != previous_value:
            diffs.append(
                {
                    "field": field,
                    "before": previous_value,
                    "after": current_value,
                    "message": _humanize_diff(field, previous_value, current_value),
                }
            )
    return {"changed": bool(diffs), "diffs": diffs, "snapshot": now}


def _humanize_diff(field: str, before: Any, after: Any) -> str:
    label = field.replace("_", " ")
    if field in {"duration_ms", "first_token_ms"} and before is not None and after is not None:
        delta = after - before
        sign = "+" if delta >= 0 else ""
        return f"{label} changed: {before} -> {after} ({sign}{delta} ms)"
    return f"{label} changed: {before} -> {after}"

