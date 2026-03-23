from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.underwriting import (
    UnderwritingReportsOut,
    UnderwritingResearchContractOut,
    UnderwritingResearchIngestRequest,
    UnderwritingResearchIngestResponse,
    UnderwritingRunCreateRequest,
    UnderwritingRunOut,
    UnderwritingRunScenariosRequest,
    UnderwritingRunScenariosResponse,
)
from app.services import underwriting as uw_svc

router = APIRouter(prefix="/api/underwriting", tags=["underwriting"])


@router.get("/contracts/research", response_model=UnderwritingResearchContractOut)
def get_research_contract():
    return UnderwritingResearchContractOut(
        contract_version="uw_research_contract_v1",
        schema=uw_svc.get_research_contract_schema(),
    )


@router.post("/runs", response_model=UnderwritingRunOut)
def create_run(req: UnderwritingRunCreateRequest):
    try:
        row = uw_svc.create_run(req=req)
        return UnderwritingRunOut(**row)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/runs", response_model=list[UnderwritingRunOut])
def list_runs(
    business_id: UUID = Query(...),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    try:
        rows = uw_svc.list_runs(business_id=business_id, status=status, limit=limit)
        return [UnderwritingRunOut(**row) for row in rows]
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/runs/{run_id}", response_model=UnderwritingRunOut)
def get_run(run_id: UUID):
    row = uw_svc.get_run(run_id=run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Underwriting run not found")
    return UnderwritingRunOut(**row)


@router.post("/runs/{run_id}/ingest-research", response_model=UnderwritingResearchIngestResponse)
def ingest_research(run_id: UUID, req: UnderwritingResearchIngestRequest):
    try:
        out = uw_svc.ingest_research(run_id=run_id, req=req)
        return UnderwritingResearchIngestResponse(**out)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/runs/{run_id}/scenarios/run", response_model=UnderwritingRunScenariosResponse)
def run_scenarios(run_id: UUID, req: UnderwritingRunScenariosRequest):
    try:
        out = uw_svc.run_scenarios(run_id=run_id, req=req)
        return UnderwritingRunScenariosResponse(**out)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/runs/{run_id}/reports", response_model=UnderwritingReportsOut)
def get_reports(run_id: UUID):
    try:
        out = uw_svc.get_reports(run_id=run_id)
        return UnderwritingReportsOut(**out)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
