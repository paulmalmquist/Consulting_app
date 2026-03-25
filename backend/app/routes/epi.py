"""API routes for Execution Pattern Intelligence (EPI).

Namespace: /api/pattern-intel/v1/*
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.epi import (
    ArchitectureObservationInput,
    CaseFeedApproveRequest,
    CaseFeedItemOut,
    DashboardKpisOut,
    EpiContextOut,
    EngagementCreateRequest,
    EngagementOut,
    FailureObservationInput,
    GraphQueryOut,
    IndustryDashboardOut,
    MaterializeOut,
    MaterializeRequest,
    MetricObservationInput,
    ObservationOut,
    PatternAnswer,
    PatternOut,
    PatternQueryRequest,
    PilotObservationInput,
    PredictionOut,
    RecommendationOut,
    SourceArtifactIngest,
    SourceArtifactOut,
    VendorObservationInput,
    WorkflowObservationInput,
)
from app.services import env_context
from app.services import epi as svc

router = APIRouter(prefix="/api/pattern-intel/v1", tags=["pattern-intel"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="pattern_intel",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

@router.get("/context", response_model=EpiContextOut)
def get_context(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, ctx = _resolve_context(request, env_id, business_id)
        return EpiContextOut(
            env_id=str(resolved_env_id),
            business_id=resolved_business_id,
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.context.failed",
        )


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=DashboardKpisOut)
def get_dashboard(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        return svc.get_dashboard_kpis(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.dashboard.failed",
        )


# ---------------------------------------------------------------------------
# Engagements
# ---------------------------------------------------------------------------

@router.get("/engagements", response_model=list[EngagementOut])
def list_engagements(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        return svc.list_engagements(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.engagements.list.failed",
        )


@router.post("/engagements", response_model=EngagementOut, status_code=201)
def create_engagement(request: Request, body: EngagementCreateRequest, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ = _resolve_context(request, env_id, business_id)
        payload = body.model_dump()
        return svc.create_engagement(env_id=eid, business_id=bid, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.engagements.create.failed",
        )


# ---------------------------------------------------------------------------
# Source artifact ingest
# ---------------------------------------------------------------------------

@router.post("/artifacts", response_model=SourceArtifactOut, status_code=201)
def ingest_artifact(request: Request, body: SourceArtifactIngest):
    try:
        payload = body.model_dump()
        return svc.ingest_artifact(payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.artifacts.ingest.failed",
        )


# ---------------------------------------------------------------------------
# Materialize
# ---------------------------------------------------------------------------

@router.post("/materialize", response_model=MaterializeOut)
def materialize(request: Request, body: MaterializeRequest):
    try:
        return svc.materialize(
            engagement_id=body.engagement_id,
            source_type=body.source_type,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.materialize.failed",
        )


# ---------------------------------------------------------------------------
# Observations (direct creation)
# ---------------------------------------------------------------------------

@router.post("/observations/vendor", response_model=ObservationOut, status_code=201)
def create_vendor_obs(request: Request, body: VendorObservationInput):
    try:
        return svc.create_vendor_observation(payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.observations.vendor.failed",
        )


@router.post("/observations/workflow", response_model=ObservationOut, status_code=201)
def create_workflow_obs(request: Request, body: WorkflowObservationInput):
    try:
        return svc.create_workflow_observation(payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.observations.workflow.failed",
        )


@router.post("/observations/metric", response_model=ObservationOut, status_code=201)
def create_metric_obs(request: Request, body: MetricObservationInput):
    try:
        return svc.create_metric_observation(payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.observations.metric.failed",
        )


@router.post("/observations/architecture", response_model=ObservationOut, status_code=201)
def create_architecture_obs(request: Request, body: ArchitectureObservationInput):
    try:
        return svc.create_architecture_observation(payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.observations.architecture.failed",
        )


@router.post("/observations/pilot", response_model=ObservationOut, status_code=201)
def create_pilot_obs(request: Request, body: PilotObservationInput):
    try:
        return svc.create_pilot_observation(payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.observations.pilot.failed",
        )


@router.post("/observations/failure", response_model=ObservationOut, status_code=201)
def create_failure_obs(request: Request, body: FailureObservationInput):
    try:
        return svc.create_failure_observation(payload=body.model_dump())
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.observations.failure.failed",
        )


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

@router.get("/patterns", response_model=list[PatternOut])
def list_patterns(
    request: Request,
    pattern_type: str | None = Query(default=None),
    industry: str | None = Query(default=None),
    status: str | None = Query(default=None),
    min_confidence: float | None = Query(default=None),
    min_support: int | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
):
    try:
        return svc.list_patterns(
            pattern_type=pattern_type,
            industry=industry,
            status=status,
            min_confidence=min_confidence,
            min_support=min_support,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="pattern-intel.patterns.list.failed",
        )


@router.get("/patterns/{pattern_id}", response_model=PatternOut)
def get_pattern(request: Request, pattern_id: UUID):
    try:
        return svc.get_pattern(pattern_id=pattern_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.patterns.get.failed",
        )


@router.post("/patterns/query", response_model=PatternAnswer)
def query_patterns(request: Request, body: PatternQueryRequest):
    """Natural-language query routed through structured pattern lookup.

    Phase 1: returns a stub answer acknowledging the question.
    Phase 2+: LLM narrates a structured answer assembled from pattern tables.
    """
    try:
        return PatternAnswer(
            answer_text=f"Pattern query received: '{body.question}'. Full AI-narrated answers will be available in Phase 2.",
            confidence=0,
            matched_patterns=[],
            support_counts={},
            recommended_actions=[],
            citations=[],
            privacy_mode=body.privacy_mode,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.patterns.query.failed",
        )


# ---------------------------------------------------------------------------
# Predictions (Early Warning)
# ---------------------------------------------------------------------------

@router.get("/predictions/early-warning", response_model=list[PredictionOut])
def list_predictions(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    engagement_id: UUID | None = Query(default=None),
):
    try:
        eid, _, _ = _resolve_context(request, env_id, business_id)
        return svc.list_predictions(env_id=eid, engagement_id=engagement_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.predictions.list.failed",
        )


# ---------------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------------

@router.get("/recommendations", response_model=list[RecommendationOut])
def list_recommendations(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    engagement_id: UUID | None = Query(default=None),
):
    try:
        eid, _, _ = _resolve_context(request, env_id, business_id)
        return svc.list_recommendations(env_id=eid, engagement_id=engagement_id)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.recommendations.list.failed",
        )


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

@router.get("/graph", response_model=GraphQueryOut)
def get_graph(
    request: Request,
    node_types: str | None = Query(default=None, description="Comma-separated node types"),
    edge_types: str | None = Query(default=None, description="Comma-separated edge types"),
    limit: int = Query(default=200, le=1000),
):
    try:
        nt = [t.strip() for t in node_types.split(",")] if node_types else None
        et = [t.strip() for t in edge_types.split(",")] if edge_types else None
        return svc.get_graph(node_types=nt, edge_types=et, limit=limit)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.graph.failed",
        )


# ---------------------------------------------------------------------------
# Industry dashboards
# ---------------------------------------------------------------------------

@router.get("/dashboards/{industry}", response_model=IndustryDashboardOut)
def get_industry_dashboard(request: Request, industry: str):
    try:
        return svc.get_industry_dashboard(industry=industry)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.dashboards.industry.failed",
        )


# ---------------------------------------------------------------------------
# Case feed
# ---------------------------------------------------------------------------

@router.get("/case-feed", response_model=list[CaseFeedItemOut])
def list_case_feed(
    request: Request,
    status: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
):
    try:
        return svc.list_case_feed(status=status, limit=limit)
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="pattern-intel.case-feed.list.failed",
        )


@router.post("/case-feed/{item_id}/approve", response_model=CaseFeedItemOut)
def approve_case_feed(request: Request, item_id: UUID, body: CaseFeedApproveRequest):
    try:
        return svc.approve_case_feed_item(item_id=item_id, approved_by=body.approved_by)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="pattern-intel.case-feed.approve.failed",
        )
