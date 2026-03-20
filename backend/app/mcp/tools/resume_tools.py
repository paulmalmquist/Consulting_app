"""Resume environment MCP tools — read-only career data for the AI assistant."""
from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import AuditPolicy, ToolDef, registry
from app.mcp.schemas.resume_tools import (
    GetResumeProjectInput,
    GetResumeRoleInput,
    ListResumeProjectsInput,
    ListResumeRolesInput,
    ListResumeSkillsInput,
    ResumeCareerSummaryInput,
    ResumeSkillMatrixInput,
)
from app.mcp.tools.repe_tools import _require_uuid, _scope_value, _serialize
from app.services import resume as resume_svc


def _resolve_ids(inp, ctx: McpContext):
    env_id = _require_uuid(_scope_value(inp, ctx, "env_id"), "env_id")
    bid = _require_uuid(_scope_value(inp, ctx, "business_id"), "business_id")
    return env_id, bid


def _list_roles(ctx: McpContext, inp: ListResumeRolesInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    rows = resume_svc.list_roles(env_id=env_id, business_id=bid)
    if inp.company:
        rows = [r for r in rows if inp.company.lower() in r["company"].lower()]
    return {"roles": _serialize(rows), "total": len(rows)}


def _get_role(ctx: McpContext, inp: GetResumeRoleInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    row = resume_svc.get_role(env_id=env_id, business_id=bid, role_id=inp.role_id)
    return {"role": _serialize(row)}


def _list_skills(ctx: McpContext, inp: ListResumeSkillsInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    rows = resume_svc.list_skills(env_id=env_id, business_id=bid, category=inp.category)
    return {"skills": _serialize(rows), "total": len(rows)}


def _list_projects(ctx: McpContext, inp: ListResumeProjectsInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    rows = resume_svc.list_projects(env_id=env_id, business_id=bid, status=inp.status)
    return {"projects": _serialize(rows), "total": len(rows)}


def _get_project(ctx: McpContext, inp: GetResumeProjectInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    row = resume_svc.get_project(env_id=env_id, business_id=bid, project_id=inp.project_id)
    return {"project": _serialize(row)}


def _career_summary(ctx: McpContext, inp: ResumeCareerSummaryInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    return resume_svc.get_career_summary(env_id=env_id, business_id=bid)


def _skill_matrix(ctx: McpContext, inp: ResumeSkillMatrixInput) -> dict:
    env_id, bid = _resolve_ids(inp, ctx)
    matrix = resume_svc.get_skill_matrix(env_id=env_id, business_id=bid)
    return {"matrix": matrix}


_AUDIT = AuditPolicy(
    redact_keys=[],
    max_input_bytes_to_log=5000,
    max_output_bytes_to_log=10000,
)

_TOOLS = [
    ("resume.list_roles", "List all career roles ordered by start date. Optionally filter by company name.", ListResumeRolesInput, _list_roles),
    ("resume.get_role", "Get full detail for a specific career role including achievements and technologies.", GetResumeRoleInput, _get_role),
    ("resume.list_skills", "List all skills with proficiency ratings. Optionally filter by category (data_platform, ai_ml, languages, cloud, visualization, domain, leadership).", ListResumeSkillsInput, _list_skills),
    ("resume.list_projects", "List all projects and case studies with metrics. Optionally filter by status (active, completed, concept).", ListResumeProjectsInput, _list_projects),
    ("resume.get_project", "Get full detail for a specific project including technologies, metrics, and impact.", GetResumeProjectInput, _get_project),
    ("resume.career_summary", "Get computed career KPIs: total years, companies, skills count, education, current role.", ResumeCareerSummaryInput, _career_summary),
    ("resume.skill_matrix", "Get skills grouped by category with average proficiency for radar chart visualization.", ResumeSkillMatrixInput, _skill_matrix),
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
