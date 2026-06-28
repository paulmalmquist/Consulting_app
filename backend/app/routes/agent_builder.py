"""FastAPI surface for the governed Agent Builder read-only MVP."""

from __future__ import annotations

import psycopg
from fastapi import APIRouter, HTTPException, Query, Request

from app.auth.platform import require_authenticated_request
from app.config import TELEMETRY_STREAM_BUSINESS_ID, TELEMETRY_STREAM_ENV_ID
from app.schemas.agent_builder import (
    DryRunRequest,
    PublishRequest,
    WorkflowCreateRequest,
    WorkflowDraftRequest,
)
from app.services import agent_builder as service
from app.services import agent_builder_evals as eval_service


router = APIRouter(prefix="/api/agent-builder", tags=["agent-builder"])

# A headerless reviewer/demo session (the scoped telemetry login, which carries no DB
# membership and therefore no x-bm-business-id header) may scope ONLY to this single,
# known-public demo tenant — supplied via query params. Any other (env_id, business_id)
# pair from params is rejected, so params are never a general tenant-injection path.
_DEMO_SCOPE_ALLOWLIST: frozenset[tuple[str, str]] = frozenset(
    {(TELEMETRY_STREAM_ENV_ID, TELEMETRY_STREAM_BUSINESS_ID)}
)


def _scope(request: Request, *, mutate: bool = False) -> tuple[str, str, str]:
    """Resolve (env_id, business_id, actor) with explicit precedence.

    1. A real, header-derived platform-session tenant always wins; params are ignored,
       so a real tenant can never be redirected to (or downgraded into) the demo scope.
    2. A headerless-but-authenticated demo session falls back to query params, accepted
       ONLY for the allowlisted telemetry-demo pair — otherwise it fails closed (403),
       exactly as before.

    The mutate gate (operator/admin) is enforced for real tenants. For the allowlisted
    demo scope only, Agent Builder persistence is permitted (workflow drafts, validation
    records, dry-run/run-step rows, run events, receipts — all in the ai_agent_* audit/
    config tables, scoped to env_id='telemetry-demo'). This grant does NOT enable MCP
    write tools (still disabled in describe_tools and rejected by validate_graph), any
    production data write, deploy/PR action, or any non-demo-tenant mutation.
    """
    auth = require_authenticated_request(request)

    if auth.business_id:
        # Real, header-derived tenant — authoritative. Params are ignored.
        if not auth.env_id:
            raise HTTPException(status_code=403, detail="Environment context required")
        if mutate and "write" not in auth.permissions and "admin" not in auth.roles:
            raise HTTPException(status_code=403, detail="Operator or admin role required")
        return auth.env_id, str(auth.business_id), auth.actor

    # Headerless demo/reviewer session — fall back to allowlisted param scope.
    env_id = request.query_params.get("env_id") or ""
    business_id = request.query_params.get("business_id") or ""
    if (env_id, business_id) not in _DEMO_SCOPE_ALLOWLIST:
        raise HTTPException(
            status_code=403,
            detail="Tenant context required: this request carries no business_id",
        )
    return env_id, business_id, auth.actor or "telemetry-demo"


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, service.VersionConflictError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, (service.WorkflowNotFoundError, LookupError)):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, (ValueError, TypeError)):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn)):
        return HTTPException(
            status_code=503,
            detail=(
                "Agent Builder schema not migrated "
                "(apply 10035_agent_builder_mvp.sql and 10036_agent_builder_evals.sql)"
            ),
        )
    return HTTPException(status_code=500, detail=str(exc))


@router.get("/palette")
def palette(request: Request):
    _scope(request)
    return {"schema_version": "agent-graph/v1", "nodes": service.NODE_CATALOG}


@router.get("/mcp-tools")
def mcp_tools(request: Request):
    _scope(request)
    return {"tools": service.describe_tools()}


@router.get("/workflows")
def workflows(request: Request):
    env_id, business_id, _ = _scope(request)
    try:
        return {"workflows": service.list_workflows(env_id=env_id, business_id=business_id)}
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/workflows")
def create_workflow(payload: WorkflowCreateRequest, request: Request):
    env_id, business_id, actor = _scope(request, mutate=True)
    try:
        return service.create_workflow(
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            name=payload.name,
            description=payload.description,
            graph=payload.graph,
            tags=payload.tags,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: str, request: Request):
    env_id, business_id, _ = _scope(request)
    try:
        return service.get_workflow(
            env_id=env_id, business_id=business_id, workflow_id=workflow_id
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.patch("/workflows/{workflow_id}/draft")
def save_draft(workflow_id: str, payload: WorkflowDraftRequest, request: Request):
    env_id, business_id, actor = _scope(request, mutate=True)
    try:
        return service.save_draft(
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            workflow_id=workflow_id,
            base_version_number=payload.base_version_number,
            graph=payload.graph,
            name=payload.name,
            description=payload.description,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/workflows/{workflow_id}/validate")
def validate_workflow(workflow_id: str, request: Request):
    env_id, business_id, _ = _scope(request, mutate=True)
    try:
        return service.validate_saved_workflow(
            env_id=env_id, business_id=business_id, workflow_id=workflow_id
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/workflows/{workflow_id}/dry-run")
def dry_run(workflow_id: str, payload: DryRunRequest, request: Request):
    env_id, business_id, actor = _scope(request, mutate=True)
    try:
        return service.dry_run(
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            workflow_id=workflow_id,
            run_input=payload.input,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/workflows/{workflow_id}/evals/run")
def run_evals(workflow_id: str, request: Request):
    env_id, business_id, actor = _scope(request, mutate=True)
    try:
        return eval_service.run_evals(
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            workflow_id=workflow_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workflows/{workflow_id}/evals")
def workflow_evals(workflow_id: str, request: Request):
    env_id, business_id, _ = _scope(request)
    try:
        return eval_service.get_workflow_evals(
            env_id=env_id,
            business_id=business_id,
            workflow_id=workflow_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/workflows/{workflow_id}/publish")
def publish_workflow(workflow_id: str, payload: PublishRequest, request: Request):
    env_id, business_id, actor = _scope(request, mutate=True)
    try:
        return eval_service.publish_workflow(
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            workflow_id=workflow_id,
            desired_status=payload.status,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/runs")
def runs(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    env_id, business_id, _ = _scope(request)
    try:
        return {"runs": service.list_runs(env_id=env_id, business_id=business_id, limit=limit)}
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/runs/{run_id}")
def get_run(run_id: str, request: Request):
    env_id, business_id, _ = _scope(request)
    try:
        return service.get_run(env_id=env_id, business_id=business_id, run_id=run_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/runs/{run_id}/events")
def get_events(run_id: str, request: Request):
    env_id, business_id, _ = _scope(request)
    try:
        return {"events": service.get_run_events(env_id=env_id, business_id=business_id, run_id=run_id)}
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/eval-runs/{eval_run_id}")
def get_eval_run(eval_run_id: str, request: Request):
    env_id, business_id, _ = _scope(request)
    try:
        return eval_service.get_eval_run(
            env_id=env_id,
            business_id=business_id,
            eval_run_id=eval_run_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/runs/{run_id}/promote-failure")
def promote_failure(run_id: str, request: Request):
    env_id, business_id, actor = _scope(request, mutate=True)
    try:
        return eval_service.promote_failure(
            env_id=env_id,
            business_id=business_id,
            actor=actor,
            run_id=run_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)
