"""Development ↔ REPE Asset Bridge API endpoints.

Prefix: /api/dev/v1
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.dev_bridge import DevAssumptionUpdate
from app.services import dev_asset_bridge as bridge_svc
from app.services import env_context

router = APIRouter(prefix="/api/dev/v1", tags=["dev-bridge"])


def _resolve(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="dev",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id)


# ── Portfolio ─────────────────────────────────────────────────────

@router.get("/portfolio")
def get_portfolio(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        return bridge_svc.get_dev_portfolio(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.portfolio")


# ── Projects ─────────────────────────────────────────────────────

@router.get("/projects")
def list_projects(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        portfolio = bridge_svc.get_dev_portfolio(env_id=eid, business_id=bid)
        projects = portfolio.get("projects", [])
        return projects[offset:offset + limit]
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.projects.list")


@router.get("/projects/{link_id}")
def get_project(
    request: Request,
    link_id: UUID,
    env_id: str | None = Query(default=None),
):
    try:
        return bridge_svc.get_dev_project_detail(link_id=link_id, env_id=UUID(env_id) if env_id else link_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.projects.get")


# ── Assumptions ──────────────────────────────────────────────────

@router.get("/projects/{link_id}/assumptions")
def get_assumptions(request: Request, link_id: UUID):
    try:
        return bridge_svc.get_dev_assumptions(link_id=link_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.assumptions.get")


@router.put("/projects/{link_id}/assumptions/{assumption_set_id}")
def update_assumptions(
    request: Request,
    link_id: UUID,
    assumption_set_id: UUID,
    body: DevAssumptionUpdate,
):
    try:
        updates = body.model_dump(exclude_none=True)
        # Convert date fields to strings for SQL
        for k in ("construction_start", "construction_end", "lease_up_start", "stabilization_date"):
            if k in updates and updates[k] is not None:
                updates[k] = str(updates[k])
        return bridge_svc.update_dev_assumptions(assumption_set_id=assumption_set_id, updates=updates)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.assumptions.update")


# ── Draw Schedule ────────────────────────────────────────────────

@router.get("/projects/{link_id}/draws")
def get_draws(
    request: Request,
    link_id: UUID,
    scenario_label: str = Query(default="base"),
):
    try:
        return bridge_svc.get_dev_draws(link_id=link_id, scenario_label=scenario_label)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.draws")


# ── Scenario Impact ──────────────────────────────────────────────

@router.get("/projects/{link_id}/scenario-impact")
def get_scenario_impact(request: Request, link_id: UUID):
    try:
        return bridge_svc.get_scenario_comparison(link_id=link_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.scenario_impact")


# ── Fund Impact ──────────────────────────────────────────────────

@router.get("/projects/{link_id}/fund-impact")
def get_fund_impact(request: Request, link_id: UUID):
    try:
        return bridge_svc.get_fund_impact(link_id=link_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.fund_impact")


# ── Seed (dev/demo only) ─────────────────────────────────────────

@router.post("/seed", status_code=201)
def seed_dev_bridge(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, business_id)
        from app.services.dev_bridge_seed import seed_dev_bridge as do_seed
        result = do_seed(env_id=eid, business_id=bid)
        return result
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dev.seed")
