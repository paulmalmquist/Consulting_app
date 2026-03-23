"""MCP audit wrapper — wraps every tool call with audit persistence."""

from __future__ import annotations

import time
from typing import Any

from app.config import ENABLE_MCP_WRITES
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef
from app.services import audit as audit_svc


class WriteNotEnabled(Exception):
    pass


class ConfirmRequired(Exception):
    def __init__(self, message: str, dry_run_result: dict | None = None):
        self.message = message
        self.dry_run_result = dry_run_result
        super().__init__(message)


def execute_tool(
    tool: ToolDef,
    ctx: McpContext,
    raw_input: dict[str, Any],
) -> dict[str, Any]:
    """Execute a tool with full audit wrapping.

    Returns the tool output dict on success.
    Raises on permission/validation/audit failure.
    """
    start = time.time()

    # ── Permission checks ───────────────────────────────────────────
    if tool.permission == "write":
        if not ENABLE_MCP_WRITES:
            raise WriteNotEnabled(
                f"Write operations are disabled in this environment. "
                f"Tool '{tool.name}' requires ENABLE_MCP_WRITES=true."
            )
        # Confirmation is handled by the tool handler's two-phase flow
        # (confirmed=false → pending_confirmation, confirmed=true → execute)

    # ── Validate input ──────────────────────────────────────────────
    validated = tool.input_model.model_validate(raw_input)

    # ── Extract business_id for audit scoping ───────────────────────
    business_id = getattr(validated, "business_id", None)
    if business_id is None:
        nested_scope = getattr(validated, "resolved_scope", None) or getattr(validated, "scope", None)
        business_id = getattr(nested_scope, "business_id", None)
    if business_id is None and ctx.resolved_scope:
        business_id = ctx.resolved_scope.get("business_id")

    # ── Call handler ────────────────────────────────────────────────
    error_message = None
    success = True
    output: dict[str, Any] = {}
    try:
        if tool.handler is None:
            raise RuntimeError(f"No handler registered for {tool.name}")
        output = tool.handler(ctx, validated)
        if not isinstance(output, dict):
            output = {"result": output}
    except Exception as e:
        success = False
        error_message = str(e)[:500]
        raise
    finally:
        latency_ms = int((time.time() - start) * 1000)
        # ── Persist audit event (mandatory) ─────────────────────────
        try:
            audit_svc.record_event(
                actor=ctx.actor,
                action="mcp.tool_call",
                tool_name=tool.name,
                success=success,
                latency_ms=latency_ms,
                business_id=business_id,
                input_data=raw_input,
                output_data=output if success else {},
                error_message=error_message,
            )
        except Exception as audit_err:
            # Compliance-first: if audit fails, fail the request
            if success:
                raise RuntimeError(
                    f"Audit persistence failed for {tool.name}: {audit_err}"
                ) from audit_err

    # ── Best-effort governance decision logging ─────────────────
    try:
        from app.services.governance import record_decision

        record_decision(
            business_id=business_id,
            actor=ctx.actor,
            decision_type="tool_call",
            tool_name=tool.name,
            input_summary=raw_input,
            output_summary=output if success else {},
            latency_ms=latency_ms,
            success=success,
            error_message=error_message,
            tags=list(tool.tags) if tool.tags else [],
        )
    except Exception:
        pass  # governance logging is best-effort

    return output
