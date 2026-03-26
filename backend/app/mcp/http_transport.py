"""MCP HTTP Transport — exposes Winston MCP tools over HTTP.

This module provides a FastAPI router that implements the MCP protocol
over streamable HTTP, enabling any AI client (Claude Desktop, Claude Code,
ChatGPT, custom web apps) to connect to Winston's tool ecosystem.

Transport modes:
  - Streamable HTTP (POST /mcp) — MCP protocol standard, works with Claude Desktop
  - REST proxy (POST /mcp/tools/{tool_name}) — simpler REST calls for ChatGPT/web
  - Tool discovery (GET /mcp/tools) — OpenAPI-compatible tool listing

Auth:
  - Bearer token in Authorization header
  - Per-client API keys (future: JWT with client_id + scope)
"""

from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.mcp.auth import McpContext
from app.mcp.registry import registry
from app.mcp.audit import execute_tool, WriteNotEnabled, ConfirmRequired
from app.mcp.rate_limit import check_rate_limit, RateLimitExceeded
from app.config import MCP_API_TOKEN, MCP_MAX_INPUT_BYTES, MCP_MAX_OUTPUT_BYTES


router = APIRouter(prefix="/mcp", tags=["mcp"])


# ── Auth dependency ──────────────────────────────────────────────────────

def _get_mcp_context(authorization: str | None = Header(None)) -> McpContext:
    """Extract and validate MCP auth from HTTP Authorization header."""
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")

    # Support both "Bearer <token>" and raw token
    token = authorization
    if token.lower().startswith("bearer "):
        token = token[7:]

    if not MCP_API_TOKEN:
        raise HTTPException(500, "MCP_API_TOKEN not configured on server")

    if token != MCP_API_TOKEN:
        raise HTTPException(403, "Invalid MCP API token")

    # Extract actor from custom header or default
    actor = os.getenv("MCP_ACTOR_NAME", "http_client")
    return McpContext(actor=actor, token_valid=True)


# ── MCP Protocol endpoint (streamable HTTP) ─────────────────────────────

class McpJsonRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: int | str | None = None
    method: str
    params: dict[str, Any] = {}


@router.post("")
async def mcp_protocol(request: Request, ctx: McpContext = Depends(_get_mcp_context)):
    """Handle MCP JSON-RPC requests over HTTP.

    This implements the MCP streamable HTTP transport. Clients send
    standard JSON-RPC requests and receive JSON-RPC responses.

    Supports: initialize, tools/list, tools/call, notifications/initialized
    """
    body = await request.json()

    # Handle single request or batch
    if isinstance(body, list):
        responses = [_handle_jsonrpc(msg, ctx) for msg in body]
        responses = [r for r in responses if r is not None]
        return JSONResponse(responses)
    else:
        response = _handle_jsonrpc(body, ctx)
        if response is None:
            return JSONResponse({"jsonrpc": "2.0", "result": "ok"})
        return JSONResponse(response)


def _handle_jsonrpc(msg: dict, ctx: McpContext) -> dict | None:
    """Process a single JSON-RPC message. Mirrors stdio server logic."""
    req_id = msg.get("id")
    method = msg.get("method", "")
    params = msg.get("params", {})

    if method == "initialize":
        return _make_response(req_id, {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "winston-mcp", "version": "0.2.0"},
        })

    if method == "notifications/initialized":
        return None

    if method == "tools/list":
        tools = []
        for t in registry.list_all():
            tools.append({
                "name": t.name,
                "description": t.description,
                "inputSchema": t.input_schema,
            })
        return _make_response(req_id, {"tools": tools})

    if method == "tools/call":
        return _execute_tool_call(req_id, params, ctx)

    return _make_response(req_id, error={
        "code": -32601,
        "message": f"Unknown method: {method}",
    })


# ── REST-style tool endpoints (simpler for ChatGPT / web clients) ────────

@router.get("/tools")
async def list_tools(ctx: McpContext = Depends(_get_mcp_context)):
    """List all available MCP tools with their schemas.

    Returns an OpenAPI-friendly listing that ChatGPT and web clients
    can use for tool discovery.
    """
    tools = []
    for t in registry.list_all():
        tools.append({
            "name": t.name,
            "description": t.description,
            "module": t.module,
            "permission": t.permission,
            "input_schema": t.input_schema,
            "tags": list(t.tags),
        })

    return {
        "server": "winston-mcp",
        "version": "0.2.0",
        "tool_count": len(tools),
        "tools": tools,
    }


@router.get("/tools/{tool_name}")
async def get_tool_schema(tool_name: str, ctx: McpContext = Depends(_get_mcp_context)):
    """Get schema for a specific tool."""
    tool = registry.get(tool_name)
    if not tool:
        raise HTTPException(404, f"Tool not found: {tool_name}")

    return {
        "name": tool.name,
        "description": tool.description,
        "module": tool.module,
        "permission": tool.permission,
        "input_schema": tool.input_schema,
        "output_schema": tool.output_schema,
        "tags": list(tool.tags),
    }


