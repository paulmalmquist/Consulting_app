"""Capability graph — deterministic machine-readable inventory of Winston's capabilities.

Returns what Winston can do for a given environment:
  - templates: SQL query templates available for this industry domain
  - metrics: semantic metric definitions from the DB catalog
  - tools: MCP tools relevant to this environment type
  - skills: skill registry entries applicable to this environment
  - surfaces: supported Winston launch surfaces from the contracts file
  - grounding_tables: authoritative data tables for this environment type

IMPORTANT: This graph is advisory/runtime truth only.
Authorization and write permissions are enforced independently by the
existing backend and MCP tool guardrails — not by this graph.
"""
from __future__ import annotations

import json
import os
from typing import Any


# ── Industry-type capability contracts ───────────────────────────────

_CONTRACTS_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "contracts",
    "environment-capability-contracts.json",
)


def _load_contracts() -> dict[str, Any]:
    try:
        with open(_CONTRACTS_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


# ── Collectors ────────────────────────────────────────────────────────

def _collect_templates(industry_type: str) -> list[dict[str, Any]]:
    """Return template summaries for a domain, excluding internal fields."""
    from app.sql_agent.query_templates import list_templates
    return [
        {
            "key": t.key,
            "query_type": t.query_type,
            "tags": sorted(t.tags),
            "required_params": sorted(t.required_params),
            "optional_params": sorted(t.optional_params),
        }
        for t in list_templates(domain=industry_type)
    ]


def _collect_metrics(business_id: str) -> list[dict[str, Any]]:
    """Return metric definitions from the DB semantic catalog."""
    from app.services.semantic_catalog import list_metrics
    try:
        metrics = list_metrics(business_id=business_id)
        return [
            {
                "metric_key": m["metric_key"].lower(),
                "display_name": m["display_name"],
                "unit": m["unit"],
                "aggregation": m["aggregation"],
                "entity_key": m.get("entity_key"),
                "description": m.get("description"),
            }
            for m in metrics
        ]
    except Exception:
        return []


def _collect_tools(industry_type: str, contracts: dict[str, Any]) -> list[dict[str, Any]]:
    """Return MCP tools relevant to this industry type."""
    from app.mcp.registry import registry
    contract = contracts.get(industry_type, {})
    tool_tags = set(contract.get("tool_tags", []))
    if not tool_tags:
        return []
    tools = registry.list_by_tags(tool_tags)
    return [
        {
            "name": t.name,
            "description": t.description,
            "module": t.module,
            "permission": t.permission,
            "tags": sorted(t.tags),
        }
        for t in tools
    ]


def _collect_skills(industry_type: str, contracts: dict[str, Any]) -> list[dict[str, Any]]:
    """Return skill registry entries applicable to this industry type."""
    from app.assistant_runtime.skill_registry import SKILLS
    contract = contracts.get(industry_type, {})
    allowed_skill_ids = set(contract.get("skill_ids", []))
    results = []
    for skill in SKILLS:
        if allowed_skill_ids and skill.id not in allowed_skill_ids:
            continue
        results.append({
            "id": skill.id,
            "description": skill.description,
            "capability_tags": skill.capability_tags,
        })
    return results


def _collect_surfaces() -> list[dict[str, Any]]:
    """Return Winston launch surfaces from the contracts file."""
    contracts_dir = os.path.join(os.path.dirname(__file__), "..", "contracts")
    surfaces_path = os.path.join(contracts_dir, "winston-launch-surfaces.json")
    try:
        with open(surfaces_path) as f:
            data = json.load(f)
        return [
            {
                "id": s["id"],
                "route_pattern": s["route_pattern"],
                "surface": s["surface"],
                "scope_type": s["scope_type"],
                "thread_kind": s["thread_kind"],
            }
            for s in data.get("surfaces", [])
        ]
    except Exception:
        return []


# ── Main entry point ──────────────────────────────────────────────────

def build_capability_graph(
    *,
    env_id: str,
    business_id: str,
    industry_type: str = "repe",
) -> dict[str, Any]:
    """Return a structured capability snapshot for this environment.

    Args:
        env_id: The lab environment UUID.
        business_id: The tenant business UUID (used for DB metric lookup).
        industry_type: One of "repe", "pds", "crm", "resume", "trading".

    Returns:
        Dict with keys: env_id, business_id, industry_type, templates, metrics,
        tools, skills, surfaces, grounding_tables.
    """
    contracts = _load_contracts()
    contract = contracts.get(industry_type, {})

    return {
        "env_id": env_id,
        "business_id": business_id,
        "industry_type": industry_type,
        "templates": _collect_templates(industry_type),
        "metrics": _collect_metrics(business_id),
        "tools": _collect_tools(industry_type, contracts),
        "skills": _collect_skills(industry_type, contracts),
        "surfaces": _collect_surfaces(),
        "grounding_tables": contract.get("grounding_tables", []),
    }
