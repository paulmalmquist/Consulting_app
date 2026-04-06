"""Resume environment MCP tools — read-only career data for the AI assistant.

Truth source hierarchy:
  1. RAG (primary) — 7 narrative documents indexed from resume_rag_seed.py
  2. Structured SQL (secondary) — resume_roles/skills/projects tables if populated

Resume tools call RAG FIRST. Structured tables are secondary enrichment.
"""
from __future__ import annotations

import logging
from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import AuditPolicy, ToolDef, registry
from app.mcp.schemas.resume_tools import (
    GetResumeProjectInput,
    GetResumeRoleInput,
    ListResumeDeploymentsInput,
    ListResumeProjectsInput,
    ListResumeRolesInput,
    ListResumeSkillsInput,
    ListResumeSystemComponentsInput,
    ResumeCareerSummaryInput,
    ResumeSkillMatrixInput,
)
from app.mcp.tools.repe_tools import _require_uuid, _scope_value, _serialize
from app.services import resume as resume_svc

logger = logging.getLogger(__name__)


def _resolve_ids(inp, ctx: McpContext):
    env_id = _require_uuid(_scope_value(inp, ctx, "env_id"), "env_id")
    bid = _require_uuid(_scope_value(inp, ctx, "business_id"), "business_id")
    return env_id, bid


def _rag_search(query: str, business_id: UUID, env_id: UUID | None = None, top_k: int = 3) -> list[dict]:
    """Search resume RAG documents. Returns list of chunk dicts."""
    try:
        from app.services.rag_indexer import semantic_search
        chunks = semantic_search(
            query=query,
            business_id=business_id,
            env_id=env_id,
            top_k=top_k,
        )
        return [
            {
                "text": c.text[:1500] if hasattr(c, "text") else str(c.get("text", ""))[:1500],
                "score": getattr(c, "score", c.get("score", 0)) if hasattr(c, "score") else 0,
                "source": getattr(c, "section_heading", None) or getattr(c, "source_filename", None) or "resume",
            }
            for c in chunks
        ]
    except Exception:
        logger.debug("Resume RAG search failed", exc_info=True)
        return []


def _rag_result(query: str, business_id: UUID, env_id: UUID | None = None) -> dict:
    """Standard RAG-primary result for resume tools."""
    chunks = _rag_search(query, business_id, env_id)
    if not chunks:
        return {
            "source": "rag",
            "status": "empty",
            "message": "No resume narrative data has been indexed for this environment. Resume data needs to be seeded first.",
        }
    return {
        "source": "rag",
        "status": "success",
        "results": chunks,
        "total": len(chunks),
    }


