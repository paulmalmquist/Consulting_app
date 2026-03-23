from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.crm import CrmAccountCreateRequest, CrmActivityCreateRequest, CrmOpportunityCreateRequest
from app.services import crm as crm_svc


router = APIRouter(prefix="/api/crm", tags=["crm"])


@router.get("/accounts")
def list_accounts(business_id: UUID = Query(...)):
    try:
        return crm_svc.list_accounts(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/accounts")
def create_account(req: CrmAccountCreateRequest):
    try:
        return crm_svc.create_account(
            business_id=req.business_id,
            name=req.name,
            account_type=req.account_type,
            industry=req.industry,
            website=req.website,
        )
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/pipeline-stages")
def list_pipeline_stages(business_id: UUID = Query(...)):
    try:
        return crm_svc.list_pipeline_stages(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/opportunities")
def list_opportunities(business_id: UUID = Query(...)):
    try:
        return crm_svc.list_opportunities(business_id=business_id)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/opportunities")
def create_opportunity(req: CrmOpportunityCreateRequest):
    try:
        return crm_svc.create_opportunity(
            business_id=req.business_id,
            name=req.name,
            amount=req.amount,
            crm_account_id=req.crm_account_id,
            crm_pipeline_stage_id=req.crm_pipeline_stage_id,
            expected_close_date=req.expected_close_date,
        )
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/activities")
def create_activity(req: CrmActivityCreateRequest):
    try:
        return crm_svc.create_activity(
            business_id=req.business_id,
            subject=req.subject,
            activity_type=req.activity_type,
            crm_account_id=req.crm_account_id,
            crm_contact_id=req.crm_contact_id,
            crm_opportunity_id=req.crm_opportunity_id,
        )
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
