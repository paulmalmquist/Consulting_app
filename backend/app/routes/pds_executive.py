from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.pds_executive import (
    PdsExecutiveBriefingGenerateRequest,
    PdsExecutiveConnectorRunRequest,
    PdsExecutiveDecisionRunRequest,
    PdsExecutiveDraftApproveRequest,
    PdsExecutiveFullRunRequest,
    PdsExecutiveMemoryOut,
    PdsExecutiveMessagingGenerateRequest,
    PdsExecutiveOverviewOut,
    PdsExecutiveQueueActionOut,
    PdsExecutiveQueueActionRequest,
    PdsExecutiveQueueItemOut,
)
from app.services import env_context
from app.services.pds_executive import briefing as briefing_svc
from app.services.pds_executive import connectors as connectors_svc
from app.services.pds_executive import memory as memory_svc
from app.services.pds_executive import narrative as narrative_svc
from app.services.pds_executive import orchestrator as orchestrator_svc
from app.services.pds_executive import queue as queue_svc

router = APIRouter(prefix="/api/pds/v1/executive", tags=["pds-executive"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="pds",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


@router.get("/overview", response_model=PdsExecutiveOverviewOut)
def get_overview(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return orchestrator_svc.get_overview(env_id=resolved_env_id, business_id=resolved_business_id)
    except Exception as exc:  # noqa: BLE001
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="pds.executive.overview_failed",
            context={"env_id": env_id},
        )


@router.get("/queue", response_model=list[PdsExecutiveQueueItemOut])
def get_queue(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        rows = queue_svc.list_queue_items(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            status=status,
            limit=limit,
        )
        return [PdsExecutiveQueueItemOut(**row) for row in rows]
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.queue_failed",
            context={"env_id": env_id},
        )


@router.post("/queue/{queue_item_id}/actions", response_model=PdsExecutiveQueueActionOut)
def post_queue_action(
    queue_item_id: UUID,
    body: PdsExecutiveQueueActionRequest,
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        result = queue_svc.record_queue_action(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            queue_item_id=queue_item_id,
            action_type=body.action_type,
            actor=body.actor,
            rationale=body.rationale,
            delegate_to=body.delegate_to,
            action_payload_json=body.action_payload_json,
        )
        return PdsExecutiveQueueActionOut(**result)
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.queue_action_failed",
            context={"queue_item_id": str(queue_item_id), "env_id": env_id},
        )


@router.get("/memory", response_model=PdsExecutiveMemoryOut)
def get_memory(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=250),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        rows = memory_svc.list_memory(env_id=resolved_env_id, business_id=resolved_business_id, limit=limit)
        return PdsExecutiveMemoryOut(items=rows)
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.memory_failed",
            context={"env_id": env_id},
        )


@router.post("/runs/connectors")
def run_connectors(body: PdsExecutiveConnectorRunRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, body.env_id, body.business_id)
        return connectors_svc.run_connectors(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            connector_keys=body.connector_keys or None,
            run_mode=body.run_mode,
            force_refresh=body.force_refresh,
            actor=body.actor,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.run_connectors_failed",
            context={"env_id": body.env_id},
        )


@router.get("/runs/connectors")
def list_connector_runs(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    connector_key: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=250),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return connectors_svc.list_runs(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            connector_key=connector_key,
            limit=limit,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.list_connectors_failed",
            context={"env_id": env_id},
        )


@router.post("/runs/decision-engine")
def run_decision_engine(body: PdsExecutiveDecisionRunRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, body.env_id, body.business_id)
        return orchestrator_svc.run_decision_cycle(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            actor=body.actor,
            include_non_triggered=body.include_non_triggered,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.decision_run_failed",
            context={"env_id": body.env_id},
        )


@router.post("/runs/full")
def run_full(body: PdsExecutiveFullRunRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, body.env_id, body.business_id)
        return orchestrator_svc.run_full_cycle(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            actor=body.actor,
            connector_keys=body.connector_keys or None,
            force_refresh=body.force_refresh,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.full_run_failed",
            context={"env_id": body.env_id},
        )


@router.post("/messaging/generate")
def generate_messaging(body: PdsExecutiveMessagingGenerateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, body.env_id, body.business_id)
        return narrative_svc.generate_drafts(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            draft_types=body.draft_types or None,
            actor=body.actor,
            source_run_id=body.source_run_id,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.messaging_generate_failed",
            context={"env_id": body.env_id},
        )


@router.get("/messaging/drafts")
def list_messaging_drafts(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    draft_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=250),
):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return narrative_svc.list_drafts(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            draft_type=draft_type,
            status=status,
            limit=limit,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.messaging_list_failed",
            context={"env_id": env_id},
        )


@router.post("/messaging/{draft_id}/approve")
def approve_messaging_draft(draft_id: UUID, body: PdsExecutiveDraftApproveRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, body.env_id, body.business_id)
        return narrative_svc.approve_draft(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            draft_id=draft_id,
            actor=body.actor,
            edited_body_text=body.edited_body_text,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.messaging_approve_failed",
            context={"draft_id": str(draft_id)},
        )


@router.post("/briefings/generate")
def generate_briefing(body: PdsExecutiveBriefingGenerateRequest, request: Request):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, body.env_id, body.business_id)
        return briefing_svc.generate_briefing_pack(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            briefing_type=body.briefing_type,
            period=body.period,
            actor=body.actor,
            source_run_id=body.source_run_id,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.briefing_generate_failed",
            context={"env_id": body.env_id},
        )


@router.get("/briefings/{briefing_pack_id}")
def get_briefing(briefing_pack_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        resolved_env_id, resolved_business_id, _ctx = _resolve_context(request, env_id, business_id)
        return briefing_svc.get_briefing_pack(
            env_id=resolved_env_id,
            business_id=resolved_business_id,
            briefing_pack_id=briefing_pack_id,
        )
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.executive.briefing_get_failed",
            context={"briefing_pack_id": str(briefing_pack_id), "env_id": env_id},
        )
