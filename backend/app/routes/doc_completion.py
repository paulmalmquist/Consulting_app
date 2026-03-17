from __future__ import annotations

import os
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.doc_completion import (
    ApplicationIntakeRequest,
    EscalationResolveRequest,
    ManualOutreachRequest,
    StatusUpdateRequest,
)
from app.services import doc_completion as dc
from app.services import env_context

router = APIRouter(prefix="/api/doc-completion/v1", tags=["doc_completion"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="dc",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


# ── Application Intake ────────────────────────────────────────────


@router.post("/applications")
def create_application(req: ApplicationIntakeRequest, request: Request):
    try:
        eid, bid, _ctx = _resolve_context(request, req.env_id, req.business_id)
        return dc.create_loan_file(
            env_id=eid,
            business_id=bid,
            external_application_id=req.external_application_id,
            borrower=req.borrower.model_dump(),
            loan_type=req.loan_type,
            loan_stage=req.loan_stage,
            required_documents=req.required_documents,
            submitted_documents=req.submitted_documents,
            assigned_processor_id=req.assigned_processor_id,
            webhook_url=req.webhook_url,
            max_followups=req.max_followups,
            followup_cadence_hours=req.followup_cadence_hours,
            allowed_send_start=req.allowed_send_start,
            allowed_send_end=req.allowed_send_end,
            send_initial_outreach=req.send_initial_outreach,
            created_by=req.created_by,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="dc.applications.create_failed")


# ── Loan Files ────────────────────────────────────────────────────


@router.get("/files")
def list_files(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    assigned_processor_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.list_loan_files(
            env_id=eid,
            business_id=bid,
            status=status,
            assigned_processor_id=assigned_processor_id,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.files.list_failed")


@router.get("/files/{file_id}")
def get_file(file_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, _bid, _ctx = _resolve_context(request, env_id, business_id)
        result = dc.get_loan_file(env_id=eid, loan_file_id=file_id)
        if not result:
            return JSONResponse(status_code=404, content={"detail": "loan_file_not_found"})
        return result
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.files.get_failed")


@router.patch("/files/{file_id}/status")
def update_file_status(file_id: UUID, req: StatusUpdateRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, _bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.update_loan_file_status(env_id=eid, loan_file_id=file_id, status=req.status, updated_by=req.updated_by)
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.files.status_update_failed")


# ── Outreach ──────────────────────────────────────────────────────


@router.post("/files/{file_id}/outreach")
def send_outreach(file_id: UUID, req: ManualOutreachRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, _bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.send_manual_outreach(env_id=eid, loan_file_id=file_id, channel=req.channel, message=req.message, sent_by=req.sent_by)
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.outreach.send_failed")


# ── Document Actions ──────────────────────────────────────────────


@router.post("/files/{file_id}/docs/{req_id}/accept")
def accept_document(file_id: UUID, req_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, _bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.accept_doc(env_id=eid, loan_file_id=file_id, requirement_id=req_id)
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.docs.accept_failed")


@router.post("/files/{file_id}/docs/{req_id}/reject")
def reject_document(file_id: UUID, req_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), notes: str | None = Query(default=None)):
    try:
        eid, _bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.reject_doc(env_id=eid, loan_file_id=file_id, requirement_id=req_id, notes=notes)
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.docs.reject_failed")


@router.post("/files/{file_id}/docs/{req_id}/waive")
def waive_document(file_id: UUID, req_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, _bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.waive_doc(env_id=eid, loan_file_id=file_id, requirement_id=req_id)
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.docs.waive_failed")


# ── Escalations ───────────────────────────────────────────────────


@router.post("/files/{file_id}/escalations/{esc_id}/resolve")
def resolve_escalation(file_id: UUID, esc_id: UUID, req: EscalationResolveRequest, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, _bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.resolve_escalation(env_id=eid, escalation_event_id=esc_id, resolution_note=req.resolution_note, status=req.status)
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.escalations.resolve_failed")


# ── Audit Log ─────────────────────────────────────────────────────


@router.get("/files/{file_id}/audit")
def get_file_audit(file_id: UUID, request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None), limit: int = Query(default=100, ge=1, le=500)):
    try:
        eid, _bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.get_file_audit_log(env_id=eid, loan_file_id=file_id, limit=limit)
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.audit.get_failed")


# ── Dashboard ─────────────────────────────────────────────────────


@router.get("/dashboard/stats")
def dashboard_stats(request: Request, env_id: str = Query(...), business_id: UUID | None = Query(default=None)):
    try:
        eid, bid, _ctx = _resolve_context(request, env_id, business_id)
        return dc.get_dashboard_stats(env_id=eid, business_id=bid)
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.dashboard.stats_failed")


# ── Cron Jobs (protected by DC_CRON_SECRET) ───────────────────────


def _check_cron_secret(request: Request) -> bool:
    auth = request.headers.get("authorization", "")
    expected = os.environ.get("DC_CRON_SECRET", "")
    if not expected:
        return False
    return auth == f"Bearer {expected}"


@router.post("/cron/process-followups")
def cron_followups(request: Request):
    if not _check_cron_secret(request):
        return JSONResponse(status_code=403, content={"detail": "forbidden"})
    try:
        return dc.process_followups()
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.cron.followups_failed")


@router.post("/cron/process-escalations")
def cron_escalations(request: Request):
    if not _check_cron_secret(request):
        return JSONResponse(status_code=403, content={"detail": "forbidden"})
    try:
        return dc.process_escalations()
    except Exception as exc:
        sc, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=sc, code=code, detail=str(exc), action="dc.cron.escalations_failed")


# ── Borrower Portal (public, token-authenticated) ────────────────


@router.get("/portal/{token}")
def portal_get_file(token: str):
    result = dc.get_portal_file(token=token)
    if not result:
        return JSONResponse(status_code=404, content={"detail": "invalid_or_expired_token"})
    return result


@router.post("/portal/{token}/upload")
async def portal_upload(
    token: str,
    file: UploadFile = File(...),
    requirement_id: str = Form(...),
):
    portal = dc.get_portal_file(token=token)
    if not portal:
        return JSONResponse(status_code=404, content={"detail": "invalid_or_expired_token"})

    file_bytes = await file.read()
    storage_path = f"dc-uploads/{portal['loan_file_id']}/{requirement_id}/{file.filename}"

    return dc.record_upload(
        env_id=UUID(str(portal["env_id"])),
        loan_file_id=UUID(str(portal["loan_file_id"])),
        requirement_id=UUID(requirement_id),
        filename=file.filename or "unknown",
        file_type=file.content_type or "application/octet-stream",
        file_size_bytes=len(file_bytes),
        storage_path=storage_path,
    )
