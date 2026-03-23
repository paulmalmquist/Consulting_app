from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.services import report_views
from app.schemas.reporting import (
    ReportCreateRequest,
    ReportExplainOut,
    ReportOut,
    ReportRunOut,
    ReportRunRequest,
)
from app.services import reports as reports_svc


router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/business-overview")
def get_business_overview(business_id: UUID = Query(...)):
    try:
        return report_views.business_overview(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/department-health")
def get_department_health(business_id: UUID = Query(...), deptKey: str | None = Query(None)):
    try:
        return report_views.department_health(business_id=business_id, dept_key=deptKey)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/doc-register")
def get_doc_register(business_id: UUID = Query(...)):
    try:
        return report_views.doc_register(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/doc-compliance")
def get_doc_compliance(business_id: UUID = Query(...)):
    try:
        return report_views.doc_compliance(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/execution-ledger")
def get_execution_ledger(business_id: UUID = Query(...)):
    try:
        return report_views.execution_ledger(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/template-adoption")
def get_template_adoption(business_id: UUID = Query(...)):
    try:
        return report_views.template_adoption(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/template-adoption/simulate-drift")
def simulate_template_drift(business_id: UUID = Query(...)):
    try:
        return report_views.simulate_template_drift(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/readiness")
def get_readiness(business_id: UUID = Query(...)):
    try:
        return report_views.readiness(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("", response_model=ReportOut)
def create_report(req: ReportCreateRequest):
    try:
        payload = reports_svc.create_report(
            business_id=req.business_id,
            title=req.title,
            description=req.description,
            query=req.query,
            is_draft=req.is_draft,
        )
        return ReportOut(**payload)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=list[ReportOut])
def list_reports(business_id: UUID = Query(...)):
    try:
        rows = reports_svc.list_reports(business_id=business_id)
        return [ReportOut(**r) for r in rows]
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: UUID, business_id: UUID = Query(...)):
    row = reports_svc.get_report(business_id=business_id, report_id=report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    return ReportOut(**row)


@router.post("/{report_id}/run", response_model=ReportRunOut)
def run_report(report_id: UUID, req: ReportRunRequest):
    try:
        payload = reports_svc.run_report(
            business_id=req.business_id,
            report_id=report_id,
            refresh=req.refresh,
        )
        return ReportRunOut(**payload)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{report_id}/runs/{report_run_id}/explain", response_model=ReportExplainOut)
def explain_report_run(report_id: UUID, report_run_id: UUID, business_id: UUID = Query(...)):
    try:
        payload = reports_svc.explain_report_run(
            business_id=business_id,
            report_id=report_id,
            report_run_id=report_run_id,
        )
        return ReportExplainOut(**payload)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
