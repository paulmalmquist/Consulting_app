"""Operator MCP tools — exposes command center, projects, sites, vendors,
close tasks to the AI Gateway."""

from __future__ import annotations

from uuid import UUID

from app.mcp.auth import McpContext
from app.mcp.registry import AuditPolicy, ToolDef, registry
from app.mcp.schemas.operator_tools import (
    GetCommandCenterInput,
    GetProjectDetailInput,
    GetSiteDetailInput,
    ListCloseTasksInput,
    ListProjectsInput,
    ListSitesInput,
    ListVendorsInput,
)
from app.mcp.tools.repe_tools import _require_uuid, _scope_value, _serialize
from app.services import operator as operator_svc


def _resolve_env_id(inp, ctx: McpContext) -> UUID:
    return _require_uuid(_scope_value(inp, ctx, "environment_id"), "environment_id")


def _resolve_business_id(inp, ctx: McpContext) -> UUID:
    return _require_uuid(_scope_value(inp, ctx, "business_id"), "business_id")


def _get_command_center(ctx: McpContext, inp: GetCommandCenterInput) -> dict:
    env_id = _resolve_env_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    return _serialize(operator_svc.get_command_center(env_id=env_id, business_id=bid))


def _list_projects(ctx: McpContext, inp: ListProjectsInput) -> dict:
    env_id = _resolve_env_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    projects = operator_svc.list_projects(env_id=env_id, business_id=bid)
    return {"projects": _serialize(projects), "total": len(projects)}


def _get_project_detail(ctx: McpContext, inp: GetProjectDetailInput) -> dict:
    env_id = _resolve_env_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    return _serialize(
        operator_svc.get_project_detail(
            env_id=env_id, business_id=bid, project_id=inp.project_id
        )
    )


def _list_sites(ctx: McpContext, inp: ListSitesInput) -> dict:
    env_id = _resolve_env_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    sites = operator_svc.list_sites(env_id=env_id, business_id=bid)
    return {"sites": _serialize(sites), "total": len(sites)}


def _get_site_detail(ctx: McpContext, inp: GetSiteDetailInput) -> dict:
    env_id = _resolve_env_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    return _serialize(
        operator_svc.get_site_detail(
            env_id=env_id, business_id=bid, site_id=inp.site_id
        )
    )


def _list_vendors(ctx: McpContext, inp: ListVendorsInput) -> dict:
    env_id = _resolve_env_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    vendors = operator_svc.list_vendors(env_id=env_id, business_id=bid)
    return {"vendors": _serialize(vendors), "total": len(vendors)}


def _list_close_tasks(ctx: McpContext, inp: ListCloseTasksInput) -> dict:
    env_id = _resolve_env_id(inp, ctx)
    bid = _resolve_business_id(inp, ctx)
    tasks = operator_svc.list_close_tasks(env_id=env_id, business_id=bid)
    return {"tasks": _serialize(tasks), "total": len(tasks)}


def register_operator_tools() -> None:
    policy = AuditPolicy(
        redact_keys=[],
        max_input_bytes_to_log=5000,
        max_output_bytes_to_log=10000,
    )

    _TOOLS: list[tuple[str, str, type, object]] = [
        (
            "operator.get_command_center",
            "Get executive command center: KPIs, entity performance, at-risk projects, development sites, vendor alerts, close status, and AI focus priorities.",
            GetCommandCenterInput,
            _get_command_center,
        ),
        (
            "operator.list_projects",
            "List all projects across entities with budget, actual, variance, risk score, and status.",
            ListProjectsInput,
            _list_projects,
        ),
        (
            "operator.get_project_detail",
            "Get project detail: budget vs actual by month, timeline, linked documents, tasks, vendor breakdown, root causes, and recommended actions.",
            GetProjectDetailInput,
            _get_project_detail,
        ),
        (
            "operator.list_sites",
            "List development pipeline sites with zoning, status, predevelopment cost, risk score, and timeline.",
            ListSitesInput,
            _list_sites,
        ),
        (
            "operator.get_site_detail",
            "Get development site detail: zoning restrictions, approvals required, blockers, linked documents, and recommended actions.",
            GetSiteDetailInput,
            _get_site_detail,
        ),
        (
            "operator.list_vendors",
            "List vendors with cross-entity spend, contract value, overspend, duplication flags.",
            ListVendorsInput,
            _list_vendors,
        ),
        (
            "operator.list_close_tasks",
            "List month-end close tasks with status, owner, blockers, and due dates.",
            ListCloseTasksInput,
            _list_close_tasks,
        ),
    ]

    for name, desc, inp_model, handler in _TOOLS:
        registry.register(
            ToolDef(
                name=name,
                description=desc,
                module="operator",
                permission="read",
                input_model=inp_model,
                audit_policy=policy,
                handler=handler,
                tags=frozenset({"operator"}),
            )
        )