def _list_roles(ctx: McpContext, inp: ListResumeRolesInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    # RAG-primary: search for career roles
    query = f"career roles and employers{' at ' + inp.company if inp.company else ''}"
    rag = _rag_search(query, bid, env_id, top_k=4)
    # Try structured as secondary enrichment
    rows = resume_svc.list_roles(env_id=env_id, business_id=bid)
    if inp.company and rows:
        rows = [r for r in rows if inp.company.lower() in r["company"].lower()]
    if rows:
        return {"roles": _serialize(rows), "total": len(rows), "source": "structured"}
    if rag:
        return {"source": "rag", "results": rag, "total": len(rag)}
    return _rag_result(query, bid, env_id)


def _get_role(ctx: McpContext, inp: GetResumeRoleInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    row = resume_svc.get_role(env_id=env_id, business_id=bid, role_id=inp.role_id)
    if row:
        return {"role": _serialize(row), "source": "structured"}
    return _rag_result("career role detail", bid, env_id)


def _list_skills(ctx: McpContext, inp: ListResumeSkillsInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    query = f"technical skills{' in ' + inp.category if inp.category else ''}"
    rag = _rag_search(query, bid, env_id, top_k=3)
    rows = resume_svc.list_skills(env_id=env_id, business_id=bid, category=inp.category)
    if rows:
        return {"skills": _serialize(rows), "total": len(rows), "source": "structured"}
    if rag:
        return {"source": "rag", "results": rag, "total": len(rag)}
    return _rag_result(query, bid, env_id)


def _list_projects(ctx: McpContext, inp: ListResumeProjectsInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    query = "projects and case studies"
    rag = _rag_search(query, bid, env_id, top_k=3)
    rows = resume_svc.list_projects(env_id=env_id, business_id=bid, status=inp.status)
    if rows:
        return {"projects": _serialize(rows), "total": len(rows), "source": "structured"}
    if rag:
        return {"source": "rag", "results": rag, "total": len(rag)}
    return _rag_result(query, bid, env_id)


def _get_project(ctx: McpContext, inp: GetResumeProjectInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    row = resume_svc.get_project(env_id=env_id, business_id=bid, project_id=inp.project_id)
    if row:
        return {"project": _serialize(row), "source": "structured"}
    return _rag_result("project detail", bid, env_id)


def _career_summary(ctx: McpContext, inp: ResumeCareerSummaryInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    # RAG-primary for career overview
    rag = _rag_search("career overview summary experience", bid, env_id, top_k=3)
    structured = resume_svc.get_career_summary(env_id=env_id, business_id=bid)
    # If structured has real data (non-zero counts), use it
    if structured and structured.get("total_years", 0) > 0:
        structured["source"] = "structured"
        return structured
    if rag:
        return {"source": "rag", "results": rag, "total": len(rag)}
    return _rag_result("career summary", bid, env_id)


def _skill_matrix(ctx: McpContext, inp: ResumeSkillMatrixInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    matrix = resume_svc.get_skill_matrix(env_id=env_id, business_id=bid)
    if matrix:
        return {"matrix": matrix, "source": "structured"}
    rag = _rag_search("technical skills proficiency", bid, env_id, top_k=3)
    if rag:
        return {"source": "rag", "results": rag, "total": len(rag)}
    return _rag_result("skill matrix", bid, env_id)


_AUDIT = AuditPolicy(
    redact_keys=[],
    max_input_bytes_to_log=5000,
    max_output_bytes_to_log=10000,
)

def _list_system_components(ctx: McpContext, inp: ListResumeSystemComponentsInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    rows = resume_svc.list_system_components(env_id=env_id, business_id=bid)
    if inp.layer:
        rows = [r for r in rows if r["layer"] == inp.layer]
    return {"components": _serialize(rows), "total": len(rows)}


def _list_deployments(ctx: McpContext, inp: ListResumeDeploymentsInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    rows = resume_svc.list_deployments(env_id=env_id, business_id=bid)
    return {"deployments": _serialize(rows), "total": len(rows)}


_TOOLS = [
    ("resume.list_roles", "List all career roles ordered by start date. Optionally filter by company name.", ListResumeRolesInput, _list_roles),
    ("resume.get_role", "Get full detail for a specific career role including achievements and technologies.", GetResumeRoleInput, _get_role),
    ("resume.list_skills", "List all skills with proficiency ratings. Optionally filter by category (data_platform, ai_ml, languages, cloud, visualization, domain, leadership).", ListResumeSkillsInput, _list_skills),
    ("resume.list_projects", "List all projects and case studies with metrics. Optionally filter by status (active, completed, concept).", ListResumeProjectsInput, _list_projects),
    ("resume.get_project", "Get full detail for a specific project including technologies, metrics, and impact.", GetResumeProjectInput, _get_project),
    ("resume.career_summary", "Get computed career KPIs: total years, companies, skills count, education, current role.", ResumeCareerSummaryInput, _career_summary),
    ("resume.skill_matrix", "Get skills grouped by category with average proficiency for radar chart visualization.", ResumeSkillMatrixInput, _skill_matrix),
    ("resume.list_system_components", "List architecture components grouped by layer (data_platform, ai_layer, investment_engine, bi_layer, governance). Shows tools and outcomes for each component.", ListResumeSystemComponentsInput, _list_system_components),
    ("resume.list_deployments", "List system deployments — each role reframed as a technology deployment with problem, architecture, and before/after metrics.", ListResumeDeploymentsInput, _list_deployments),
]


def register_resume_tools() -> None:
    for name, desc, inp_model, handler in _TOOLS:
        registry.register(
            ToolDef(
                name=name,
                description=desc,
                module="resume",
                permission="read",
                input_model=inp_model,
                audit_policy=_AUDIT,
                handler=handler,
                tags=frozenset({"resume"}),
            )
        )