@router.post("/tools/{tool_name}")
async def call_tool(
    tool_name: str,
    request: Request,
    ctx: McpContext = Depends(_get_mcp_context),
):
    """Call a specific tool with arguments (REST-style).

    Simpler than the full MCP protocol — just POST arguments to
    /mcp/tools/{tool_name} and get the result back.

    Works well for ChatGPT function calling and simple web integrations.
    """
    arguments = await request.json()
    result = _execute_tool_call(
        req_id=1,
        params={"name": tool_name, "arguments": arguments},
        ctx=ctx,
    )

    if "error" in result:
        status = 400
        if result["error"].get("code") == -32601:
            status = 404
        elif "approval_required" in (result["error"].get("data") or {}):
            status = 403
        raise HTTPException(status, result["error"]["message"])

    # Unwrap the MCP content format for REST clients
    content = result.get("result", {}).get("content", [])
    if content and content[0].get("type") == "text":
        try:
            return json.loads(content[0]["text"])
        except (json.JSONDecodeError, KeyError):
            return {"result": content[0].get("text")}

    return result.get("result", {})


# ── Module-filtered tool listing ─────────────────────────────────────────

@router.get("/modules")
async def list_modules(ctx: McpContext = Depends(_get_mcp_context)):
    """List available tool modules with tool counts."""
    modules = {}
    for t in registry.list_all():
        if t.module not in modules:
            modules[t.module] = {"module": t.module, "tool_count": 0, "tools": []}
        modules[t.module]["tool_count"] += 1
        modules[t.module]["tools"].append(t.name)

    return {
        "module_count": len(modules),
        "modules": list(modules.values()),
    }


@router.get("/modules/{module_name}/tools")
async def list_module_tools(module_name: str, ctx: McpContext = Depends(_get_mcp_context)):
    """List tools in a specific module."""
    tools = registry.list_by_module(module_name)
    if not tools:
        raise HTTPException(404, f"Module not found: {module_name}")

    return {
        "module": module_name,
        "tool_count": len(tools),
        "tools": [
            {
                "name": t.name,
                "description": t.description,
                "permission": t.permission,
                "input_schema": t.input_schema,
            }
            for t in tools
        ],
    }


# ── Health check ─────────────────────────────────────────────────────────

@router.get("/health")
async def mcp_health():
    """MCP server health check (no auth required)."""
    return {
        "status": "ok",
        "server": "winston-mcp",
        "version": "0.2.0",
        "tool_count": len(registry.list_all()),
        "transport": "http",
    }


# ── Helpers ──────────────────────────────────────────────────────────────

def _execute_tool_call(req_id, params: dict, ctx: McpContext) -> dict:
    """Execute a tool call with full audit wrapping."""
    tool_name = params.get("name", "")
    arguments = params.get("arguments", {})

    # Rate limit
    try:
        check_rate_limit()
    except RateLimitExceeded as e:
        return _make_response(req_id, error={
            "code": -32000,
            "message": str(e),
            "data": {"retry_after_seconds": e.retry_after_seconds},
        })

    # Input size check
    input_bytes = len(json.dumps(arguments).encode())
    if input_bytes > MCP_MAX_INPUT_BYTES:
        return _make_response(req_id, error={
            "code": -32000,
            "message": f"Input too large ({input_bytes} bytes, max {MCP_MAX_INPUT_BYTES})",
        })

    # Lookup tool
    tool = registry.get(tool_name)
    if not tool:
        return _make_response(req_id, error={
            "code": -32601,
            "message": f"Unknown tool: {tool_name}. Use GET /mcp/tools to list available tools.",
        })

    # Execute
    try:
        output = execute_tool(tool, ctx, arguments)
    except WriteNotEnabled as e:
        return _make_response(req_id, error={
            "code": -32000,
            "message": str(e),
            "data": {"approval_required": True},
        })
    except ConfirmRequired as e:
        return _make_response(req_id, error={
            "code": -32000,
            "message": e.message,
            "data": {"approval_required": True, "dry_run": e.dry_run_result},
        })
    except PermissionError as e:
        return _make_response(req_id, error={
            "code": -32000, "message": str(e),
        })
    except (LookupError, ValueError) as e:
        return _make_response(req_id, error={
            "code": -32000, "message": str(e),
        })
    except Exception as e:
        return _make_response(req_id, error={
            "code": -32603, "message": f"Internal error: {str(e)[:500]}",
        })

    # Output size check
    output_str = json.dumps(output, default=str)
    if len(output_str.encode()) > MCP_MAX_OUTPUT_BYTES:
        output = {"truncated": True, "message": "Output exceeded max size"}

    return _make_response(req_id, {
        "content": [{"type": "text", "text": json.dumps(output, default=str)}],
    })


def _make_response(req_id, result=None, error=None) -> dict:
    resp = {"jsonrpc": "2.0", "id": req_id}
    if error is not None:
        resp["error"] = error
    else:
        resp["result"] = result
    return resp
