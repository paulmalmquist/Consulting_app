"""Grounding score calculator — measures how much of an AI response is backed by firm data.

Heuristic approach: counts tool calls that returned firm-specific data vs total tools.
"""
from __future__ import annotations

# Tags that indicate a tool returns firm-specific data
FIRM_DATA_TAGS = {"repe", "finance", "ir", "governance", "credit", "investor"}


def compute_grounding_score(
    *,
    tool_calls: list[dict],
    tool_tags_map: dict[str, set[str]] | None = None,
) -> dict:
    """Compute grounding score from tool call metadata.

    Args:
        tool_calls: List of dicts with at least {"tool_name": str, "success": bool}
        tool_tags_map: Optional mapping of tool_name -> set of tags.
                       If not provided, uses a heuristic based on tool name prefix.

    Returns:
        {
            "score": 0.0-1.0,
            "label": "high" | "mixed" | "low",
            "label_text": human readable label,
            "tool_count": int,
            "firm_data_tools": int,
            "sources": [{"tool_name": str, "is_firm_data": bool}]
        }
    """
    if not tool_calls:
        return {
            "score": 0.0,
            "label": "low",
            "label_text": "Low \u2014 primarily general knowledge",
            "tool_count": 0,
            "firm_data_tools": 0,
            "sources": [],
        }

    sources = []
    firm_count = 0

    for tc in tool_calls:
        tool_name = tc.get("tool_name", "")
        is_firm = False

        if tool_tags_map and tool_name in tool_tags_map:
            is_firm = bool(tool_tags_map[tool_name] & FIRM_DATA_TAGS)
        else:
            # Heuristic: tools prefixed with firm-data domains
            prefix = tool_name.split(".")[0] if "." in tool_name else ""
            is_firm = prefix in ("finance", "repe", "ir", "governance", "credit")

        if is_firm:
            firm_count += 1

        sources.append({
            "tool_name": tool_name,
            "is_firm_data": is_firm,
        })

    total = len(tool_calls)
    score = firm_count / total

    if score >= 0.8:
        label = "high"
        pct = round(score * 100)
        label_text = f"High \u2014 {pct}% sourced from firm data"
    elif score >= 0.5:
        label = "mixed"
        label_text = "Mixed \u2014 firm and general knowledge"
    else:
        label = "low"
        label_text = "Low \u2014 primarily general knowledge"

    return {
        "score": round(score, 3),
        "label": label,
        "label_text": label_text,
        "tool_count": total,
        "firm_data_tools": firm_count,
        "sources": sources,
    }
