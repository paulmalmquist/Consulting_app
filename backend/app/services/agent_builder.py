"""Governed Agent Builder graph validation, persistence, and read-only dry-run runtime."""

from __future__ import annotations

import hashlib
import json
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from jsonschema import ValidationError as JsonSchemaValidationError
from jsonschema import validate as validate_json_schema
import psycopg
from psycopg.types.json import Json

from app.db import get_cursor
from app.mcp.audit import execute_tool
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.schemas.agent_builder import AgentEdge, AgentGraph, AgentNode
from app.services.ai_dispatch.models import (
    AIRequest,
    DispatchStatus,
    Privacy,
    ProviderName,
    RiskLevel,
    TaskMode,
)
from app.services.ai_dispatch.supervisor import run_dispatch
from app.services.control_tower.routing import control_tower_registry


NODE_CATALOG: list[dict[str, Any]] = [
    {"type": "manual_trigger", "label": "Manual Trigger", "category": "Input", "description": "Starts a manual dry-run."},
    {"type": "context_loader", "label": "Context Loader", "category": "Input", "description": "Loads tenant and operator context."},
    {"type": "mcp_tool", "label": "MCP Tool", "category": "Action", "description": "Calls a pinned read-only MCP tool."},
    {"type": "prompt_llm", "label": "Prompt / LLM", "category": "Reasoning", "description": "Runs a bounded governed model call."},
    {"type": "policy_gate", "label": "Policy Gate", "category": "Governance", "description": "Selects a policy-controlled branch."},
    {"type": "cost_guardrail", "label": "Cost Guardrail", "category": "Governance", "description": "Blocks or branches when a budget is exceeded."},
    {"type": "human_approval", "label": "Human Approval", "category": "Governance", "description": "Ends MVP dry-runs with a simulated pending approval."},
    {"type": "receipt_writer", "label": "Receipt Writer", "category": "Evidence", "description": "Materializes an audit checkpoint."},
    {"type": "output", "label": "Output", "category": "Output", "description": "Single terminal workflow output."},
    {"type": "eval_assertion", "label": "Eval Assertion", "category": "Evaluation", "description": "Checks a deterministic assertion."},
]

TERMINAL_STATUSES = {"succeeded", "blocked", "failed", "not_available", "cancelled"}
SECRET_KEY_RE = re.compile(
    r"(^|_)(api_?key|secret|password|passwd|authorization|access_?token|refresh_?token|private_?key)($|_)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{12,}|"
    r"\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,})",
    re.IGNORECASE,
)
MOUSTACHE_RE = re.compile(r"^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$")


class VersionConflictError(ValueError):
    pass


class WorkflowNotFoundError(LookupError):
    pass


@dataclass
class NodeExecution:
    status: str
    output: dict[str, Any]
    branch_handle: str | None = None
    tool_name: str | None = None
    model_name: str | None = None
    cost_usd: float = 0.0
    reason: str | None = None


