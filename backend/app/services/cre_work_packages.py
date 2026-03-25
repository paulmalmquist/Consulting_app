"""CRE Work Package Execution Engine.

Reads declarative tool_chain definitions from cre_work_package and executes
MCP tools sequentially via the existing ToolRegistry, passing outputs between
steps using JSONPath-like input_map resolution.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any
from uuid import UUID

from app.db import get_cursor

log = logging.getLogger(__name__)


# ─── Input Map Resolver ───────────────────────────────────────────────────────


def _resolve_value(expr: str, inputs: dict, steps: dict) -> Any:
    """Resolve a JSONPath-like expression against inputs and step outputs.

    Supports:
      $inputs.key           → inputs["key"]
      $steps.step_key.path  → steps["step_key"]["path"]
      $steps.step_key.arr[0].field → steps["step_key"]["arr"][0]["field"]
      literal values        → returned as-is
    """
    if not isinstance(expr, str):
        return expr

    if not expr.startswith("$"):
        return expr

    if expr.startswith("$inputs."):
        path = expr[len("$inputs."):]
        return _walk_path(inputs, path)

    if expr.startswith("$steps."):
        path = expr[len("$steps."):]
        parts = path.split(".", 1)
        step_key = parts[0]
        step_data = steps.get(step_key)
        if step_data is None:
            return None
        if len(parts) == 1:
            return step_data
        return _walk_path(step_data, parts[1])

    return expr


def _walk_path(obj: Any, path: str) -> Any:
    """Walk a dot-separated path with optional array indexing.

    Examples: "name", "features[0].properties.id", "beneficial_owners[0].entity_id"
    """
    if obj is None:
        return None

    # Split on dots, but handle array indices
    segments = re.split(r"\.", path)
    current = obj

    for segment in segments:
        if current is None:
            return None

        # Check for array index: segment[N]
        array_match = re.match(r"^(\w+)\[(\d+)\]$", segment)
        if array_match:
            key = array_match.group(1)
            idx = int(array_match.group(2))
            if isinstance(current, dict):
                current = current.get(key)
            if isinstance(current, list) and idx < len(current):
                current = current[idx]
            else:
                return None
        elif isinstance(current, dict):
            current = current.get(segment)
        else:
            return None

    return current


def _resolve_input_map(input_map: dict, inputs: dict, steps: dict) -> dict:
    """Resolve all values in an input_map dict."""
    resolved = {}
    for key, expr in input_map.items():
        resolved[key] = _resolve_value(expr, inputs, steps)
    return resolved


# ─── Package Execution ────────────────────────────────────────────────────────


def list_packages(*, category: str | None = None) -> list[dict]:
    """List available work packages."""
    with get_cursor() as cur:
        if category:
            cur.execute(
                "SELECT * FROM cre_work_package WHERE is_active = true AND category = %s ORDER BY display_name",
                (category,),
            )
        else:
            cur.execute(
                "SELECT * FROM cre_work_package WHERE is_active = true ORDER BY display_name",
            )
        return cur.fetchall()


def get_run(*, run_id: UUID) -> dict:
    """Get a work package run by ID."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM cre_work_package_run WHERE run_id = %s", (str(run_id),))
        row = cur.fetchone()
    if not row:
        raise LookupError(f"Work package run {run_id} not found")
    return row


