"""Per-skill suggestion templates for dynamic next-best-actions.

Generates suggested_actions based on the skill that just ran,
the resolved entity context, and the active metric/timeframe.
"""
from __future__ import annotations

from typing import Any


def _entity_name_or(name: str | None, fallback: str = "this entity") -> str:
    return name or fallback


def _fund_nav(env_id: str, entity_id: str, entity_name: str | None) -> dict[str, str]:
    return {
        "type": "navigate",
        "label": f"View {_entity_name_or(entity_name, 'Fund')} overview",
        "path": f"/lab/env/{env_id}/re/funds/{entity_id}",
    }


def _asset_nav(env_id: str, entity_id: str, entity_name: str | None) -> dict[str, str]:
    return {
        "type": "navigate",
        "label": f"View {_entity_name_or(entity_name, 'Asset')} detail",
        "path": f"/lab/env/{env_id}/re/assets/{entity_id}",
    }


# ── Per-skill templates ───────────────────────────────────────────────

_SKILL_TEMPLATES: dict[str, list[dict[str, str]]] = {
    "lookup_entity": [
        {"type": "query", "label": "Show key metrics", "message": "What are the key metrics for {entity}?"},
        {"type": "query", "label": "List assets", "message": "What assets are in {entity}?"},
    ],
    "explain_metric": [
        {"type": "query", "label": "Show trend", "message": "Show me the {metric} trend over time for {entity}"},
        {"type": "query", "label": "Compare to plan", "message": "How does {metric} compare to underwriting for {entity}?"},
        {"type": "query", "label": "Rank by {metric}", "message": "Which assets have the best {metric}?"},
    ],
    "rank_metric": [
        {"type": "query", "label": "Trend for top performer", "message": "Show the {metric} trend for the top performing asset"},
        {"type": "query", "label": "Compare bottom to top", "message": "Compare the best and worst assets by {metric}"},
    ],
    "trend_metric": [
        {"type": "query", "label": "Variance to plan", "message": "How does {metric} compare to underwriting for {entity}?"},
        {"type": "query", "label": "Quarterly breakdown", "message": "Break down {metric} quarterly for {entity}"},
    ],
    "explain_metric_variance": [
        {"type": "query", "label": "Deep dive", "message": "Give me a deep dive on what's driving the {metric} variance for {entity}"},
        {"type": "query", "label": "Show trend", "message": "Show {metric} trend over time for {entity}"},
    ],
    "compare_entities": [
        {"type": "query", "label": "Rank all by metric", "message": "Rank all assets by NOI"},
        {"type": "query", "label": "Show trends", "message": "Show NOI trends for both entities"},
    ],
    "run_analysis": [
        {"type": "query", "label": "Generate LP summary", "message": "Generate an LP summary for {entity}"},
        {"type": "query", "label": "Show key metrics", "message": "What are the key metrics for {entity}?"},
    ],
    "generate_lp_summary": [
        {"type": "query", "label": "Show key risks", "message": "What are the key risks for {entity}?"},
        {"type": "query", "label": "Compare to prior quarter", "message": "How does {entity} compare to last quarter?"},
    ],
    "create_entity": [
        {"type": "query", "label": "View created entity", "message": "Show me the entity I just created"},
    ],
}


def _interpolate(template: str, entity: str, metric: str) -> str:
    return template.replace("{entity}", entity).replace("{metric}", metric)


def build_suggested_actions(
    *,
    skill_id: str | None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    entity_name: str | None = None,
    env_id: str | None = None,
    active_metric: str | None = None,
) -> list[dict[str, Any]]:
    """Build suggested_actions based on skill + entity context.

    Returns a list of action dicts with type, label, and message/path.
    """
    suggestions: list[dict[str, Any]] = []
    entity_display = _entity_name_or(entity_name, "this fund")
    metric_display = active_metric or "NOI"

    # Skill-specific query suggestions
    templates = _SKILL_TEMPLATES.get(skill_id or "", [])
    for tmpl in templates[:3]:
        suggestions.append({
            "type": tmpl["type"],
            "label": _interpolate(tmpl["label"], entity_display, metric_display),
            "message": _interpolate(tmpl["message"], entity_display, metric_display),
        })

    # Navigation suggestions based on entity
    if env_id and entity_id:
        if entity_type == "fund":
            suggestions.append(_fund_nav(env_id, entity_id, entity_name))
        elif entity_type == "asset":
            suggestions.append(_asset_nav(env_id, entity_id, entity_name))

    return suggestions[:5]