def _jsonable(value: Any) -> Any:
    if isinstance(value, (UUID, datetime, date, Decimal)):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(_jsonable(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def redact_payload(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, child in value.items():
            if SECRET_KEY_RE.search(str(key)):
                redacted[str(key)] = "[REDACTED]"
            else:
                redacted[str(key)] = redact_payload(child)
        return redacted
    if isinstance(value, list):
        return [redact_payload(item) for item in value]
    if isinstance(value, str) and SECRET_VALUE_RE.search(value):
        return "[REDACTED]"
    return _jsonable(value)


def find_secret_paths(value: Any, path: str = "$") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if SECRET_KEY_RE.search(str(key)):
                found.append(child_path)
            found.extend(find_secret_paths(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(find_secret_paths(child, f"{path}[{index}]"))
    elif isinstance(value, str) and SECRET_VALUE_RE.search(value):
        found.append(path)
    return found


def tool_schema_digest(tool: ToolDef) -> str:
    manifest = tool.manifest()
    payload = {
        "name": tool.name,
        "permission": manifest["permission_required"],
        "side_effect_class": manifest["side_effect_class"],
        "input_schema": tool.input_schema,
        "output_schema": tool.output_schema,
    }
    return sha256_json(payload)


def describe_tools() -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    for tool in sorted(registry.list_all(), key=lambda item: item.name):
        manifest = tool.manifest()
        is_read = (
            tool.permission == "read"
            and manifest["permission_required"] == "read"
            and manifest["side_effect_class"] == "read"
        )
        tools.append(
            {
                "name": tool.name,
                "description": tool.description,
                "module": tool.module,
                "permission": tool.permission,
                "effective_permission": manifest["permission_required"],
                "side_effect_class": manifest["side_effect_class"],
                "confirmation_required": manifest["confirmation_required"],
                "input_schema": tool.input_schema,
                "output_schema": tool.output_schema,
                "schema_digest": tool_schema_digest(tool),
                "enabled": is_read,
                "disabled_reason": None if is_read else "MVP permits read-only MCP tools only",
            }
        )
    return tools


def _issue(code: str, message: str, *, node_id: str | None = None, severity: str = "error") -> dict[str, Any]:
    return {"code": code, "message": message, "node_id": node_id, "severity": severity}


def _graph_maps(graph: AgentGraph) -> tuple[dict[str, AgentNode], dict[str, list[AgentEdge]], dict[str, list[AgentEdge]]]:
    nodes = {node.id: node for node in graph.nodes}
    outgoing: dict[str, list[AgentEdge]] = defaultdict(list)
    incoming: dict[str, list[AgentEdge]] = defaultdict(list)
    for edge in graph.edges:
        outgoing[edge.source].append(edge)
        incoming[edge.target].append(edge)
    return nodes, outgoing, incoming


def topological_order(graph: AgentGraph) -> list[str]:
    nodes, outgoing, incoming = _graph_maps(graph)
    indegree = {node_id: len(incoming[node_id]) for node_id in nodes}
    queue = deque(sorted(node_id for node_id, degree in indegree.items() if degree == 0))
    order: list[str] = []
    while queue:
        node_id = queue.popleft()
        order.append(node_id)
        for edge in sorted(outgoing[node_id], key=lambda item: (item.target, item.source_handle or "")):
            indegree[edge.target] -= 1
            if indegree[edge.target] == 0:
                queue.append(edge.target)
    return order


def validate_graph(graph: AgentGraph) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    nodes, outgoing, incoming = _graph_maps(graph)
    triggers = [node for node in graph.nodes if node.type == "manual_trigger"]
    outputs = [node for node in graph.nodes if node.type == "output"]

    if len(triggers) != 1:
        issues.append(_issue("TRIGGER_COUNT", "Graph must contain exactly one Manual Trigger node."))
    if len(outputs) != 1:
        issues.append(_issue("OUTPUT_COUNT", "Graph must contain exactly one Output node."))

    for edge in graph.edges:
        if edge.source not in nodes or edge.target not in nodes:
            issues.append(_issue("EDGE_NODE_MISSING", f"Edge {edge.source} -> {edge.target} references a missing node."))
        if edge.source == edge.target:
            issues.append(_issue("SELF_LOOP", f"Node {edge.source} cannot connect to itself.", node_id=edge.source))
        if edge.data_type not in {"control", "json", "context", "evidence"}:
            issues.append(_issue("EDGE_TYPE", f"Unsupported edge data_type '{edge.data_type}'."))

    order = topological_order(graph)
    if len(order) != len(nodes):
        issues.append(_issue("CYCLE", "Graph must be a directed acyclic graph."))

    if triggers:
        trigger = triggers[0]
        if incoming[trigger.id]:
            issues.append(_issue("TRIGGER_INCOMING", "Manual Trigger cannot have incoming edges.", node_id=trigger.id))
        reachable: set[str] = set()
        queue = deque([trigger.id])
        while queue:
            current = queue.popleft()
            if current in reachable:
                continue
            reachable.add(current)
            queue.extend(edge.target for edge in outgoing[current])
        for node_id in sorted(set(nodes) - reachable):
            issues.append(_issue("UNREACHABLE_NODE", f"Node '{node_id}' is unreachable.", node_id=node_id))

    for output in outputs:
        if outgoing[output.id]:
            issues.append(_issue("OUTPUT_NOT_TERMINAL", "Output node cannot have outgoing edges.", node_id=output.id))

    for node in graph.nodes:
        if node.type != "output" and not outgoing[node.id] and node.type != "human_approval":
            issues.append(_issue("MISSING_TERMINAL_PATH", "Non-terminal node has no outgoing edge.", node_id=node.id))
        if node.type == "mcp_tool":
            tool_name = str(node.config.get("tool_name") or "")
            tool = registry.get(tool_name) if tool_name else None
            if not tool:
                issues.append(_issue("TOOL_NOT_AVAILABLE", f"Tool '{tool_name or '(unset)'}' is not registered.", node_id=node.id))
            else:
                manifest = tool.manifest()
                if (
                    tool.permission != "read"
                    or manifest["permission_required"] != "read"
                    or manifest["side_effect_class"] != "read"
                ):
                    issues.append(_issue("WRITE_TOOL_FORBIDDEN", f"Tool '{tool.name}' is not read-only.", node_id=node.id))
                expected = tool_schema_digest(tool)
                if node.config.get("tool_schema_digest") != expected:
                    issues.append(_issue("SCHEMA_DIGEST_DRIFT", f"Tool schema pin for '{tool.name}' is missing or stale.", node_id=node.id))
        elif node.type == "prompt_llm":
            if not node.config.get("prompt_template"):
                issues.append(_issue("PROMPT_REQUIRED", "Prompt node requires prompt_template.", node_id=node.id))
            if not node.config.get("prompt_version"):
                issues.append(_issue("PROMPT_VERSION_REQUIRED", "Prompt node requires prompt_version.", node_id=node.id))
            if not isinstance(node.config.get("output_schema"), dict):
                issues.append(_issue("OUTPUT_SCHEMA_REQUIRED", "Prompt node requires a JSON output_schema.", node_id=node.id))
        elif node.type == "policy_gate":
            handles = {edge.source_handle for edge in outgoing[node.id]}
            if not {"pass", "fail"}.issubset(handles):
                issues.append(_issue("GATE_HANDLES", "Policy Gate requires pass and fail outgoing handles.", node_id=node.id))
        elif node.type == "cost_guardrail":
            handles = {edge.source_handle for edge in outgoing[node.id]}
            if not {"under_budget", "over_budget"}.issubset(handles):
                issues.append(_issue("COST_HANDLES", "Cost Guardrail requires under_budget and over_budget handles.", node_id=node.id))

    for path in find_secret_paths(graph.model_dump(mode="json")):
        issues.append(_issue("SECRET_DETECTED", f"Secret-shaped workflow data is forbidden at {path}."))

    status = "pass" if not any(item["severity"] == "error" for item in issues) else "fail"
    return {
        "status": status,
        "checks": {
            "dag": not any(item["code"] == "CYCLE" for item in issues),
            "single_trigger": len(triggers) == 1,
            "single_output": len(outputs) == 1,
            "read_only_tools": not any(item["code"] == "WRITE_TOOL_FORBIDDEN" for item in issues),
            "secrets_absent": not any(item["code"] == "SECRET_DETECTED" for item in issues),
        },
        "issues": issues,
        "topological_order": order,
    }


def compile_pins(graph: AgentGraph) -> dict[str, Any]:
    prompt_versions: dict[str, str] = {}
    tool_digests: dict[str, str] = {}
    for node in graph.nodes:
        if node.type == "prompt_llm":
            prompt_versions[node.id] = str(node.config.get("prompt_version") or "")
        if node.type == "mcp_tool":
            tool_digests[node.id] = str(node.config.get("tool_schema_digest") or "")
    return {
        "prompt_versions": prompt_versions,
        "tool_schema_digests": tool_digests,
        "model_route_policy": graph.model_route_policy,
        "required_permissions": ["read"],
    }


def _row(row: Any) -> dict[str, Any]:
    return _jsonable(dict(row)) if row else {}


def _serialize_workflow(row: Any) -> dict[str, Any]:
    result = _row(row)
    if "graph_json" in result:
        result["graph"] = result.pop("graph_json")
    return result


def _insert_version(cur, *, workflow_id: str, env_id: str, business_id: str, version_number: int,
                    graph: AgentGraph, actor: str) -> tuple[str, dict[str, Any]]:
    validation = validate_graph(graph)
    pins = compile_pins(graph)
    cur.execute(
        """INSERT INTO ai_agent_workflow_versions
             (env_id, business_id, workflow_id, version_number, graph_json,
              prompt_versions, tool_schema_digests, model_route_policy,
              required_permissions, validation_status, validation_results, created_by)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           RETURNING id""",
        (
            env_id, business_id, workflow_id, version_number,
            Json(graph.model_dump(mode="json")),
            Json(pins["prompt_versions"]), Json(pins["tool_schema_digests"]),
            Json(pins["model_route_policy"]), pins["required_permissions"],
            validation["status"], Json(validation), actor,
        ),
    )
    return str(cur.fetchone()["id"]), validation


def create_workflow(*, env_id: str, business_id: str, actor: str, name: str,
                    description: str | None, graph: AgentGraph, tags: list[str] | None = None,
                    is_template: bool = False, template_key: str | None = None) -> dict[str, Any]:
    if find_secret_paths(graph.model_dump(mode="json")):
        raise ValueError("Workflow graph contains secret-shaped keys or values")
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO ai_agent_workflows
                 (env_id, business_id, name, description, owner_user_id, tags, is_template, template_key)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id""",
            (env_id, business_id, name, description, actor, tags or [], is_template, template_key),
        )
        workflow_id = str(cur.fetchone()["id"])
        version_id, validation = _insert_version(
            cur, workflow_id=workflow_id, env_id=env_id, business_id=business_id,
            version_number=1, graph=graph, actor=actor,
        )
        cur.execute(
            "UPDATE ai_agent_workflows SET current_version_id=%s, updated_at=now() WHERE id=%s",
            (version_id, workflow_id),
        )
    return get_workflow(env_id=env_id, business_id=business_id, workflow_id=workflow_id) | {
        "validation": validation
    }


def save_draft(*, env_id: str, business_id: str, actor: str, workflow_id: str,
               base_version_number: int, graph: AgentGraph, name: str | None = None,
               description: str | None = None) -> dict[str, Any]:
    if find_secret_paths(graph.model_dump(mode="json")):
        raise ValueError("Workflow graph contains secret-shaped keys or values")
    with get_cursor() as cur:
        cur.execute(
            """SELECT v.version_number
               FROM ai_agent_workflows w
               JOIN ai_agent_workflow_versions v ON v.id = w.current_version_id
               WHERE w.id=%s AND w.env_id=%s AND w.business_id=%s
               FOR UPDATE""",
            (workflow_id, env_id, business_id),
        )
        current = cur.fetchone()
        if not current:
            raise WorkflowNotFoundError("workflow not found")
        current_version = int(current["version_number"])
        if current_version != base_version_number:
            raise VersionConflictError(
                f"Version conflict: current version is {current_version}, base was {base_version_number}"
            )
        next_version = current_version + 1
        version_id, validation = _insert_version(
            cur, workflow_id=workflow_id, env_id=env_id, business_id=business_id,
            version_number=next_version, graph=graph, actor=actor,
        )
        cur.execute(
            """UPDATE ai_agent_workflows
               SET current_version_id=%s,
                   name=COALESCE(%s, name),
                   description=COALESCE(%s, description),
                   status='draft',
                   updated_at=now()
               WHERE id=%s AND env_id=%s AND business_id=%s""",
            (version_id, name, description, workflow_id, env_id, business_id),
        )
    return get_workflow(env_id=env_id, business_id=business_id, workflow_id=workflow_id) | {
        "validation": validation
    }


def list_workflows(*, env_id: str, business_id: str) -> list[dict[str, Any]]:
    seed_templates(env_id=env_id, business_id=business_id, actor="agent_builder_seed")
    with get_cursor() as cur:
        cur.execute(
            """SELECT w.id, w.name, w.description, w.owner_user_id, w.status, w.tags,
                      w.is_template, w.template_key, w.created_at, w.updated_at,
                      v.id AS version_id, v.version_number, v.validation_status,
                      v.validation_results, v.publish_status,
                      (SELECT r.status FROM ai_agent_runs r
                       WHERE r.workflow_id=w.id AND r.env_id=w.env_id AND r.business_id=w.business_id
                       ORDER BY r.started_at DESC LIMIT 1) AS last_run_status,
                      (SELECT er.overall_status FROM ai_agent_eval_runs er
                       WHERE er.workflow_id=w.id AND er.workflow_version_id=v.id
                         AND er.env_id=w.env_id AND er.business_id=w.business_id
                       ORDER BY er.started_at DESC LIMIT 1) AS eval_overall_status,
                      (SELECT er.summary_json FROM ai_agent_eval_runs er
                       WHERE er.workflow_id=w.id AND er.workflow_version_id=v.id
                         AND er.env_id=w.env_id AND er.business_id=w.business_id
                       ORDER BY er.started_at DESC LIMIT 1) AS eval_summary
               FROM ai_agent_workflows w
               JOIN ai_agent_workflow_versions v ON v.id=w.current_version_id
               WHERE w.env_id=%s AND w.business_id=%s
               ORDER BY w.is_template DESC, w.updated_at DESC""",
            (env_id, business_id),
        )
        return [_row(item) for item in cur.fetchall()]


def get_workflow(*, env_id: str, business_id: str, workflow_id: str) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT w.id, w.name, w.description, w.owner_user_id, w.status, w.tags,
                      w.is_template, w.template_key, w.created_at, w.updated_at,
                      v.id AS version_id, v.version_number, v.graph_json,
                      v.prompt_versions, v.tool_schema_digests, v.model_route_policy,
                      v.required_permissions, v.validation_status, v.validation_results,
                      v.publish_status, v.published_by, v.published_at, v.publish_blockers
               FROM ai_agent_workflows w
               JOIN ai_agent_workflow_versions v ON v.id=w.current_version_id
               WHERE w.id=%s AND w.env_id=%s AND w.business_id=%s""",
            (workflow_id, env_id, business_id),
        )
        item = cur.fetchone()
        if not item:
            raise WorkflowNotFoundError("workflow not found")
        cur.execute(
            """SELECT id, version_number, validation_status, publish_status, publish_blockers,
                      published_by, published_at, created_by, created_at
               FROM ai_agent_workflow_versions
               WHERE workflow_id=%s AND env_id=%s AND business_id=%s
               ORDER BY version_number DESC""",
            (workflow_id, env_id, business_id),
        )
        result = _serialize_workflow(item)
        result["versions"] = [_row(version) for version in cur.fetchall()]
        return result


def validate_saved_workflow(*, env_id: str, business_id: str, workflow_id: str) -> dict[str, Any]:
    workflow = get_workflow(env_id=env_id, business_id=business_id, workflow_id=workflow_id)
    graph = AgentGraph.model_validate(workflow["graph"])
    validation = validate_graph(graph)
    with get_cursor() as cur:
        cur.execute(
            """UPDATE ai_agent_workflow_versions
               SET validation_status=%s, validation_results=%s
               WHERE id=%s AND env_id=%s AND business_id=%s""",
            (validation["status"], Json(validation), workflow["version_id"], env_id, business_id),
        )
    return validation


def list_runs(*, env_id: str, business_id: str, limit: int = 50) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT r.id, r.workflow_id, w.name AS workflow_name, r.workflow_version_id,
                      v.version_number, r.actor_user_id, r.runtime_mode, r.status,
                      r.terminal_reason, r.started_at, r.finished_at, r.cost_estimate,
                      r.actual_cost
               FROM ai_agent_runs r
               JOIN ai_agent_workflows w ON w.id=r.workflow_id
               JOIN ai_agent_workflow_versions v ON v.id=r.workflow_version_id
               WHERE r.env_id=%s AND r.business_id=%s
               ORDER BY r.started_at DESC LIMIT %s""",
            (env_id, business_id, min(max(limit, 1), 200)),
        )
        return [_row(item) for item in cur.fetchall()]


def get_run(*, env_id: str, business_id: str, run_id: str) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT r.*, w.name AS workflow_name, v.version_number
               FROM ai_agent_runs r
               JOIN ai_agent_workflows w ON w.id=r.workflow_id
               JOIN ai_agent_workflow_versions v ON v.id=r.workflow_version_id
               WHERE r.id=%s AND r.env_id=%s AND r.business_id=%s""",
            (run_id, env_id, business_id),
        )
        run = cur.fetchone()
        if not run:
            raise LookupError("run not found")
        cur.execute(
            """SELECT * FROM ai_agent_run_steps
               WHERE run_id=%s AND env_id=%s AND business_id=%s ORDER BY started_at, node_id""",
            (run_id, env_id, business_id),
        )
        steps = [_row(item) for item in cur.fetchall()]
        cur.execute(
            """SELECT * FROM ai_agent_receipts
               WHERE run_id=%s AND env_id=%s AND business_id=%s ORDER BY created_at""",
            (run_id, env_id, business_id),
        )
        receipts = [_row(item) for item in cur.fetchall()]
        result = _row(run)
        result["steps"] = steps
        result["receipts"] = receipts
        return result


def get_run_events(*, env_id: str, business_id: str, run_id: str) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM ai_agent_run_events
               WHERE run_id=%s AND env_id=%s AND business_id=%s ORDER BY sequence_number""",
            (run_id, env_id, business_id),
        )
        return [_row(item) for item in cur.fetchall()]


def _resolve_path(path: str, *, run_input: dict[str, Any], outputs: dict[str, dict[str, Any]]) -> Any:
    parts = path.split(".")
    if parts[0] == "input":
        current: Any = run_input
        parts = parts[1:]
    else:
        current = outputs.get(parts[0])
        parts = parts[1:]
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            raise KeyError(path)
        current = current[part]
    return current


def resolve_bindings(value: Any, *, run_input: dict[str, Any], outputs: dict[str, dict[str, Any]]) -> Any:
    if isinstance(value, dict):
        return {key: resolve_bindings(child, run_input=run_input, outputs=outputs) for key, child in value.items()}
    if isinstance(value, list):
        return [resolve_bindings(child, run_input=run_input, outputs=outputs) for child in value]
    if isinstance(value, str):
        match = MOUSTACHE_RE.match(value)
        if match:
            return _resolve_path(match.group(1), run_input=run_input, outputs=outputs)
        rendered = value
        for token in re.findall(r"\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}", value):
            rendered = re.sub(
                r"\{\{\s*" + re.escape(token) + r"\s*\}\}",
                str(_resolve_path(token, run_input=run_input, outputs=outputs)),
                rendered,
            )
        return rendered
    return value


def _execute_node(*, node: AgentNode, graph: AgentGraph, run_input: dict[str, Any],
                  outputs: dict[str, dict[str, Any]], env_id: str, business_id: str,
                  actor: str, accumulated_cost: float, run_id: str) -> NodeExecution:
    config = node.config
    if node.type == "manual_trigger":
        return NodeExecution("completed", dict(run_input))
    if node.type == "context_loader":
        return NodeExecution(
            "completed",
            {"env_id": env_id, "business_id": business_id, "actor": actor, **dict(config.get("context") or {})},
        )
    if node.type == "mcp_tool":
        tool_name = str(config.get("tool_name") or "")
        tool = registry.get(tool_name)
        if not tool:
            return NodeExecution("not_available", {}, tool_name=tool_name, reason="tool_not_registered")
        manifest = tool.manifest()
        if (
            tool.permission != "read"
            or manifest["permission_required"] != "read"
            or manifest["side_effect_class"] != "read"
        ):
            return NodeExecution("failed", {}, tool_name=tool_name, reason="write_tool_forbidden")
        if config.get("tool_schema_digest") != tool_schema_digest(tool):
            return NodeExecution("not_available", {}, tool_name=tool_name, reason="tool_schema_digest_mismatch")
        try:
            raw_input = resolve_bindings(
                config.get("bindings") or {}, run_input=run_input, outputs=outputs
            )
        except KeyError as exc:
            return NodeExecution("not_available", {}, tool_name=tool_name, reason=f"missing_binding:{exc.args[0]}")
        ctx = McpContext(
            actor=actor,
            token_valid=True,
            resolved_scope={"env_id": env_id, "business_id": business_id},
        )
        try:
            result = execute_tool(tool, ctx, raw_input)
        except Exception as exc:  # noqa: BLE001
            return NodeExecution("not_available", {}, tool_name=tool_name, reason=str(exc)[:500])
        if tool.output_model is not None:
            try:
                result = tool.output_model.model_validate(result).model_dump(mode="json")
            except Exception as exc:  # noqa: BLE001
                return NodeExecution(
                    "not_available",
                    {},
                    tool_name=tool_name,
                    reason=f"tool_output_schema_mismatch:{exc}",
                )
        return NodeExecution("completed", _jsonable(result), tool_name=tool_name)
    if node.type == "prompt_llm":
        from app.config import AI_DISPATCH_ENABLED

        if not AI_DISPATCH_ENABLED:
            return NodeExecution("not_available", {}, reason="AI_DISPATCH_ENABLED is false")
        configured_estimate = float(config.get("estimated_cost_usd") or 0)
        if accumulated_cost + configured_estimate > graph.limits.max_cost_usd:
            return NodeExecution("blocked", {}, reason="max_cost_exceeded_before_model_call")
        try:
            task = resolve_bindings(
                str(config.get("prompt_template") or ""), run_input=run_input, outputs=outputs
            )
        except KeyError as exc:
            return NodeExecution("not_available", {}, reason=f"missing_binding:{exc.args[0]}")
        privacy = Privacy(str(config.get("privacy") or "internal"))
        risk = RiskLevel(str(config.get("risk_level") or "medium"))
        mode = TaskMode(str(config.get("mode") or "classification"))
        sensitive = privacy == Privacy.SENSITIVE or bool(config.get("itar_tagged"))
        forced_provider = ProviderName.GEMMA_GCP if sensitive else (
            ProviderName(config["forced_provider"]) if config.get("forced_provider") else None
        )
        request = AIRequest(
            task=task,
            mode=mode,
            risk_level=risk,
            privacy=Privacy.SENSITIVE if sensitive else privacy,
            env_id=env_id,
            business_id=business_id,
            allow_fallback=False if sensitive else bool(config.get("allow_fallback", False)),
            forced_provider=forced_provider,
            max_tokens=int(config.get("max_tokens") or 512),
            metadata={"agent_builder_run_id": run_id, "node_id": node.id},
        )
        result = run_dispatch(
            request,
            registry=control_tower_registry() if sensitive else None,
        ) if sensitive else run_dispatch(request)
        if result.status != DispatchStatus.SUCCESS or not result.answer:
            return NodeExecution(
                "not_available", {},
                model_name=result.model,
                reason=(result.null_reason.value if result.null_reason else result.routing_reason),
            )
        try:
            parsed = json.loads(result.answer)
            validate_json_schema(instance=parsed, schema=config["output_schema"])
        except (json.JSONDecodeError, JsonSchemaValidationError, KeyError) as exc:
            return NodeExecution("failed", {}, model_name=result.model, reason=f"output_schema_validation_failed:{exc}")
        prompt_tokens = result.usage.prompt_tokens or 0
        completion_tokens = result.usage.completion_tokens or 0
        estimated_cost = float(config.get("estimated_cost_usd") or ((prompt_tokens + completion_tokens) * 0.000001))
        return NodeExecution("completed", _jsonable(parsed), model_name=result.model, cost_usd=estimated_cost)
    if node.type == "policy_gate":
        policy = str(config.get("policy") or "always_pass")
        passed = policy in {"always_pass", "read_only_only", "no_write_without_operator_approval"}
        if policy == "require_input":
            required = str(config.get("required_input") or "")
            try:
                passed = bool(_resolve_path(required, run_input=run_input, outputs=outputs))
            except KeyError:
                passed = False
        return NodeExecution(
            "completed" if passed else "warning",
            {"policy": policy, "passed": passed},
            branch_handle="pass" if passed else "fail",
            reason=None if passed else f"policy_denied:{policy}",
        )
    if node.type == "cost_guardrail":
        estimate = accumulated_cost + float(config.get("estimated_next_cost_usd") or 0)
        budget = float(config.get("max_cost_usd") or graph.limits.max_cost_usd)
        under = estimate <= budget
        return NodeExecution(
            "completed" if under else "warning",
            {"estimated_cost_usd": estimate, "budget_usd": budget, "under_budget": under},
            branch_handle="under_budget" if under else "over_budget",
            reason=None if under else "cost_budget_exceeded",
        )
    if node.type == "human_approval":
        return NodeExecution(
            "blocked",
            {"approval_status": "simulated_pending", "reason": config.get("reason") or "human approval required"},
            reason="human_approval_required",
        )
    if node.type == "receipt_writer":
        return NodeExecution("completed", {"checkpoint": config.get("checkpoint") or node.id})
    if node.type == "eval_assertion":
        path = str(config.get("path") or "")
        try:
            actual = _resolve_path(path, run_input=run_input, outputs=outputs)
        except KeyError:
            return NodeExecution("failed", {}, reason=f"assertion_path_missing:{path}")
        expected = config.get("equals")
        if actual != expected:
            return NodeExecution("failed", {"actual": actual, "expected": expected}, reason="eval_assertion_failed")
        return NodeExecution("completed", {"passed": True, "actual": actual})
    if node.type == "output":
        try:
            value = resolve_bindings(config.get("bindings") or {}, run_input=run_input, outputs=outputs)
        except KeyError as exc:
            return NodeExecution("not_available", {}, reason=f"missing_binding:{exc.args[0]}")
        return NodeExecution("completed", _jsonable(value))
    return NodeExecution("failed", {}, reason=f"unsupported_node_type:{node.type}")


def _insert_event(cur, *, env_id: str, business_id: str, run_id: str,
                  sequence: int, event_type: str, status: str | None,
                  node_id: str | None = None, step_id: str | None = None,
                  payload: dict[str, Any] | None = None) -> None:
    cur.execute(
        """INSERT INTO ai_agent_run_events
             (env_id,business_id,run_id,step_id,node_id,sequence_number,event_type,status,payload_json)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (env_id, business_id, run_id, step_id, node_id, sequence, event_type, status, Json(redact_payload(payload or {}))),
    )


def dry_run(*, env_id: str, business_id: str, actor: str, workflow_id: str,
            run_input: dict[str, Any]) -> dict[str, Any]:
    workflow = get_workflow(env_id=env_id, business_id=business_id, workflow_id=workflow_id)
    graph = AgentGraph.model_validate(workflow["graph"])
    validation = validate_graph(graph)
    fatal_codes = {item["code"] for item in validation["issues"] if item["severity"] == "error"}
    validation_terminal = (
        "not_available"
        if fatal_codes & {"TOOL_NOT_AVAILABLE", "SCHEMA_DIGEST_DRIFT"}
        else "failed"
    )
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO ai_agent_runs
                 (env_id,business_id,workflow_id,workflow_version_id,actor_user_id,
                  runtime_mode,status,input_json)
               VALUES (%s,%s,%s,%s,%s,'dry_run','running',%s)
               RETURNING id""",
            (env_id, business_id, workflow_id, workflow["version_id"], actor, Json(redact_payload(run_input))),
        )
        run_id = str(cur.fetchone()["id"])
        sequence = 1
        _insert_event(
            cur, env_id=env_id, business_id=business_id, run_id=run_id,
            sequence=sequence, event_type="run.started", status="running",
            payload={"workflow_version": workflow["version_number"]},
        )

    if validation["status"] != "pass":
        with get_cursor() as cur:
            sequence += 1
            _insert_event(
                cur, env_id=env_id, business_id=business_id, run_id=run_id,
                sequence=sequence, event_type="run.completed", status=validation_terminal,
                payload={"validation": validation},
            )
            cur.execute(
                """UPDATE ai_agent_runs
                   SET status=%s, terminal_reason='graph_validation_failed', finished_at=now(),
                       error_json=%s
                   WHERE id=%s""",
                (validation_terminal, Json(validation), run_id),
            )
        return get_run(env_id=env_id, business_id=business_id, run_id=run_id)

    nodes, outgoing, incoming = _graph_maps(graph)
    order = validation["topological_order"]
    outputs: dict[str, dict[str, Any]] = {}
    selected_edges: set[tuple[str, str, str | None]] = set()
    executed: set[str] = set()
    terminal_status = "succeeded"
    terminal_reason: str | None = None
    actual_cost = 0.0
    tool_calls = 0
    final_output: dict[str, Any] = {}
    run_started = time.monotonic()

    for node_id in order:
        node = nodes[node_id]
        active = node.type == "manual_trigger" or any(
            (edge.source, edge.target, edge.source_handle) in selected_edges
            for edge in incoming[node_id]
        )
        status = "running" if active else "skipped"
        input_view = {
            "run_input": run_input if node.type == "manual_trigger" else {},
            "upstream": {edge.source: outputs.get(edge.source) for edge in incoming[node_id] if edge.source in outputs},
            "config": node.config,
        }
        input_hash = sha256_json(input_view)
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO ai_agent_run_steps
                     (env_id,business_id,run_id,node_id,node_type,status,input_hash,input_json)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                   RETURNING id""",
                (env_id, business_id, run_id, node.id, node.type, status, input_hash, Json(redact_payload(input_view))),
            )
            step_id = str(cur.fetchone()["id"])
            sequence += 1
            _insert_event(
                cur, env_id=env_id, business_id=business_id, run_id=run_id,
                step_id=step_id, node_id=node.id, sequence=sequence,
                event_type="step.started", status=status,
            )

        if not active or terminal_status != "succeeded":
            execution = NodeExecution("skipped", {})
        elif time.monotonic() - run_started > graph.limits.max_runtime_seconds:
            execution = NodeExecution("failed", {}, reason="max_runtime_exceeded")
        elif node.type == "mcp_tool" and tool_calls >= graph.limits.max_tool_calls:
            execution = NodeExecution("blocked", {}, reason="max_tool_calls_exceeded")
        else:
            started = time.monotonic()
            execution = _execute_node(
                node=node, graph=graph, run_input=run_input, outputs=outputs,
                env_id=env_id, business_id=business_id, actor=actor,
                accumulated_cost=actual_cost, run_id=run_id,
            )
            if time.monotonic() - started > graph.limits.max_runtime_seconds:
                execution = NodeExecution("failed", {}, reason="max_runtime_exceeded")
            if node.type == "mcp_tool" and execution.status != "skipped":
                tool_calls += 1

        output_hash = sha256_json(execution.output)
        actual_cost += execution.cost_usd
        if execution.status in {"completed", "warning"}:
            outputs[node.id] = execution.output
            executed.add(node.id)
            if node.type == "output":
                final_output = execution.output
            for edge in outgoing[node.id]:
                if execution.branch_handle is None or edge.source_handle == execution.branch_handle:
                    selected_edges.add((edge.source, edge.target, edge.source_handle))
        elif execution.status in {"blocked", "failed", "not_available"} and terminal_status == "succeeded":
            terminal_status = execution.status
            terminal_reason = execution.reason

        receipt_payload = {
            "workflow_id": workflow_id,
            "workflow_version": workflow["version_number"],
            "run_id": run_id,
            "node_id": node.id,
            "actor": actor,
            "input_hash": input_hash,
            "output_hash": output_hash,
            "tools_called": [execution.tool_name] if execution.tool_name else [],
            "model_used": execution.model_name,
            "cost_estimate": execution.cost_usd,
            "terminal_status": execution.status,
            "failure_reason": execution.reason,
        }
        with get_cursor() as cur:
            if execution.status == "blocked" and node.type == "human_approval":
                cur.execute(
                    """INSERT INTO ai_agent_approvals
                         (env_id,business_id,run_id,node_id,requested_by,approval_status,approval_reason)
                       VALUES (%s,%s,%s,%s,%s,'simulated_pending',%s)""",
                    (env_id, business_id, run_id, node.id, actor, execution.reason),
                )
            cur.execute(
                """INSERT INTO ai_agent_receipts
                     (env_id,business_id,workflow_id,workflow_version_id,run_id,step_id,node_id,
                      receipt_type,actor,input_hash,output_hash,tools_called,model_used,cost_estimate,
                      terminal_status,failure_reason,receipt_json)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   RETURNING id""",
                (
                    env_id, business_id, workflow_id, workflow["version_id"], run_id, step_id, node.id,
                    "tool" if execution.tool_name else "model" if execution.model_name else "step",
                    actor, input_hash, output_hash, Json(receipt_payload["tools_called"]),
                    execution.model_name, execution.cost_usd, execution.status, execution.reason,
                    Json(receipt_payload),
                ),
            )
            receipt_id = str(cur.fetchone()["id"])
            cur.execute(
                """UPDATE ai_agent_run_steps
                   SET status=%s, finished_at=now(), output_hash=%s, output_json=%s,
                       tool_name=%s, model_name=%s, error_json=%s, receipt_id=%s
                   WHERE id=%s""",
                (
                    execution.status, output_hash, Json(redact_payload(execution.output)),
                    execution.tool_name, execution.model_name,
                    Json({"reason": execution.reason}) if execution.reason else None,
                    receipt_id, step_id,
                ),
            )
            sequence += 1
            _insert_event(
                cur, env_id=env_id, business_id=business_id, run_id=run_id,
                step_id=step_id, node_id=node.id, sequence=sequence,
                event_type="step.completed", status=execution.status,
                payload={"receipt_id": receipt_id, "reason": execution.reason},
            )

    if terminal_status == "succeeded" and not any(nodes[node_id].type == "output" for node_id in executed):
        terminal_status = "not_available"
        terminal_reason = "output_not_reached"

    with get_cursor() as cur:
        sequence += 1
        _insert_event(
            cur, env_id=env_id, business_id=business_id, run_id=run_id,
            sequence=sequence, event_type="run.completed", status=terminal_status,
            payload={"terminal_reason": terminal_reason},
        )
        cur.execute(
            """UPDATE ai_agent_runs
               SET status=%s, terminal_reason=%s, finished_at=now(), output_json=%s,
                   actual_cost=%s
               WHERE id=%s""",
            (terminal_status, terminal_reason, Json(redact_payload(final_output)), actual_cost, run_id),
        )
    return get_run(env_id=env_id, business_id=business_id, run_id=run_id)


def _node(node_id: str, node_type: str, x: int, label: str, config: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"id": node_id, "type": node_type, "label": label, "position": {"x": x, "y": 120}, "config": config or {}}


def _edge(source: str, target: str, source_handle: str | None = None) -> dict[str, Any]:
    return {
        "id": f"{source}-{source_handle or 'next'}-{target}",
        "source": source,
        "target": target,
        "source_handle": source_handle,
        "data_type": "control",
    }


def _deferred_capability_graph(*, capability: str) -> dict[str, Any]:
    reason = (
        f"{capability} is not registered as an executable read-only Agent Builder capability. "
        "Operator review is required before enabling it."
    )
    return {
        "schema_version": "agent-graph/v1",
        "limits": {"max_runtime_seconds": 120, "max_tool_calls": 0, "max_cost_usd": 0},
        "model_route_policy": {"sensitive_fallback": "fail_closed"},
        "nodes": [
            _node("trigger", "manual_trigger", 40, "Manual Trigger"),
            _node("context", "context_loader", 260, "Load Governed Context"),
            _node(
                "capability_gate",
                "human_approval",
                500,
                "Capability Gate",
                {"reason": reason},
            ),
            _node(
                "output",
                "output",
                760,
                "Fail-Closed Result",
                {"bindings": {"status": "NOT_AVAILABLE", "reason": reason}},
            ),
        ],
        "edges": [
            _edge("trigger", "context"),
            _edge("context", "capability_gate"),
            _edge("capability_gate", "output"),
        ],
    }


def template_graphs() -> list[dict[str, Any]]:
    preview = registry.get("telemetry.preview_score_window")
    preview_digest = tool_schema_digest(preview) if preview else "not_available"
    telemetry_graph = {
        "schema_version": "agent-graph/v1",
        "limits": {"max_runtime_seconds": 120, "max_tool_calls": 3, "max_cost_usd": 0.25},
        "model_route_policy": {"sensitive_fallback": "fail_closed"},
        "nodes": [
            _node("trigger", "manual_trigger", 40, "Manual Trigger"),
            _node("context", "context_loader", 250, "Load Run Context"),
            _node("score", "mcp_tool", 470, "Preview Score Window", {
                "tool_name": "telemetry.preview_score_window",
                "tool_schema_digest": preview_digest,
                "bindings": {
                    "env_id": "{{context.env_id}}",
                    "business_id": "{{context.business_id}}",
                    "run_key": "{{trigger.run_key}}",
                    "channel_name": "{{trigger.channel}}",
                    "window": "{{trigger.window}}",
                },
            }),
            _node("receipt", "receipt_writer", 700, "Receipt Writer"),
            _node("output", "output", 910, "Operator Verdict", {
                "bindings": {
                    "verdict": "{{score.verdict}}",
                    "model_version": "{{score.model_version}}",
                    "confidence": "{{score.confidence}}",
                    "missing_data": "{{score.missing_data}}",
                }
            }),
        ],
        "edges": [
            _edge("trigger", "context"), _edge("context", "score"),
            _edge("score", "receipt"), _edge("receipt", "output"),
        ],
    }

    definitions = [
        ("telemetry-triage", "Telemetry Go/No-Go Triage Agent", "Runnable read-only telemetry score preview.", telemetry_graph),
        ("metric-lineage-qa", "Metric Lineage QA Agent", "Draft shell for governed metric and lineage QA.", None),
        ("grounded-flight-readiness", "Grounded Flight Readiness Analyst", "Draft shell for cited RAG answers.", None),
        ("cost-guardrail-query", "Cost Guardrail Query Agent", "Draft shell that demonstrates deterministic budget branching.", None),
        ("sensitive-private-tier", "Sensitive Routing / Private Tier Agent", "Draft shell that fails closed without private model capacity.", None),
        ("ticket-to-pr-evidence", "Ticket-to-PR Evidence Agent", "Dry-run planning shell ending at simulated human approval.", None),
    ]
    governed_definitions = [
        (
            "governed-ticket-intake",
            "Ticket Intake Agent",
            "Governed intake and classification shell; ticket writes remain approval-gated and deferred.",
            "Ticket intake system integration",
        ),
        (
            "governed-analytics-engineer",
            "Analytics Engineer Agent",
            "Governed analytics implementation shell; warehouse and repository mutations remain deferred.",
            "Analytics engineering execution",
        ),
        (
            "governed-bigquery-sql",
            "BigQuery SQL Agent",
            "Governed BigQuery planning shell; query execution requires a registered read-only cost-aware tool.",
            "BigQuery query execution",
        ),
        (
            "governed-data-quality",
            "Data Quality Agent",
            "Governed data-quality shell; source-specific checks require registered deterministic contracts.",
            "Data-quality source inspection",
        ),
        (
            "governed-looker-dashboard",
            "Looker Dashboard Agent",
            "Governed Looker analysis shell; dashboard reads require a registered read-only connector.",
            "Looker dashboard access",
        ),
        (
            "governed-rag-knowledge",
            "RAG Knowledge Agent",
            "Governed retrieval shell; corpus retrieval and citation evaluation remain fail-closed until registered.",
            "RAG corpus retrieval",
        ),
        (
            "governed-ci-cd-evidence",
            "CI/CD Evidence Agent",
            "Governed delivery-evidence shell; CI provider access requires a registered read-only connector.",
            "CI/CD evidence retrieval",
        ),
        (
            "governed-cost-watchdog",
            "Cost Watchdog Agent",
            "Governed cost-monitoring shell; billing reads require a registered deterministic cost source.",
            "Cost and billing telemetry",
        ),
        (
            "governed-release-notes",
            "Release Notes Agent",
            "Governed release-note shell; repository and deployment evidence must be registered before synthesis.",
            "Release evidence retrieval",
        ),
        (
            "governed-executive-summary",
            "Executive Summary Agent",
            "Governed executive-summary shell; authoritative source retrieval must be registered before synthesis.",
            "Executive source retrieval",
        ),
    ]
    templates: list[dict[str, Any]] = []
    for index, (key, name, description, graph) in enumerate(definitions):
        if graph is None:
            nodes = [
                _node("trigger", "manual_trigger", 40, "Manual Trigger"),
                _node("context", "context_loader", 260, "Load Context"),
            ]
            edges = [_edge("trigger", "context")]
            if key == "cost-guardrail-query":
                nodes.extend([
                    _node("guard", "cost_guardrail", 480, "Cost Guardrail", {"max_cost_usd": 0.1, "estimated_next_cost_usd": 1.0}),
                    _node("safe", "receipt_writer", 700, "Suggest Safer Query"),
                    _node("blocked", "receipt_writer", 700, "Blocked Attempt Receipt"),
                    _node("output", "output", 920, "Operator Output", {"bindings": {"status": "BLOCKED_OR_SCOPED"}}),
                ])
                edges.extend([
                    _edge("context", "guard"), _edge("guard", "safe", "under_budget"),
                    _edge("guard", "blocked", "over_budget"), _edge("safe", "output"), _edge("blocked", "output"),
                ])
            elif key == "ticket-to-pr-evidence":
                nodes.extend([
                    _node("approval", "human_approval", 500, "Human Approval", {"reason": "Write action deferred in read-only MVP"}),
                    _node("output", "output", 760, "Evidence Report", {"bindings": {"status": "PENDING_APPROVAL"}}),
                ])
                edges.extend([_edge("context", "approval"), _edge("approval", "output")])
            elif key == "sensitive-private-tier":
                nodes.extend([
                    _node("prompt", "prompt_llm", 480, "Private Tier Model Call", {
                        "prompt_template": "Classify the supplied request: {{trigger.request}}",
                        "prompt_version": "sensitive-route/v1",
                        "privacy": "sensitive",
                        "itar_tagged": True,
                        "mode": "classification",
                        "output_schema": {
                            "type": "object",
                            "properties": {"classification": {"type": "string"}},
                            "required": ["classification"],
                            "additionalProperties": False,
                        },
                    }),
                    _node("output", "output", 740, "Routing Report", {"bindings": {"classification": "{{prompt.classification}}"}}),
                ])
                edges.extend([_edge("context", "prompt"), _edge("prompt", "output")])
            else:
                nodes.extend([
                    _node("approval", "human_approval", 500, "Capability Gate", {"reason": "Capability deferred from read-only MVP"}),
                    _node("output", "output", 760, "Result", {"bindings": {"status": "NOT_AVAILABLE"}}),
                ])
                edges.extend([_edge("context", "approval"), _edge("approval", "output")])
            graph = {
                "schema_version": "agent-graph/v1",
                "limits": {"max_runtime_seconds": 120, "max_tool_calls": 5, "max_cost_usd": 0.5},
                "model_route_policy": {"sensitive_fallback": "fail_closed"},
                "nodes": nodes,
                "edges": edges,
            }
        templates.append({"key": key, "name": name, "description": description, "graph": graph, "sort": index})
    for offset, (key, name, description, capability) in enumerate(governed_definitions, start=len(definitions)):
        templates.append(
            {
                "key": key,
                "name": name,
                "description": description,
                "graph": _deferred_capability_graph(capability=capability),
                "sort": offset,
                "tags": ["template", "governed-agent", "read-only"],
            }
        )
    return templates


def seed_templates(*, env_id: str, business_id: str, actor: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT template_key FROM ai_agent_workflows
               WHERE env_id=%s AND business_id=%s AND is_template=true""",
            (env_id, business_id),
        )
        existing = {item["template_key"] for item in cur.fetchall()}
    for template in template_graphs():
        if template["key"] in existing:
            continue
        try:
            create_workflow(
                env_id=env_id, business_id=business_id, actor=actor,
                name=template["name"], description=template["description"],
                graph=AgentGraph.model_validate(template["graph"]),
                tags=template.get("tags") or ["template", "read-only-mvp"], is_template=True,
                template_key=template["key"],
            )
        except psycopg.errors.UniqueViolation:
            # Concurrent first access may seed the same unique template. The next
            # registry read will show the committed row; never duplicate it.
            continue
