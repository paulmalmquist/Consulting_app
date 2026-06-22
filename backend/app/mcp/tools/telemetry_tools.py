"""Telemetry MCP tools — READ-only registry facade over `app.services.telemetry_serving`.

Closes the gap where the telemetry copilot used an inline allow-list with no MCP registry presence.
These three read tools are now first-class ToolDefs: JSON-Schema-validated inputs, `permission="read"`,
module `telemetry`, audited through the standard `execute_tool` path. No write tools are added.

It also exposes a small telemetry **scope policy** + `telemetry_scoped_call()` used by the governance
surface to demonstrate a denied tool call with a NAMED policy reason: a tool outside the telemetry scope
is refused with `tool_not_in_telemetry_scope` and a denied audit receipt is written — no write path.
"""
from __future__ import annotations

from app.mcp.audit import execute_tool
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.telemetry_tools import (
    GetAnomalyEventsInWindowInput,
    GetModelRunDetailInput,
    GetTriggeringPredictionInput,
)
from app.services import audit as audit_svc
from app.services import telemetry_serving as svc

# Canonical names for the telemetry read tools (the telemetry scope/allow-list at the MCP layer).
TELEMETRY_TOOL_NAMES = frozenset({
    "telemetry.get_triggering_prediction",
    "telemetry.get_model_run_detail",
    "telemetry.get_anomaly_events_in_window",
})

SCOPE_DENIED_REASON = "tool_not_in_telemetry_scope"


# ── Handlers: (ctx, validated_input) -> dict (read-only) ───────────────────────
def _get_triggering_prediction(ctx: McpContext, inp: GetTriggeringPredictionInput) -> dict:
    return svc.get_triggering_prediction(
        env_id=inp.env_id, business_id=inp.business_id,
        run_key=inp.run_key, fire_tick=inp.fire_tick)


def _get_model_run_detail(ctx: McpContext, inp: GetModelRunDetailInput) -> dict:
    return svc.get_model_run_detail(
        env_id=inp.env_id, business_id=inp.business_id,
        model_name=inp.model_name, model_version=inp.model_version)


def _get_anomaly_events_in_window(ctx: McpContext, inp: GetAnomalyEventsInWindowInput) -> dict:
    return svc.get_anomaly_events_in_window(
        env_id=inp.env_id, business_id=inp.business_id,
        run_key=inp.run_key, t_start=inp.t_start, t_end=inp.t_end)


def register_telemetry_tools() -> None:
    """Register the telemetry read-only tools into the global MCP registry."""
    registry.register(ToolDef(
        name="telemetry.get_triggering_prediction",
        description="Fetch the NO_GO prediction receipt that triggered a verdict at a fire tick.",
        module="telemetry",
        permission="read",
        input_model=GetTriggeringPredictionInput,
        handler=_get_triggering_prediction,
        tags=frozenset({"telemetry", "read-only", "anomaly", "evidence"}),
    ))
    registry.register(ToolDef(
        name="telemetry.get_model_run_detail",
        description="Fetch promoted-model metadata (metrics + gate) for a telemetry model.",
        module="telemetry",
        permission="read",
        input_model=GetModelRunDetailInput,
        handler=_get_model_run_detail,
        tags=frozenset({"telemetry", "read-only", "model"}),
    ))
    registry.register(ToolDef(
        name="telemetry.get_anomaly_events_in_window",
        description="Fetch labeled/detected anomaly events overlapping a tick window.",
        module="telemetry",
        permission="read",
        input_model=GetAnomalyEventsInWindowInput,
        handler=_get_anomaly_events_in_window,
        tags=frozenset({"telemetry", "read-only", "anomaly"}),
    ))


def telemetry_scoped_call(tool_name: str, raw_input: dict, ctx: McpContext) -> dict:
    """Run a tool through the telemetry scope policy + the standard audited executor.

    Policy: only tools in `TELEMETRY_TOOL_NAMES` may be called from the telemetry surface. A call to any
    other tool is DENIED with the named reason `tool_not_in_telemetry_scope` and a denied audit receipt
    is written (so denied calls are auditable, like allowed ones). Allowed calls go through `execute_tool`
    (JSON-Schema validation + audit). This never reaches a write path — only read tools are in scope.
    """
    if tool_name not in TELEMETRY_TOOL_NAMES:
        # Denied by telemetry scope policy — record a denied audit receipt, return the named reason.
        try:
            audit_svc.record_event(
                actor=ctx.actor,
                action="mcp.tool_call",
                tool_name=tool_name,
                success=False,
                latency_ms=0,
                business_id=(ctx.resolved_scope or {}).get("business_id") if ctx.resolved_scope else None,
                input_data=raw_input,
                output_data={},
                error_message=f"denied: {SCOPE_DENIED_REASON}",
            )
        except Exception:  # noqa: BLE001 — audit is best-effort for the denied-demo path
            pass
        return {"allowed": False, "tool_name": tool_name, "null_reason": SCOPE_DENIED_REASON,
                "policy": "telemetry surface may only call tools in the telemetry scope"}

    tool = registry.get(tool_name)
    if tool is None:  # registry not loaded (e.g. server not started) — fail closed, no execution
        return {"allowed": False, "tool_name": tool_name, "null_reason": "tool_not_registered"}
    output = execute_tool(tool, ctx, raw_input)
    return {"allowed": True, "tool_name": tool_name, "output": output}
