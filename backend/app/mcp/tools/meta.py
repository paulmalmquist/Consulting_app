"""Meta / health tools — bm.health_check, bm.describe_system, bm.list_tools."""

from __future__ import annotations

from datetime import datetime, timezone

from app.config import ENABLE_MCP_WRITES, MCP_RATE_LIMIT_RPM
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.common import (
    HealthCheckInput,
    DescribeSystemInput,
    ListToolsInput,
)


def _health_check(ctx: McpContext, inp: HealthCheckInput) -> dict:
    db_ok = False
    try:
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute("SELECT 1")
            db_ok = True
    except Exception:
        pass

    return {
        "backend_ok": True,
        "db_ok": db_ok,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _describe_system(ctx: McpContext, inp: DescribeSystemInput) -> dict:
    return {
        "backend_version": "0.1.0",
        "writes_enabled": ENABLE_MCP_WRITES,
        "rate_limit_rpm": MCP_RATE_LIMIT_RPM,
        "tool_count": len(registry.list_all()),
    }


def _list_tools(ctx: McpContext, inp: ListToolsInput) -> dict:
    return {"tools": registry.describe_all()}


def register_meta_tools():
    registry.register(ToolDef(
        name="bm.health_check",
        description="Check backend and database health",
        module="bm",
        permission="read",
        input_model=HealthCheckInput,
        handler=_health_check,
        tags=frozenset({"meta", "core"}),
    ))
    registry.register(ToolDef(
        name="bm.describe_system",
        description="Describe system configuration and capabilities",
        module="bm",
        permission="read",
        input_model=DescribeSystemInput,
        handler=_describe_system,
        tags=frozenset({"meta", "core"}),
    ))
    registry.register(ToolDef(
        name="bm.list_tools",
        description="List all available MCP tools with schemas",
        module="bm",
        permission="read",
        input_model=ListToolsInput,
        handler=_list_tools,
        tags=frozenset({"meta", "core"}),
    ))