def execute_work_package(
    *,
    package_key: str,
    env_id: UUID,
    business_id: UUID,
    inputs: dict,
    created_by: str,
) -> dict:
    """Execute a work package: resolve tool chain and run each step.

    Returns the completed run record.
    """
    # Load package definition
    with get_cursor() as cur:
        cur.execute("SELECT * FROM cre_work_package WHERE package_key = %s", (package_key,))
        package = cur.fetchone()

    if not package:
        raise LookupError(f"Work package '{package_key}' not found")
    if not package["is_active"]:
        raise ValueError(f"Work package '{package_key}' is not active")

    tool_chain = package["tool_chain"]
    if isinstance(tool_chain, str):
        tool_chain = json.loads(tool_chain)

    # Create run record
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cre_work_package_run
                (env_id, business_id, package_key, status, inputs, created_by, started_at)
            VALUES (%s, %s, %s, 'running', %s::jsonb, %s, now())
            RETURNING *
            """,
            (str(env_id), str(business_id), package_key, json.dumps(inputs), created_by),
        )
        run = cur.fetchone()

    run_id = str(run["run_id"])
    start_time = time.monotonic()

    # Augment inputs with env/business context
    enriched_inputs = {**inputs, "env_id": str(env_id), "business_id": str(business_id)}

    steps: dict[str, Any] = {}
    step_results: list[dict] = []
    error_summary = None
    final_status = "success"

    for step_def in tool_chain:
        step_key = step_def["step_key"]
        tool_name = step_def["tool_name"]
        input_map = step_def.get("input_map", {})
        output_key = step_def.get("output_key", step_key)
        on_error = step_def.get("on_error", "fail")

        # Resolve inputs from prior steps
        resolved_inputs = _resolve_input_map(input_map, enriched_inputs, steps)

        step_start = time.monotonic()
        step_result: dict[str, Any] = {
            "step_key": step_key,
            "tool_name": tool_name,
            "inputs": _safe_serialize(resolved_inputs),
            "status": "running",
        }

        try:
            output = _execute_tool(tool_name, resolved_inputs, env_id, business_id)
            step_result["status"] = "success"
            step_result["output"] = _safe_serialize(output)
            steps[output_key] = output
        except Exception as exc:
            step_result["status"] = "failed"
            step_result["error"] = str(exc)
            log.warning("Step %s failed: %s", step_key, exc)

            if on_error == "fail":
                error_summary = f"Step '{step_key}' failed: {exc}"
                final_status = "failed"
                step_result["duration_ms"] = int((time.monotonic() - step_start) * 1000)
                step_results.append(step_result)
                break

        step_result["duration_ms"] = int((time.monotonic() - step_start) * 1000)
        step_results.append(step_result)

    total_duration_ms = int((time.monotonic() - start_time) * 1000)

    # Collect final outputs from all successful steps
    outputs = {k: _safe_serialize(v) for k, v in steps.items()}

    # Update run record
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cre_work_package_run
            SET status = %s,
                outputs = %s::jsonb,
                step_results = %s::jsonb,
                total_duration_ms = %s,
                error_summary = %s,
                finished_at = now()
            WHERE run_id = %s
            RETURNING *
            """,
            (
                final_status,
                json.dumps(outputs),
                json.dumps(step_results),
                total_duration_ms,
                error_summary,
                run_id,
            ),
        )
        final_run = cur.fetchone()

    log.info(
        "Work package '%s' run %s: %s in %dms (%d/%d steps succeeded)",
        package_key, run_id, final_status, total_duration_ms,
        sum(1 for s in step_results if s["status"] == "success"), len(step_results),
    )

    return final_run


# ─── Tool Execution Bridge ────────────────────────────────────────────────────


def _execute_tool(tool_name: str, inputs: dict, env_id: UUID, business_id: UUID) -> Any:
    """Execute a tool by name, bridging to the MCP registry or internal services.

    For known CRE intelligence tools, dispatches directly to service functions.
    For MCP-registered tools, uses the tool registry.
    """
    # Direct dispatch for CRE intelligence tools
    dispatch = _get_dispatch_map()
    handler = dispatch.get(tool_name)

    if handler:
        return handler(inputs)

    # Fall back to MCP tool registry
    try:
        from app.mcp.registry import ToolRegistry
        registry = ToolRegistry.instance()
        tool_def = registry.get(tool_name)
        if tool_def:
            return tool_def.handler(inputs)
    except Exception as exc:
        log.warning("MCP registry lookup failed for %s: %s", tool_name, exc)

    raise LookupError(f"Tool '{tool_name}' not found in dispatch map or MCP registry")


def _get_dispatch_map() -> dict:
    """Lazy-loaded dispatch map for CRE intelligence tool names."""
    from app.services import re_intelligence, re_owner_unmasking

    return {
        "cre_owner_unmasking_report": lambda inputs: re_owner_unmasking.get_unmasking_report(
            property_id=inputs["property_id"], env_id=inputs["env_id"],
            max_depth=inputs.get("max_depth", 5),
        ),
        "cre_owner_graph": lambda inputs: re_owner_unmasking.get_owner_graph(
            entity_id=inputs["entity_id"], env_id=inputs["env_id"],
            max_depth=inputs.get("max_depth", 5),
        ),
        "cre_property_features": lambda inputs: re_intelligence.get_property_features(
            property_id=inputs["property_id"],
        ),
        "cre_property_externalities": lambda inputs: re_intelligence.get_property_externalities(
            property_id=inputs["property_id"],
        ),
        "cre_list_geographies": lambda inputs: re_intelligence.list_geographies(
            bbox=inputs.get("bbox"), layer=inputs.get("layer"),
            metric_key=inputs.get("metric_key"), period=inputs.get("period"),
        ),
        "cre_materialize_forecasts": lambda inputs: re_intelligence.materialize_forecasts(
            property_id=inputs.get("property_id"),
            geography_id=inputs.get("geography_id"),
            feature_version=inputs.get("feature_version"),
        ),
    }


def _safe_serialize(obj: Any) -> Any:
    """Ensure an object is JSON-serializable by converting problematic types."""
    if obj is None:
        return None
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)
