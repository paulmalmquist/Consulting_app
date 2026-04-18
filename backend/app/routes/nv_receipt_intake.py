"""Novendor Receipt Intake — ingest → parse → review endpoints.

Mount: /api/nv/accounting
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.services import (
    env_context,
    receipt_intake,
    receipt_orchestrator,
    receipt_reports,
    receipt_review_queue,
    subscription_ledger,
)


router = APIRouter(prefix="/api/nv/accounting", tags=["nv-accounting"])


def _resolve(request: Request, env_id: str, business_id: UUID | None) -> tuple[str, str]:
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="nv_accounting",
    )
    return ctx.env_id, ctx.business_id


# ── Intake ───────────────────────────────────────────────────────────────────

@router.post("/receipts/upload")
async def upload_receipt(
    request: Request,
    env_id: str = Form(...),
    business_id: UUID | None = Form(default=None),
    source_type: str = Form("upload"),
    source_ref: str | None = Form(default=None),
    uploaded_by: str | None = Form(default=None),
    file: UploadFile = File(...),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        file_bytes = await file.read()
        result = receipt_intake.ingest_file(
            env_id=resolved_env,
            business_id=resolved_biz,
            file_bytes=file_bytes,
            filename=file.filename,
            mime_type=file.content_type or "application/octet-stream",
            source_type=source_type,
            source_ref=source_ref,
            uploaded_by=uploaded_by,
        )
        return result
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.receipt.upload.failed",
        )


@router.post("/receipts/bulk-upload")
async def bulk_upload_receipts(
    request: Request,
    env_id: str = Form(...),
    business_id: UUID | None = Form(default=None),
    files: list[UploadFile] = File(...),
    source_type: str = Form("bulk_upload"),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        results = []
        for upload in files:
            file_bytes = await upload.read()
            r = receipt_intake.ingest_file(
                env_id=resolved_env, business_id=resolved_biz,
                file_bytes=file_bytes, filename=upload.filename,
                mime_type=upload.content_type or "application/octet-stream",
                source_type=source_type,
            )
            results.append(r)
        return {"count": len(results), "results": results}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="nv-accounting.receipt.bulk_upload.failed",
        )


@router.get("/receipts/intake")
def list_intake(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(100, ge=1, le=500),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        rows = receipt_intake.list_intake_queue(
            env_id=resolved_env, business_id=resolved_biz,
            status=status, limit=limit,
        )
        return {"count": len(rows), "rows": rows}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.receipt.list.failed",
        )


@router.post("/receipts/{intake_id}/process")
def process_receipt(
    request: Request,
    intake_id: UUID,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """Canonical chain: classify → ledger+occurrence → match → review scoring."""
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        result = receipt_orchestrator.process_intake(
            env_id=resolved_env, business_id=resolved_biz, intake_id=str(intake_id),
        )
        return result
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.receipt.process.failed",
        )


@router.post("/receipts/{intake_id}/attach-subscription")
def attach_to_subscription(
    request: Request,
    intake_id: UUID,
    subscription_id: UUID = Query(...),
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        occ_id = subscription_ledger.attach_intake_to_subscription(
            env_id=resolved_env, business_id=resolved_biz,
            subscription_id=str(subscription_id), intake_id=str(intake_id),
        )
        return {"occurrence_id": occ_id, "subscription_id": str(subscription_id)}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.subscription.attach.failed",
        )


@router.post("/subscriptions/{subscription_id}/mark-non-business")
def mark_non_business(
    request: Request,
    subscription_id: UUID,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        ok = subscription_ledger.mark_subscription_non_business(
            env_id=resolved_env, business_id=resolved_biz,
            subscription_id=str(subscription_id),
        )
        return {"updated": ok}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.subscription.mark_non_business.failed",
        )


@router.post("/occurrences/{occurrence_id}/suppress")
def suppress_occurrence(
    request: Request,
    occurrence_id: UUID,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        ok = subscription_ledger.suppress_duplicate_occurrence(
            env_id=resolved_env, business_id=resolved_biz,
            occurrence_id=str(occurrence_id),
        )
        return {"suppressed": ok}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.occurrence.suppress.failed",
        )


@router.post("/occurrences/{occurrence_id}/review-state")
def set_occurrence_state(
    request: Request,
    occurrence_id: UUID,
    review_state: str = Query(..., description="confirmed|rejected|non_business|mixed|manual"),
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    notes: str | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        ok = subscription_ledger.set_occurrence_review_state(
            env_id=resolved_env, business_id=resolved_biz,
            occurrence_id=str(occurrence_id),
            review_state=review_state, notes=notes,
        )
        return {"updated": ok, "review_state": review_state}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.occurrence.state.failed",
        )


@router.get("/subscriptions/{subscription_id}/occurrences")
def list_sub_occurrences(
    request: Request,
    subscription_id: UUID,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(24, ge=1, le=200),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        rows = subscription_ledger.list_occurrences(
            env_id=resolved_env, business_id=resolved_biz,
            subscription_id=str(subscription_id), limit=limit,
        )
        return {"count": len(rows), "rows": rows}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.occurrence.list.failed",
        )


@router.get("/receipts/{intake_id}")
def get_intake(
    request: Request,
    intake_id: UUID,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        detail = receipt_intake.get_intake_detail(
            env_id=resolved_env, business_id=resolved_biz, intake_id=str(intake_id),
        )
        if not detail:
            raise HTTPException(status_code=404, detail="intake_not_found")
        return detail
    except HTTPException:
        raise
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.receipt.get.failed",
        )


# ── Review queue ─────────────────────────────────────────────────────────────

@router.get("/review-queue")
def list_review_queue(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    status: str = Query("open"),
    limit: int = Query(100, ge=1, le=500),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        items = receipt_review_queue.list_review_items(
            env_id=resolved_env, business_id=resolved_biz,
            status=status, limit=limit,
        )
        return {"count": len(items), "items": items}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.review.list.failed",
        )


@router.post("/review-queue/{item_id}/resolve")
def resolve_review(
    request: Request,
    item_id: UUID,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    resolved_by: str | None = Query(default=None),
    notes: str | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        ok = receipt_review_queue.resolve_review_item(
            env_id=resolved_env, business_id=resolved_biz,
            item_id=str(item_id), resolved_by=resolved_by, notes=notes,
        )
        return {"resolved": ok}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.review.resolve.failed",
        )


# ── Subscriptions ────────────────────────────────────────────────────────────

@router.get("/subscriptions/ledger")
def get_subscriptions(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    active_only: bool = Query(True),
    spend_type: str | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        rows = subscription_ledger.list_ledger(
            env_id=resolved_env, business_id=resolved_biz,
            active_only=active_only, spend_type=spend_type,
        )
        return {"count": len(rows), "rows": rows}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.subscriptions.list.failed",
        )


@router.post("/subscriptions/detect-recurring")
def detect_recurring(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        result = subscription_ledger.detect_recurring(
            env_id=resolved_env, business_id=resolved_biz,
        )
        return result
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.subscriptions.detect.failed",
        )


# ── Reports ──────────────────────────────────────────────────────────────────

@router.get("/reports/software-spend")
def software_spend(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        return receipt_reports.software_spend_report(
            env_id=resolved_env, business_id=resolved_biz,
            period_start=period_start, period_end=period_end,
        )
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.report.software.failed",
        )


@router.get("/reports/apple-billed-spend")
def apple_billed_spend(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        return receipt_reports.apple_billed_spend_report(
            env_id=resolved_env, business_id=resolved_biz,
            period_start=period_start, period_end=period_end,
        )
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.report.apple.failed",
        )


@router.get("/reports/ai-software-summary")
def ai_software_summary(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    period_start: date | None = Query(default=None),
    period_end: date | None = Query(default=None),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        return receipt_reports.ai_software_summary(
            env_id=resolved_env, business_id=resolved_biz,
            period_start=period_start, period_end=period_end,
        )
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.report.summary.failed",
        )


@router.get("/reports/tooling-mom")
def tooling_mom(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
    months: int = Query(6, ge=1, le=24),
):
    try:
        resolved_env, resolved_biz = _resolve(request, env_id, business_id)
        rows = receipt_reports.tooling_spend_mom(
            env_id=resolved_env, business_id=resolved_biz, months=months,
        )
        return {"rows": rows}
    except Exception as exc:
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status_code, code=code,
            detail=str(exc), action="nv-accounting.report.tooling.failed",
        )
