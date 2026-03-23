"""Business module MCP tools."""

from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.business_tools import (
    ListTemplatesInput,
    CreateBusinessInput,
    ApplyTemplateInput,
    ApplyCustomInput,
    GetBusinessInput,
    ListDepartmentsInput,
    ListCapabilitiesInput,
)
from app.services import business as biz_svc


def _list_templates(ctx: McpContext, inp: ListTemplatesInput) -> dict:
    return {"templates": biz_svc.list_templates()}


def _create_business(ctx: McpContext, inp: CreateBusinessInput) -> dict:
    result = biz_svc.create_business(inp.name, inp.slug, inp.region)
    return {"business_id": str(result["business_id"]), "slug": result["slug"]}


def _apply_template(ctx: McpContext, inp: ApplyTemplateInput) -> dict:
    biz_svc.apply_template(
        inp.business_id, inp.template_key, inp.enabled_departments, inp.enabled_capabilities
    )
    return {"ok": True}


def _apply_custom(ctx: McpContext, inp: ApplyCustomInput) -> dict:
    biz_svc.apply_custom(inp.business_id, inp.enabled_departments, inp.enabled_capabilities)
    return {"ok": True}


def _get_business(ctx: McpContext, inp: GetBusinessInput) -> dict:
    biz = biz_svc.get_business(inp.business_id)
    if not biz:
        raise LookupError("Business not found")
    return {
        "business_id": str(biz["business_id"]),
        "tenant_id": str(biz["tenant_id"]),
        "name": biz["name"],
        "slug": biz["slug"],
        "region": biz["region"],
        "created_at": str(biz["created_at"]),
    }


def _list_departments(ctx: McpContext, inp: ListDepartmentsInput) -> dict:
    rows = biz_svc.list_departments(inp.business_id)
    return {
        "departments": [
            {
                "department_id": str(r["department_id"]),
                "key": r["key"],
                "label": r["label"],
                "icon": r["icon"],
                "sort_order": r["sort_order"],
            }
            for r in rows
        ]
    }


def _list_capabilities(ctx: McpContext, inp: ListCapabilitiesInput) -> dict:
    rows = biz_svc.list_capabilities(inp.business_id, inp.dept_key)
    return {
        "capabilities": [
            {
                "capability_id": str(r["capability_id"]),
                "key": r["key"],
                "label": r["label"],
                "kind": r["kind"],
            }
            for r in rows
        ]
    }


def register_business_tools():
    registry.register(ToolDef(
        name="business.list_templates",
        description="List available business provisioning templates",
        module="business",
        permission="read",
        input_model=ListTemplatesInput,
        handler=_list_templates,
        tags=frozenset({"business", "core"}),
    ))
    registry.register(ToolDef(
        name="business.create",
        description="Create a new business (tenant + business record)",
        module="business",
        permission="write",
        input_model=CreateBusinessInput,
        handler=_create_business,
        tags=frozenset({"business", "core", "write"}),
    ))
    registry.register(ToolDef(
        name="business.apply_template",
        description="Apply a provisioning template to a business",
        module="business",
        permission="write",
        input_model=ApplyTemplateInput,
        handler=_apply_template,
        tags=frozenset({"business", "core", "write"}),
    ))
    registry.register(ToolDef(
        name="business.apply_custom",
        description="Apply custom department/capability selection to a business",
        module="business",
        permission="write",
        input_model=ApplyCustomInput,
        handler=_apply_custom,
        tags=frozenset({"business", "core", "write"}),
    ))
    registry.register(ToolDef(
        name="business.get",
        description="Get business details by ID",
        module="business",
        permission="read",
        input_model=GetBusinessInput,
        handler=_get_business,
        tags=frozenset({"business", "core"}),
    ))
    registry.register(ToolDef(
        name="business.list_departments",
        description="List enabled departments for a business",
        module="business",
        permission="read",
        input_model=ListDepartmentsInput,
        handler=_list_departments,
        tags=frozenset({"business", "core"}),
    ))
    registry.register(ToolDef(
        name="business.list_capabilities",
        description="List enabled capabilities for a department within a business",
        module="business",
        permission="read",
        input_model=ListCapabilitiesInput,
        handler=_list_capabilities,
        tags=frozenset({"business", "core"}),
    ))
