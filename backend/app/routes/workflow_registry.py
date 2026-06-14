"""Workflow Registry API for the ADE governed fabric (plan PR 2).

Catalog/definitions only — no execution engine, no batch. CRUD over
nv_workflow_definitions plus a hot run-state bump. Mounted under /api/ade to keep
naming consistent with the committed ADE surface (skill-registry, connectors, runs).

Paths:
    GET  /api/ade/workflows            list (optional ?domain=)
    POST /api/ade/workflows            create
    GET  /api/ade/workflows/{id}       single
    POST /api/ade/workflows/{id}/run   bump run_count + last_run_at (hot state only)

env_id and business_id are required query/body params for tenant scoping; reads
fail closed with a null_reason rather than erroring open.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.observability.logger import emit_log
from app.services import workflow_registry as svc

router = APIRouter(prefix="/api/ade/workflows", tags=["ade"])


class WorkflowStep(BaseModel):
    step_name: str
    tool_name: str | None = None
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class CreateWorkflowBody(BaseModel):
    env_id: str
    business_id: UUID
    name: str
    domain: str = "data_engineering"
    description: str | None = None
    steps: list[WorkflowStep] = Field(default_factory=list)
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)
    owner: str | None = None
    slug: str | None = None


class RunBody(BaseModel):
    env_id: str
    business_id: UUID


@router.get("")
def list_workflows(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    domain: str | None = Query(None),
):
    """List workflow definitions for an env. Seeds the canonical set on first call."""
    try:
        rows = svc.list_workflows(env_id, business_id, domain=domain)
        return {"workflows": rows, "null_reason": None}
    except ValueError as exc:
        raise HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        # Fail closed: never 500, never return cross-tenant data.
        emit_log(level="error", service="workflow_registry", action="list_failed", message=str(exc), error=exc)
        return {"workflows": [], "null_reason": "workflow_read_unavailable"}


@router.get("/{workflow_id}")
def get_workflow(workflow_id: UUID, env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        wf = svc.get_workflow(env_id, business_id, workflow_id)
        if wf is None:
            raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown workflow: {workflow_id}"})
        return {**wf, "null_reason": None}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="workflow_registry", action="get_failed", message=str(exc), error=exc)
        raise HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": "workflow_read_unavailable"})


@router.post("")
def create_workflow(body: CreateWorkflowBody):
    try:
        wf = svc.create_workflow(
            body.env_id, body.business_id,
            name=body.name, domain=body.domain, description=body.description,
            steps=[s.model_dump() for s in body.steps],
            input_schema=body.input_schema, output_schema=body.output_schema,
            owner=body.owner, slug=body.slug,
        )
        return {**wf, "null_reason": None}
    except ValueError as exc:
        raise HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="workflow_registry", action="create_failed", message=str(exc), error=exc)
        raise HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": "workflow_write_unavailable"})


@router.post("/{workflow_id}/run")
def record_run(workflow_id: UUID, body: RunBody):
    """Bump hot run state (run_count + last_run_at). Not a run-history write."""
    try:
        wf = svc.record_run(body.env_id, body.business_id, workflow_id)
        if wf is None:
            raise HTTPException(404, {"error_code": "NOT_FOUND", "message": f"Unknown workflow: {workflow_id}"})
        return {**wf, "null_reason": None}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="workflow_registry", action="run_failed", message=str(exc), error=exc)
        raise HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": "workflow_write_unavailable"})
