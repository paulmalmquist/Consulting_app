"""MCP stdio server entrypoint.

Reads JSON-RPC style messages from stdin, dispatches to registered tools,
and writes responses to stdout. Implements the MCP protocol for stdio transport.
"""

from __future__ import annotations

import json
import sys
import os

# Allow MCP server to start without DATABASE_URL for tool listing
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")


def _register_all_tools():
    """Register all tool groups."""
    from app.mcp.tools.meta import register_meta_tools
    from app.mcp.tools.business_tools import register_business_tools
    from app.mcp.tools.document_tools import register_document_tools
    from app.mcp.tools.execution_tools import register_execution_tools
    from app.mcp.tools.work_tools import register_work_tools
    from app.mcp.tools.repo_tools import register_repo_tools
    from app.mcp.tools.env_tools import register_env_tools
    from app.mcp.tools.git_tools import register_git_tools
    from app.mcp.tools.fe_tools import register_fe_tools
    from app.mcp.tools.api_tools import register_api_tools
    from app.mcp.tools.db_tools import register_db_tools
    from app.mcp.tools.metrics_tools import register_metrics_tools
    from app.mcp.tools.report_tools import register_report_tools
    from app.mcp.tools.re_model_tools import register_re_model_tools
    from app.mcp.tools.rag_tools import register_rag_tools
    from app.mcp.tools.repe_tools import register_repe_tools
    from app.mcp.tools.repe_finance_tools import register_repe_finance_tools
    from app.mcp.tools.repe_investor_tools import register_repe_investor_tools
    from app.mcp.tools.repe_workflow_tools import register_repe_workflow_tools
    from app.mcp.tools.repe_ops_tools import register_repe_ops_tools
    from app.mcp.tools.repe_analysis_tools import register_repe_analysis_tools
    from app.mcp.tools.repe_platform_tools import register_repe_platform_tools
    from app.mcp.tools.query_tools import register_query_tools
    from app.mcp.tools.credit_tools import register_credit_tools
    from app.mcp.tools.covenant_tools import register_covenant_tools
    from app.mcp.tools.lp_report_tools import register_lp_report_tools
    from app.mcp.tools.notice_tools import register_notice_tools
    from app.mcp.tools.resume_tools import register_resume_tools
    from app.mcp.tools.governance_tools import register_governance_tools
    from app.mcp.tools.ir_tools import register_ir_tools
    from app.mcp.tools.rate_sensitivity_tools import register_rate_sensitivity_tools
    from app.mcp.tools.crm_tools import register_crm_tools
    from app.mcp.tools.trading_tools import register_trading_tools
    from app.mcp.tools.sql_agent_tools import register_sql_agent_tools

    register_meta_tools()
    register_business_tools()
    register_document_tools()
    register_execution_tools()
    register_work_tools()
    register_repo_tools()
    register_env_tools()
    register_git_tools()
    register_fe_tools()
    register_api_tools()
    register_db_tools()
    register_metrics_tools()
    register_report_tools()
    register_re_model_tools()
    register_rag_tools()
    register_repe_tools()
    register_repe_finance_tools()
    register_repe_investor_tools()
    register_repe_workflow_tools()
    register_repe_ops_tools()
    register_repe_analysis_tools()
    register_repe_platform_tools()
    register_query_tools()
    register_credit_tools()
    register_covenant_tools()
    register_lp_report_tools()
    register_notice_tools()
    register_resume_tools()
    register_governance_tools()
    register_ir_tools()
    register_rate_sensitivity_tools()
    register_crm_tools()
    register_trading_tools()
    register_sql_agent_tools()


def _make_response(req_id, result=None, error=None):
    resp = {"jsonrpc": "2.0", "id": req_id}
    if error is not None:
        resp["error"] = error
    else:
        resp["result"] = result
    return resp


def _handle_request(msg: dict) -> dict:
    from app.mcp.registry import registry
    from app.mcp.auth import McpContext
    from app.mcp.audit import execute_tool, WriteNotEnabled, ConfirmRequired
    from app.mcp.rate_limit import check_rate_limit, RateLimitExceeded
    from app.config import MCP_MAX_INPUT_BYTES, MCP_MAX_OUTPUT_BYTES

    req_id = msg.get("id")
    method = msg.get("method", "")
    params = msg.get("params", {})

    # ── MCP protocol methods ───────────────────────────────────────
    if method == "initialize":
        return _make_response(req_id, {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "business-machine", "version": "0.1.0"},
        })

    if method == "notifications/initialized":
        # Notification, no response needed
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
                "message": f"Unknown tool: {tool_name}",
            })

        # Auth
        ctx = McpContext(actor=os.getenv("MCP_ACTOR_NAME", "codex_service_user"), token_valid=True)

        # Execute with audit wrapping
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
                "data": {"approval_required": True},
            })
        except PermissionError as e:
            return _make_response(req_id, error={
                "code": -32000,
                "message": str(e),
            })
        except (LookupError, ValueError) as e:
            return _make_response(req_id, error={
                "code": -32000,
                "message": str(e),
            })
        except Exception as e:
            return _make_response(req_id, error={
                "code": -32603,
                "message": f"Internal error: {str(e)[:500]}",
            })

        # Output size check
        output_str = json.dumps(output)
        if len(output_str.encode()) > MCP_MAX_OUTPUT_BYTES:
            output = {"truncated": True, "message": "Output exceeded max size"}

        return _make_response(req_id, {
            "content": [{"type": "text", "text": json.dumps(output, default=str)}],
        })

    # Unknown method
    return _make_response(req_id, error={
        "code": -32601,
        "message": f"Unknown method: {method}",
    })


def main():
    """Main stdio event loop."""
    _register_all_tools()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            resp = _make_response(None, error={
                "code": -32700,
                "message": "Parse error",
            })
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
            continue

        resp = _handle_request(msg)
        if resp is not None:
            sys.stdout.write(json.dumps(resp, default=str) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
