"""Capital Projects Draw Management API — draw lifecycle, invoices, inspections.

Extends the capital-projects API namespace with draw request CRUD, status
transitions, invoice upload + OCR + matching, inspection recording,
portfolio reporting, and audit log queries.
"""
from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import Response

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.draw import (
    DrawApproval,
    DrawLineItemBatchUpdate,
    DrawRejection,
    DrawRequestCreate,
    InspectionCreate,
    InvoiceAssignToDraw,
    InvoiceMatchOverride,
)
from app.services import draw_audit
from app.services import draw_calculator as calc_svc
from app.services import draw_portfolio_rollup as rollup_svc
from app.services import draw_variance as variance_svc
from app.services import env_context
from app.services import invoice_matcher as matcher_svc
from app.services import ocr_parser

router = APIRouter(prefix="/api/capital-projects/v1", tags=["capital-projects-draws"])


# ── Context resolution (same pattern as capital_projects.py) ──────

def _resolve(request: Request, env_id: str | None, business_id: str | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=business_id,
        allow_create=True,
        create_slug_prefix="cp",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id)


def _actor(request: Request) -> str:
    return request.headers.get("x-bm-actor", "anonymous")


# ── Draw Requests ─────────────────────────────────────────────────

@router.post("/projects/{project_id}/draws", status_code=201)
def create_draw(
    request: Request,
    project_id: UUID,
    body: DrawRequestCreate,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        payload = body.model_dump()
        payload["created_by"] = payload.get("created_by") or _actor(request)
        return calc_svc.create_draw_request(project_id=project_id, env_id=eid, business_id=bid, payload=payload)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.create")


@router.get("/projects/{project_id}/draws")
def list_draws(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return calc_svc.list_draw_requests(project_id=project_id, env_id=eid, business_id=bid, limit=limit, offset=offset)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.list")


@router.get("/projects/{project_id}/draws/{draw_id}")
def get_draw(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return calc_svc.get_draw_request(draw_request_id=draw_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.get")


@router.put("/projects/{project_id}/draws/{draw_id}/line-items")
def update_line_items(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    body: DrawLineItemBatchUpdate,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        items = [i.model_dump() for i in body.items]
        actor = body.actor or _actor(request)
        return calc_svc.update_line_items(draw_request_id=draw_id, env_id=eid, business_id=bid, items=items, actor=actor)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.update_lines")


# ── Draw Lifecycle Transitions ────────────────────────────────────

@router.post("/projects/{project_id}/draws/{draw_id}/submit")
def submit_draw(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """Submit draw for review: draft -> pending_review. Runs variance analysis."""
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        actor = _actor(request)

        # Run variance check before submission
        variance_result = variance_svc.analyze_draw_variances(draw_request_id=draw_id, env_id=eid, business_id=bid)

        return calc_svc.transition_draw_status(
            draw_request_id=draw_id, env_id=eid, business_id=bid,
            new_status="pending_review", actor=actor,
            variance_result=variance_result,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.submit")


@router.post("/projects/{project_id}/draws/{draw_id}/approve")
def approve_draw(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    body: DrawApproval,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """HITL REQUIRED: Approve draw — pending_review -> approved."""
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return calc_svc.transition_draw_status(
            draw_request_id=draw_id, env_id=eid, business_id=bid,
            new_status="approved", actor=body.actor, hitl_approval=True,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.approve")


@router.post("/projects/{project_id}/draws/{draw_id}/reject")
def reject_draw(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    body: DrawRejection,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return calc_svc.transition_draw_status(
            draw_request_id=draw_id, env_id=eid, business_id=bid,
            new_status="rejected", actor=body.actor,
            rejection_reason=body.rejection_reason,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.reject")


@router.post("/projects/{project_id}/draws/{draw_id}/request-revision")
def request_revision(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return calc_svc.transition_draw_status(
            draw_request_id=draw_id, env_id=eid, business_id=bid,
            new_status="revision_requested", actor=_actor(request),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.request_revision")


@router.post("/projects/{project_id}/draws/{draw_id}/submit-to-lender")
def submit_to_lender(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    body: DrawApproval,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """HITL REQUIRED: Submit to lender — approved -> submitted_to_lender."""
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return calc_svc.transition_draw_status(
            draw_request_id=draw_id, env_id=eid, business_id=bid,
            new_status="submitted_to_lender", actor=body.actor, hitl_approval=True,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.submit_to_lender")


@router.post("/projects/{project_id}/draws/{draw_id}/mark-funded")
def mark_funded(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return calc_svc.transition_draw_status(
            draw_request_id=draw_id, env_id=eid, business_id=bid,
            new_status="funded", actor=_actor(request),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.mark_funded")


@router.post("/projects/{project_id}/draws/{draw_id}/generate-g702")
def generate_g702(
    request: Request,
    project_id: UUID,
    draw_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """Generate AIA G702/G703 PDF for an approved+ draw."""
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        from app.services import aia_generator
        pdf_bytes = aia_generator.generate_g702_g703(draw_request_id=draw_id, env_id=eid, business_id=bid)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=G702_G703_Draw_{draw_id}.pdf"},
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.generate_g702")


# ── Invoices ──────────────────────────────────────────────────────

@router.post("/projects/{project_id}/invoices/upload", status_code=201)
async def upload_invoice(
    request: Request,
    project_id: UUID,
    file: UploadFile = File(...),
    env_id: str | None = Form(default=None),
    business_id: str | None = Form(default=None),
    draw_request_id: str | None = Form(default=None),
):
    """Upload invoice PDF, run OCR, and auto-match to draw line items."""
    try:
        eid, bid = _resolve(request, env_id, business_id)
        actor = _actor(request)
        file_bytes = await file.read()
        file_name = file.filename or "unknown.pdf"
        mime = file.content_type or "application/pdf"

        # Run OCR
        if mime.startswith("image/"):
            extracted = ocr_parser.extract_from_image(file_bytes)
        else:
            extracted = ocr_parser.extract_from_pdf(file_bytes)

        # Insert invoice
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_invoice (
                  env_id, business_id, project_id, draw_request_id,
                  invoice_number, invoice_date, total_amount,
                  ocr_status, ocr_raw_json, ocr_confidence,
                  file_name, file_size_bytes, mime_type,
                  status, created_by
                ) VALUES (
                  %s::uuid, %s::uuid, %s::uuid, %s,
                  %s, %s, %s,
                  %s, %s::jsonb, %s,
                  %s, %s, %s,
                  'uploaded', %s
                )
                RETURNING *
                """,
                (
                    str(eid), str(bid), str(project_id),
                    draw_request_id if draw_request_id else None,
                    extracted.invoice_number,
                    extracted.invoice_date,
                    str(extracted.total_amount) if extracted.total_amount else "0",
                    "completed" if extracted.confidence > 0 else "failed",
                    json.dumps({"raw_text": extracted.raw_text[:5000], "line_items": extracted.line_items}),
                    str(extracted.confidence),
                    file_name, len(file_bytes), mime,
                    actor,
                ),
            )
            invoice = cur.fetchone()
            inv_id = invoice["invoice_id"]

            # Insert extracted line items
            for idx, item in enumerate(extracted.line_items, 1):
                cur.execute(
                    """
                    INSERT INTO cp_invoice_line_item (
                      invoice_id, line_number, description, cost_code,
                      quantity, unit_price, amount
                    ) VALUES (%s::uuid, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        str(inv_id), idx,
                        item.get("description"), item.get("cost_code"),
                        item.get("quantity"), item.get("unit_price"),
                        item.get("amount", "0"),
                    ),
                )

        draw_audit.log_draw_event(
            env_id=eid, business_id=bid, project_id=project_id,
            draw_request_id=UUID(draw_request_id) if draw_request_id else None,
            invoice_id=inv_id,
            entity_type="invoice", entity_id=inv_id,
            action="uploaded", actor=actor,
            new_state={"file_name": file_name, "ocr_confidence": extracted.confidence},
        )

        # Auto-match if draw_request_id provided
        match_result = None
        if draw_request_id:
            try:
                match_result = matcher_svc.match_invoice_to_draw(
                    invoice_id=inv_id, draw_request_id=UUID(draw_request_id),
                    env_id=eid, business_id=bid, project_id=project_id, actor=actor,
                )
            except Exception:
                pass  # Non-fatal: invoice is saved even if matching fails

        return {
            "invoice": invoice,
            "ocr": {
                "confidence": extracted.confidence,
                "invoice_number": extracted.invoice_number,
                "invoice_date": extracted.invoice_date,
                "total_amount": str(extracted.total_amount) if extracted.total_amount else None,
                "line_items_found": len(extracted.line_items),
            },
            "match_result": match_result,
        }
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.invoices.upload")


@router.get("/projects/{project_id}/invoices")
def list_invoices(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT inv.*, v.vendor_name
                FROM cp_invoice inv
                LEFT JOIN pds_vendors v ON v.vendor_id = inv.vendor_id
                WHERE inv.project_id = %s::uuid AND inv.env_id = %s::uuid AND inv.business_id = %s::uuid
                ORDER BY inv.created_at DESC
                LIMIT %s OFFSET %s
                """,
                (str(project_id), str(eid), str(bid), limit, offset),
            )
            return cur.fetchall()
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.invoices.list")


@router.get("/invoices/{invoice_id}")
def get_invoice(
    request: Request,
    invoice_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                "SELECT * FROM cp_invoice WHERE invoice_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid",
                (str(invoice_id), str(eid), str(bid)),
            )
            invoice = cur.fetchone()
            if not invoice:
                raise LookupError(f"Invoice {invoice_id} not found")

            cur.execute(
                "SELECT * FROM cp_invoice_line_item WHERE invoice_id = %s::uuid ORDER BY line_number",
                (str(invoice_id),),
            )
            invoice["line_items"] = cur.fetchall()
        return invoice
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.invoices.get")


@router.post("/invoices/{invoice_id}/match-override")
def match_override(
    request: Request,
    invoice_id: UUID,
    body: InvoiceMatchOverride,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """HITL REQUIRED: Override auto-match for an invoice line item."""
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute("SELECT project_id, draw_request_id FROM cp_invoice WHERE invoice_id = %s::uuid", (str(invoice_id),))
            inv = cur.fetchone()
            if not inv:
                raise LookupError(f"Invoice {invoice_id} not found")

        return matcher_svc.override_match(
            invoice_line_id=body.invoice_line_id,
            draw_line_item_id=body.draw_line_item_id,
            invoice_id=invoice_id,
            env_id=eid, business_id=bid,
            project_id=inv["project_id"],
            draw_request_id=inv.get("draw_request_id"),
            actor=body.actor or _actor(request),
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.invoices.match_override")


@router.post("/invoices/{invoice_id}/assign-to-draw")
def assign_to_draw(
    request: Request,
    invoice_id: UUID,
    body: InvoiceAssignToDraw,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                """
                UPDATE cp_invoice SET
                  draw_request_id = %s::uuid, status = 'assigned', updated_at = now(),
                  updated_by = %s
                WHERE invoice_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid
                RETURNING *
                """,
                (
                    str(body.draw_request_id), body.actor or _actor(request),
                    str(invoice_id), str(eid), str(bid),
                ),
            )
            result = cur.fetchone()
            if not result:
                raise LookupError(f"Invoice {invoice_id} not found")
        return result
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.invoices.assign_to_draw")


# ── Inspections ───────────────────────────────────────────────────

@router.post("/projects/{project_id}/inspections", status_code=201)
def create_inspection(
    request: Request,
    project_id: UUID,
    body: InspectionCreate,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_inspection (
                  env_id, business_id, project_id, draw_request_id,
                  inspector_name, inspection_date, inspection_type,
                  overall_pct_complete, findings, recommendations,
                  passed, photo_urls, created_by
                ) VALUES (
                  %s::uuid, %s::uuid, %s::uuid, %s,
                  %s, %s, %s,
                  %s, %s, %s,
                  %s, %s::jsonb, %s
                )
                RETURNING *
                """,
                (
                    str(eid), str(bid), str(project_id),
                    str(body.draw_request_id) if body.draw_request_id else None,
                    body.inspector_name, body.inspection_date, body.inspection_type,
                    str(body.overall_pct_complete) if body.overall_pct_complete else None,
                    body.findings, body.recommendations,
                    body.passed, json.dumps(body.photo_urls),
                    body.created_by or _actor(request),
                ),
            )
            result = cur.fetchone()

        draw_audit.log_draw_event(
            env_id=eid, business_id=bid, project_id=project_id,
            draw_request_id=body.draw_request_id,
            entity_type="inspection", entity_id=result["inspection_id"],
            action="created", actor=body.created_by or _actor(request),
            new_state={"inspection_type": body.inspection_type, "passed": body.passed},
        )

        return result
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.inspections.create")


@router.get("/projects/{project_id}/inspections")
def list_inspections(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        from app.db import get_cursor
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM cp_inspection
                WHERE project_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY inspection_date DESC
                LIMIT %s OFFSET %s
                """,
                (str(project_id), str(eid), str(bid), limit, offset),
            )
            return cur.fetchall()
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.inspections.list")


# ── Reports ───────────────────────────────────────────────────────

@router.get("/draw-portfolio-summary")
def get_draw_portfolio(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return rollup_svc.get_draw_portfolio_summary(env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.portfolio")


@router.get("/projects/{project_id}/budget-vs-actual")
def get_budget_vs_actual(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return rollup_svc.get_budget_vs_actual(project_id=project_id, env_id=eid, business_id=bid)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.budget_vs_actual")


# ── Audit Log ─────────────────────────────────────────────────────

@router.get("/projects/{project_id}/draw-audit")
def get_draw_audit_log(
    request: Request,
    project_id: UUID,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
    draw_request_id: UUID | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Read-only audit log query."""
    try:
        eid, bid = _resolve(request, env_id, str(business_id) if business_id else None)
        return draw_audit.query_draw_audit(
            project_id=project_id, env_id=eid, business_id=bid,
            draw_request_id=draw_request_id, entity_type=entity_type,
            limit=limit, offset=offset,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(request=request, status_code=status, code=code, detail=str(exc), action="cp.draws.audit")
