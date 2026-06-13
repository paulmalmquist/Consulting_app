"""Read-only product API for the Automated Data Engineering surface.

Surfaces the existing governed fabric: the MCP tool registry, the declared
connector inventory, and the audit receipt feed. PR 1 hard constraints: no
external cloud calls, no credential validation, no provider CLIs, no env-var
liveness inference, no secrets, no migrations. Everything fails closed with a
null_reason instead of erroring open.

Paths:
    GET /api/ade/skill-registry
    GET /api/ade/skill-registry/{name}
    GET /api/ade/connectors
    GET /api/ade/runs
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.mcp.registry import registry  # populated by _register_all_tools() in app.main at startup
from app.observability.logger import emit_log
from app.services import ade_connectors
from app.services import audit as audit_svc

router = APIRouter(prefix="/api/ade", tags=["ade"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


def _input_fields(schema: dict) -> list[str]:
    props = schema.get("properties") if isinstance(schema, dict) else None
    return sorted(props.keys()) if isinstance(props, dict) else []


@router.get("/skill-registry")
def skill_registry():
    """List view of every registered MCP tool. Full JSON schema bodies stripped."""
    try:
        tools = []
        module_counts: dict[str, int] = {}
        for t in registry.list_all():
            m = t.manifest()
            tools.append({
                "name": t.name,
                "module": t.module,
                "description": t.description,
                "permission": t.permission,
                "side_effect_class": m["side_effect_class"],
                "permission_required": m["permission_required"],
                "confirmation_required": m["confirmation_required"],
                "lane_tags": m["lane_tags"],
                "skill_tags": m["skill_tags"],
                "input_fields": _input_fields(m["input_schema"]),
            })
            module_counts[t.module] = module_counts.get(t.module, 0) + 1
        if not tools:
            return {"tools": [], "modules": [], "null_reason": "mcp_registry_unavailable"}
        modules = [{"module": k, "tool_count": v} for k, v in sorted(module_counts.items())]
        return {"tools": tools, "modules": modules, "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="ade", action="skill_registry_failed", message=str(exc), error=exc)
        return {"tools": [], "modules": [], "null_reason": "mcp_registry_unavailable"}


@router.get("/skill-registry/{name}")
def skill_detail(name: str):
    """Drawer view: full manifest including the complete input schema for one tool."""
    try:
        tool = registry.get(name)
        if tool is None:
            raise LookupError(f"Unknown tool: {name}")
        m = tool.manifest()
        return {
            "name": tool.name,
            "module": tool.module,
            "description": tool.description,
            "permission": tool.permission,
            "side_effect_class": m["side_effect_class"],
            "permission_required": m["permission_required"],
            "confirmation_required": m["confirmation_required"],
            "lane_tags": m["lane_tags"],
            "skill_tags": m["skill_tags"],
            "input_schema": m["input_schema"],
            "result_adapter": m["result_adapter"],
            "null_reason": None,
        }
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/connectors")
def connectors():
    """Declared connector inventory. Statuses are declarations, never probes."""
    return {"connectors": ade_connectors.list_connectors(), "null_reason": None}


@router.get("/runs")
def runs(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Recent MCP tool-call receipts from the audit log.

    env_id is accepted for portability of the surface, but audit events are
    scoped by business_id only — there is no env_id column on app.audit_events.
    Redaction happened at write time (AuditPolicy); nothing raw is read here.
    """
    try:
        # list_events has no action filter; fetch a larger page and filter in Python.
        events = audit_svc.list_events(business_id=business_id, limit=200)
        rows = []
        for e in events:
            if e.get("action") != "mcp.tool_call":
                continue
            tool = registry.get(e.get("tool_name") or "")
            permission_mode = tool.manifest()["permission_required"] if tool else "unknown"
            created = e.get("created_at")
            rows.append({
                "tool_name": e.get("tool_name"),
                "status": "success" if e.get("success") else "failed",
                "permission_mode": permission_mode,
                "latency_ms": e.get("latency_ms"),
                "actor": e.get("actor"),
                "created_at": created.isoformat() if created is not None else None,
            })
            if len(rows) >= 50:
                break
        return {"runs": rows, "null_reason": None}
    except Exception as exc:  # noqa: BLE001
        # Fail closed: never 500, never return unscoped data.
        emit_log(level="error", service="ade", action="runs_failed", message=str(exc), error=exc)
        return {"runs": [], "null_reason": "audit_read_unavailable"}
