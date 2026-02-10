"""Work/Ownership module MCP tools."""

from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.work_tools import (
    ListWorkItemsInput,
    GetWorkItemInput,
    SearchResolutionsInput,
    ListAuditEventsInput,
    CreateWorkItemInput,
    AddCommentInput,
    UpdateStatusInput,
    ResolveItemInput,
)
from app.services import work as work_svc
from app.services import audit as audit_svc


def _list_items(ctx: McpContext, inp: ListWorkItemsInput) -> dict:
    rows = work_svc.list_items(
        business_id=inp.business_id,
        owner=inp.owner,
        status=inp.status,
        item_type=inp.item_type,
        department_id=inp.department_id,
        capability_id=inp.capability_id,
        limit=inp.limit,
        cursor_after=inp.cursor,
    )
    return {
        "items": [
            {
                "work_item_id": str(r["work_item_id"]),
                "title": r["title"],
                "type": r["type"],
                "status": r["status"],
                "owner": r["owner"],
                "priority": r.get("priority"),
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    }


def _get_item(ctx: McpContext, inp: GetWorkItemInput) -> dict:
    item = work_svc.get_item(inp.work_item_id)
    if not item:
        raise LookupError("Work item not found")
    result = {
        "work_item_id": str(item["work_item_id"]),
        "title": item["title"],
        "type": item["type"],
        "status": item["status"],
        "owner": item["owner"],
        "priority": item.get("priority"),
        "description": item.get("description"),
        "created_by": item["created_by"],
        "created_at": str(item["created_at"]),
        "comments": [
            {
                "comment_id": str(c["comment_id"]),
                "comment_type": c["comment_type"],
                "author": c["author"],
                "body": c["body"],
                "created_at": str(c["created_at"]),
            }
            for c in item.get("comments", [])
        ],
        "resolution": None,
    }
    if item.get("resolution"):
        r = item["resolution"]
        result["resolution"] = {
            "resolution_id": str(r["resolution_id"]),
            "summary": r["summary"],
            "outcome": r["outcome"],
            "created_by": r["created_by"],
            "created_at": str(r["created_at"]),
        }
    return result


def _search_resolutions(ctx: McpContext, inp: SearchResolutionsInput) -> dict:
    rows = work_svc.search_resolutions(
        business_id=inp.business_id,
        outcome=inp.outcome,
        limit=inp.limit,
    )
    return {
        "resolutions": [
            {
                "resolution_id": str(r["resolution_id"]),
                "work_item_id": str(r["work_item_id"]),
                "title": r["title"],
                "summary": r["summary"],
                "outcome": r["outcome"],
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    }


def _list_audit_events(ctx: McpContext, inp: ListAuditEventsInput) -> dict:
    rows = audit_svc.list_events(
        business_id=inp.business_id,
        tool_name=inp.tool_name,
        success=inp.success,
        limit=inp.limit,
        cursor_after=inp.cursor,
    )
    return {
        "events": [
            {
                "audit_event_id": str(r["audit_event_id"]),
                "actor": r["actor"],
                "tool_name": r["tool_name"],
                "success": r["success"],
                "latency_ms": r["latency_ms"],
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    }


def _create_item(ctx: McpContext, inp: CreateWorkItemInput) -> dict:
    result = work_svc.create_item(
        business_id=inp.business_id,
        title=inp.title,
        owner=inp.owner,
        item_type=inp.type,
        created_by=ctx.actor,
        department_id=inp.department_id,
        capability_id=inp.capability_id,
        priority=inp.priority,
        description=inp.description,
    )
    return {
        "work_item_id": str(result["work_item_id"]),
        "status": result["status"],
        "created_at": str(result["created_at"]),
    }


def _add_comment(ctx: McpContext, inp: AddCommentInput) -> dict:
    result = work_svc.add_comment(
        work_item_id=inp.work_item_id,
        comment_type=inp.comment_type,
        author=ctx.actor,
        body=inp.body,
    )
    return {
        "comment_id": str(result["comment_id"]),
        "created_at": str(result["created_at"]),
    }


def _update_status(ctx: McpContext, inp: UpdateStatusInput) -> dict:
    result = work_svc.update_status(
        work_item_id=inp.work_item_id,
        new_status=inp.status,
        actor=ctx.actor,
        rationale=inp.rationale,
    )
    return {
        "work_item_id": str(result["work_item_id"]),
        "new_status": result["new_status"],
        "comment_id": str(result["comment_id"]),
    }


def _resolve_item(ctx: McpContext, inp: ResolveItemInput) -> dict:
    result = work_svc.resolve_item(
        work_item_id=inp.work_item_id,
        summary=inp.summary,
        outcome=inp.outcome,
        created_by=ctx.actor,
        linked_documents=inp.linked_documents,
        linked_executions=inp.linked_executions,
    )
    return {
        "resolution_id": str(result["resolution_id"]),
        "created_at": str(result["created_at"]),
    }


def register_work_tools():
    # Read tools
    registry.register(ToolDef(
        name="work.list_items",
        description="List work items for a business with filters",
        module="work",
        permission="read",
        input_model=ListWorkItemsInput,
        handler=_list_items,
    ))
    registry.register(ToolDef(
        name="work.get_item",
        description="Get work item details including comments and resolution",
        module="work",
        permission="read",
        input_model=GetWorkItemInput,
        handler=_get_item,
    ))
    registry.register(ToolDef(
        name="work.search_resolutions",
        description="Search work item resolutions",
        module="work",
        permission="read",
        input_model=SearchResolutionsInput,
        handler=_search_resolutions,
    ))
    registry.register(ToolDef(
        name="work.list_audit_events",
        description="List audit events with optional filters",
        module="work",
        permission="read",
        input_model=ListAuditEventsInput,
        handler=_list_audit_events,
    ))

    # Write tools
    registry.register(ToolDef(
        name="work.create_item",
        description="Create a new work item (request/task/incident/decision/question)",
        module="work",
        permission="write",
        input_model=CreateWorkItemInput,
        handler=_create_item,
    ))
    registry.register(ToolDef(
        name="work.add_comment",
        description="Add a typed comment to a work item",
        module="work",
        permission="write",
        input_model=AddCommentInput,
        handler=_add_comment,
    ))
    registry.register(ToolDef(
        name="work.update_status",
        description="Update work item status (rationale required for waiting/blocked/resolved/closed)",
        module="work",
        permission="write",
        input_model=UpdateStatusInput,
        handler=_update_status,
    ))
    registry.register(ToolDef(
        name="work.resolve_item",
        description="Resolve a work item with summary, outcome, and optional links",
        module="work",
        permission="write",
        input_model=ResolveItemInput,
        handler=_resolve_item,
    ))
