"""AI provider dispatch routes — governed inspection + execution.

  GET  /api/ai/dispatch/providers          list providers + availability (safe)
  GET  /api/ai/dispatch/providers/{name}   one provider's capability/availability
  POST /api/ai/dispatch/route              dry-run routing decision (no model call)
  GET  /api/ai/dispatch/runs               recent dispatch receipts (authed, tenant-scoped)
  POST /api/ai/dispatch/run                execute a dispatch (authed, flag-gated, cost-bearing)

This router is standalone — it does not import or touch ``ai_gateway``.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth.platform import require_authenticated_request
from app.services.ai_dispatch.models import AIRequest
from app.services.ai_dispatch.receipts import list_dispatch_runs
from app.services.ai_dispatch.registry import provider_registry
from app.services.ai_dispatch.runtime import gemma_enabled, set_gemma_enabled
from app.services.ai_dispatch.supervisor import route_only, run_dispatch

router = APIRouter(prefix="/api/ai/dispatch", tags=["ai-dispatch"])


def _config_payload() -> dict:
    from app import config

    return {
        "gemma_enabled": gemma_enabled(),
        "fallback_provider": getattr(config, "AI_DISPATCH_FALLBACK_PROVIDER", "openai"),
        "fallback_model": getattr(config, "AI_DISPATCH_FALLBACK_MODEL", "gpt-5-mini"),
        "execution_enabled": bool(getattr(config, "AI_DISPATCH_ENABLED", False)),
    }


class ConfigUpdate(BaseModel):
    gemma_enabled: bool


@router.get("/config")
def get_config():
    """Current runtime dispatch config (the Gemma toggle + fallback). Safe to read."""
    return _config_payload()


@router.post("/config")
def set_config(payload: ConfigUpdate, request: Request):
    """Flip the runtime Gemma toggle. Auth required. When off, Gemma-home modes fall back to the small model."""
    require_authenticated_request(request)
    set_gemma_enabled(payload.gemma_enabled)
    return _config_payload()


@router.get("/providers")
def list_providers():
    """List every registered provider with its modes, ceilings, and availability."""
    return {"providers": provider_registry.describe_all()}


@router.get("/providers/{name}")
def get_provider(name: str):
    prov = provider_registry.get(name)
    if prov is None:
        raise HTTPException(status_code=404, detail=f"unknown provider '{name}'")
    for described in provider_registry.describe_all():
        if described["name"] == prov.name.value:
            return described
    raise HTTPException(status_code=404, detail=f"unknown provider '{name}'")


@router.post("/route")
def dry_run_route(payload: AIRequest):
    """Dry-run the router: returns the routing decision without calling any provider."""
    return route_only(payload).model_dump(mode="json")


@router.get("/evals")
def routing_evals():
    """Run the deterministic routing-policy eval suite. Read-only: no model calls, no receipts."""
    from app.services.ai_dispatch.evals import run_routing_evals

    return run_routing_evals()


@router.get("/runs")
def list_runs(
    request: Request,
    env_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """Recent dispatch receipts, scoped to the caller's tenant. Auth required."""
    auth = require_authenticated_request(request)
    if not auth.business_id:
        return {"runs": [], "count": 0}
    rows = list_dispatch_runs(
        auth.business_id,
        env_id=env_id or auth.env_id,
        limit=min(limit, 200),
        offset=offset,
    )
    return {"runs": rows, "count": len(rows)}


@router.post("/run")
def execute_run(payload: AIRequest, request: Request):
    """Execute a governed dispatch. Auth required; gated behind AI_DISPATCH_ENABLED."""
    auth = require_authenticated_request(request)

    from app.config import AI_DISPATCH_ENABLED

    if not AI_DISPATCH_ENABLED:
        raise HTTPException(
            status_code=403,
            detail="AI dispatch execution is disabled (set AI_DISPATCH_ENABLED=true)",
        )

    # Scope to the caller's tenant — never trust a client-supplied tenant id.
    updates: dict = {}
    if auth.business_id:
        updates["business_id"] = auth.business_id
    if auth.env_id and not payload.env_id:
        updates["env_id"] = auth.env_id
    scoped = payload.model_copy(update=updates) if updates else payload

    return run_dispatch(scoped).model_dump(mode="json")
