from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.finance import (
    CreateDealRequest,
    CreateDealResponse,
    CreateScenarioRequest,
    ExplainResponse,
    ImportCashflowsRequest,
    RunDealRequest,
    RunDealResponse,
    RunDistributionsResponse,
    RunSummaryResponse,
    UpdateScenarioRequest,
)
from app.services import finance as finance_svc


router = APIRouter(prefix="/api/finance", tags=["finance-waterfall"])


@router.get("/deals")
def list_deals():
    return finance_svc.list_finance_deals()


@router.post("/deals", response_model=CreateDealResponse)
def create_deal(req: CreateDealRequest):
    try:
        result = finance_svc.create_finance_deal(req.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return CreateDealResponse(**result)


@router.get("/deals/{deal_id}")
def get_deal(deal_id: UUID):
    deal = finance_svc.get_finance_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post("/deals/{deal_id}/scenarios")
def create_scenario(deal_id: UUID, req: CreateScenarioRequest):
    try:
        scenario = finance_svc.create_scenario(deal_id, req.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return scenario


@router.put("/scenarios/{scenario_id}")
def update_scenario(scenario_id: UUID, req: UpdateScenarioRequest):
    try:
        scenario = finance_svc.update_scenario(scenario_id, req.model_dump(exclude_unset=True))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@router.post("/deals/{deal_id}/cashflows/import")
def import_cashflows(deal_id: UUID, req: ImportCashflowsRequest):
    try:
        result = finance_svc.import_cashflows(deal_id, req.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@router.post("/deals/{deal_id}/runs", response_model=RunDealResponse)
def run_model(deal_id: UUID, req: RunDealRequest):
    try:
        result = finance_svc.run_model(deal_id, req.scenario_id, req.waterfall_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return RunDealResponse(**result)


@router.get("/runs/{run_id}/summary", response_model=RunSummaryResponse)
def get_run_summary(run_id: UUID):
    summary = finance_svc.get_run_summary(run_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunSummaryResponse(**summary)


@router.get("/runs/{run_id}/distributions", response_model=RunDistributionsResponse)
def get_run_distributions(
    run_id: UUID,
    group_by: str = Query("partner", pattern="^(partner|tier|date)$"),
):
    try:
        payload = finance_svc.get_run_distributions(run_id, group_by)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return RunDistributionsResponse(**payload)


@router.get("/runs/{run_id}/explain", response_model=ExplainResponse)
def get_run_explain(
    run_id: UUID,
    partner_id: UUID,
    date_value: date | None = Query(default=None, alias="date"),
):
    try:
        payload = finance_svc.get_run_explain(run_id, partner_id, date_value)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return ExplainResponse(**payload)
