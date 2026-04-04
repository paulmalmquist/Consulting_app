from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

from app.assistant_runtime.skill_registry import SKILL_BY_ID
from app.assistant_runtime.turn_receipts import (
    Lane,
    PermissionMode,
    SkillSelection,
    ToolReceipt,
    ToolStatus,
    permission_satisfies,
)
from app.mcp.audit import execute_tool
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry


@dataclass(frozen=True)
class PreparedTools:
    openai_tools: list[dict[str, Any]]
    name_map: dict[str, str]
    active_permission_mode: PermissionMode
    tool_defs: list[ToolDef]


@dataclass(frozen=True)
class ExecutedToolCall:
    receipt: ToolReceipt
    tool_message: dict[str, Any]
    event_payload: dict[str, Any]


def _sanitize_tool_name(name: str) -> str:
    return name.replace(".", "__")


def _strip_schema(schema: dict[str, Any]) -> dict[str, Any]:
    drop_keys = {"$schema", "title"}
    auto_resolved_props = {"env_id", "business_id"}
    out: dict[str, Any] = {}
    for key, value in schema.items():
        if key in drop_keys:
            continue
        if key == "properties" and isinstance(value, dict):
            out[key] = {k: v for k, v in value.items() if k not in auto_resolved_props}
            continue
        if key == "required" and isinstance(value, list):
            out[key] = [item for item in value if item not in auto_resolved_props]
            continue
        out[key] = value
    return out


def _attach_scope(tool_def: ToolDef, args: dict[str, Any], resolved_scope: dict[str, Any]) -> dict[str, Any]:
    fields = getattr(tool_def.input_model, "model_fields", {})
    merged = dict(args)
    if "resolved_scope" in fields and "resolved_scope" not in merged:
        merged["resolved_scope"] = resolved_scope
    return merged


def derive_permission_mode(*, lane: Lane, skill: SkillSelection) -> PermissionMode:
    if skill.skill_id == "create_entity":
        return PermissionMode.WRITE_CONFIRMED
    if lane in (Lane.C_ANALYSIS, Lane.D_DEEP):
        return PermissionMode.ANALYZE
    if lane == Lane.B_LOOKUP:
        return PermissionMode.RETRIEVE
    return PermissionMode.READ


def prepare_tools(*, lane: Lane, skill: SkillSelection) -> PreparedTools:
    active_permission = derive_permission_mode(lane=lane, skill=skill)
    legacy_lane = {
        Lane.A_FAST: "A",
        Lane.B_LOOKUP: "B",
        Lane.C_ANALYSIS: "C",
        Lane.D_DEEP: "D",
    }[lane]
    allowed_tags = set(SKILL_BY_ID[skill.skill_id].allowed_tool_tags) if skill.skill_id else set()

    tool_defs: list[ToolDef] = []
    name_map: dict[str, str] = {}
    openai_tools: list[dict[str, Any]] = []
    for tool in registry.list_all():
        if tool.handler is None or tool.name.startswith("codex."):
            continue
        manifest = tool.manifest()
        if legacy_lane not in manifest["lane_tags"]:
            continue
        if allowed_tags and not (set(manifest["skill_tags"]) & allowed_tags):
            continue
        required = PermissionMode(manifest["permission_required"])
        if not permission_satisfies(active_permission, required):
            continue
        safe_name = _sanitize_tool_name(tool.name)
        name_map[safe_name] = tool.name
        tool_defs.append(tool)
        openai_tools.append(
            {
                "type": "function",
                "function": {
                    "name": safe_name,
                    "description": tool.description[:200],
                    "parameters": _strip_schema(tool.input_schema),
                },
            }
        )
    return PreparedTools(
        openai_tools=openai_tools,
        name_map=name_map,
        active_permission_mode=active_permission,
        tool_defs=tool_defs,
    )


async def execute_tool_calls(
    *,
    collected_tool_calls: dict[int, dict[str, Any]],
    prepared_tools: PreparedTools,
    ctx: McpContext,
    resolved_scope: dict[str, Any],
) -> list[ExecutedToolCall]:
    tool_lookup = {tool.name: tool for tool in prepared_tools.tool_defs}

    async def _run_one(call: dict[str, Any]) -> ExecutedToolCall:
        safe_name = call["name"]
        tool_name = prepared_tools.name_map.get(safe_name, safe_name)
        tool_def = tool_lookup.get(tool_name)
        try:
            raw_args = json.loads(call["args"]) if call.get("args") else {}
        except json.JSONDecodeError:
            raw_args = {}

        if tool_def is None:
            receipt = ToolReceipt(
                tool_name=tool_name,
                status=ToolStatus.FAILED,
                permission_mode=prepared_tools.active_permission_mode,
                input=raw_args,
                output=None,
                error=f"Unknown tool: {tool_name}",
            )
            return ExecutedToolCall(
                receipt=receipt,
                tool_message={"role": "tool", "tool_call_id": call["id"], "content": json.dumps({"error": receipt.error})},
                event_payload={"tool_name": tool_name, "args": raw_args, "result": {"error": receipt.error}, "success": False, "error": receipt.error},
            )

        manifest = tool_def.manifest()
        required = PermissionMode(manifest["permission_required"])
        if not permission_satisfies(prepared_tools.active_permission_mode, required):
            receipt = ToolReceipt(
                tool_name=tool_name,
                status=ToolStatus.DENIED,
                permission_mode=prepared_tools.active_permission_mode,
                input=raw_args,
                output=None,
                error=f"Permission denied: requires {required}",
            )
            return ExecutedToolCall(
                receipt=receipt,
                tool_message={"role": "tool", "tool_call_id": call["id"], "content": json.dumps({"error": receipt.error})},
                event_payload={"tool_name": tool_name, "args": raw_args, "result": {"error": receipt.error}, "success": False, "error": receipt.error},
            )

        merged_args = _attach_scope(tool_def, raw_args, resolved_scope)
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: execute_tool(tool_def, ctx, merged_args),
            )
            receipt = ToolReceipt(
                tool_name=tool_name,
                status=ToolStatus.SUCCESS,
                permission_mode=prepared_tools.active_permission_mode,
                input=merged_args,
                output=result,
            )
        except Exception as exc:
            receipt = ToolReceipt(
                tool_name=tool_name,
                status=ToolStatus.FAILED,
                permission_mode=prepared_tools.active_permission_mode,
                input=merged_args,
                output=None,
                error=str(exc)[:500],
            )
            result = {"error": receipt.error}

        return ExecutedToolCall(
            receipt=receipt,
            tool_message={"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, default=str)},
            event_payload={
                "tool_name": tool_name,
                "args": merged_args,
                "result": result,
                "success": receipt.status == ToolStatus.SUCCESS,
                "error": receipt.error,
            },
        )

    return await asyncio.gather(*[_run_one(call) for call in collected_tool_calls.values()])

