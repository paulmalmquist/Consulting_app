"""Executions module MCP tools."""

from __future__ import annotations

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.execution_tools import (
    RunExecutionInput,
    ListExecutionsInput,
    GetExecutionInput,
)
from app.services import executions as exec_svc


def _run_execution(ctx: McpContext, inp: RunExecutionInput) -> dict:
    result = exec_svc.run_execution(
        business_id=inp.business_id,
        department_id=inp.department_id,
        capability_id=inp.capability_id,
        inputs_json=inp.inputs_json,
        dry_run=inp.dry_run,
    )
    return {
        "run_id": str(result["run_id"]) if result["run_id"] else None,
        "status": result["status"],
        "outputs_json": result["outputs_json"],
    }


def _list_executions(ctx: McpContext, inp: ListExecutionsInput) -> dict:
    rows = exec_svc.list_executions(
        business_id=inp.business_id,
        department_id=inp.department_id,
        capability_id=inp.capability_id,
        limit=inp.limit,
    )
    return {
        "executions": [
            {
                "execution_id": str(r["execution_id"]),
                "status": r["status"],
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    }


def _get_execution(ctx: McpContext, inp: GetExecutionInput) -> dict:
    row = exec_svc.get_execution(inp.execution_id)
    if not row:
        raise LookupError("Execution not found")
    return {
        "execution_id": str(row["execution_id"]),
        "business_id": str(row["business_id"]),
        "department_id": str(row["department_id"]) if row.get("department_id") else None,
        "capability_id": str(row["capability_id"]) if row.get("capability_id") else None,
        "status": row["status"],
        "inputs_json": row["inputs_json"],
        "outputs_json": row["outputs_json"],
        "created_at": str(row["created_at"]),
    }


def register_execution_tools():
    # executions.run is write when dry_run=false, but we register as write
    # because it CAN write; the audit layer checks confirm for actual writes
    registry.register(ToolDef(
        name="executions.run",
        description="Run (or dry-run validate) an execution. Default dry_run=true.",
        module="executions",
        permission="write",
        input_model=RunExecutionInput,
        handler=_run_execution,
    ))
    registry.register(ToolDef(
        name="executions.list",
        description="List executions for a business",
        module="executions",
        permission="read",
        input_model=ListExecutionsInput,
        handler=_list_executions,
    ))
    registry.register(ToolDef(
        name="executions.get",
        description="Get execution details by ID",
        module="executions",
        permission="read",
        input_model=GetExecutionInput,
        handler=_get_execution,
    ))
