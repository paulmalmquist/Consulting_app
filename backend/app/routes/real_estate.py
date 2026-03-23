from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.real_estate import (
    ReEventCreateRequest,
    ReEventOut,
    ReLoanCreateRequest,
    ReLoanDetailOut,
    ReLoanOut,
    ReSurveillanceCreateRequest,
    ReSurveillanceOut,
    ReTrustCreateRequest,
    ReTrustOut,
    ReUnderwriteRunCreateRequest,
    ReUnderwriteRunOut,
    ReWorkoutActionCreateRequest,
    ReWorkoutActionOut,
    ReWorkoutCaseCreateRequest,
    ReWorkoutCaseOut,
)
from app.services import executions as execution_svc
from app.services import real_estate as re_svc

router = APIRouter(prefix="/api/real-estate", tags=["real-estate"])


@router.get("/trusts", response_model=list[ReTrustOut])
def list_trusts(business_id: UUID = Query(...)):
    try:
        return [ReTrustOut(**row) for row in re_svc.list_trusts(business_id=business_id)]
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/trusts", response_model=ReTrustOut, status_code=201)
def create_trust(req: ReTrustCreateRequest):
    try:
        row = re_svc.create_trust(
            business_id=req.business_id,
            name=req.name,
            external_ids=req.external_ids,
            created_by=req.created_by,
        )
        return ReTrustOut(**row)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/loans", response_model=list[ReLoanOut])
def list_loans(
    business_id: UUID = Query(...),
    trust_id: UUID | None = Query(None),
):
    try:
        return [ReLoanOut(**row) for row in re_svc.list_loans(business_id=business_id, trust_id=trust_id)]
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/loans", response_model=ReLoanOut, status_code=201)
def create_loan(req: ReLoanCreateRequest):
    try:
        row = re_svc.create_loan(
            business_id=req.business_id,
            trust_id=req.trust_id,
            loan_identifier=req.loan_identifier,
            external_ids=req.external_ids,
            original_balance_cents=req.original_balance_cents,
            current_balance_cents=req.current_balance_cents,
            rate_decimal=req.rate_decimal,
            maturity_date=req.maturity_date,
            servicer_status=req.servicer_status.value,
            metadata_json=req.metadata_json,
            borrowers=[b.model_dump() for b in req.borrowers],
            properties=[p.model_dump() for p in req.properties],
            created_by=req.created_by,
        )
        return ReLoanOut(**row)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/loans/{loan_id}", response_model=ReLoanDetailOut)
def get_loan_detail(loan_id: UUID):
    try:
        return ReLoanDetailOut(**re_svc.get_loan_detail(loan_id=loan_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/loans/{loan_id}/surveillance", response_model=list[ReSurveillanceOut])
def list_surveillance(loan_id: UUID):
    try:
        rows = re_svc.list_surveillance(loan_id=loan_id)
        return [ReSurveillanceOut(**row) for row in rows]
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/loans/{loan_id}/surveillance", response_model=ReSurveillanceOut, status_code=201)
def create_surveillance(loan_id: UUID, req: ReSurveillanceCreateRequest):
    try:
        row = re_svc.create_surveillance(
            loan_id=loan_id,
            business_id=req.business_id,
            period_end_date=req.period_end_date,
            metrics_json=req.metrics_json,
            dscr=req.dscr,
            occupancy=req.occupancy,
            noi_cents=req.noi_cents,
            notes=req.notes,
            created_by=req.created_by,
        )
        return ReSurveillanceOut(**row)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/loans/{loan_id}/underwrite-runs", response_model=list[ReUnderwriteRunOut])
def list_underwrite_runs(loan_id: UUID):
    try:
        rows = re_svc.list_underwrite_runs(loan_id=loan_id)
        return [ReUnderwriteRunOut(**row) for row in rows]
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/loans/{loan_id}/underwrite-runs", response_model=ReUnderwriteRunOut, status_code=201)
def create_underwrite_run(loan_id: UUID, req: ReUnderwriteRunCreateRequest):
    try:
        result = execution_svc.run_execution(
            business_id=req.business_id,
            department_id=None,
            capability_id=None,
            inputs_json={
                "loan_id": str(loan_id),
                "cap_rate": req.cap_rate,
                "stabilized_noi_cents": req.stabilized_noi_cents,
                "vacancy_factor": req.vacancy_factor,
                "expense_growth": req.expense_growth,
                "interest_rate": req.interest_rate,
                "amortization_years": req.amortization_years,
                "created_by": req.created_by,
                "document_ids": req.document_ids,
            },
            execution_type="RE_UNDERWRITE_RUN",
        )
        underwrite_run = result.get("outputs_json", {}).get("underwrite_run")
        if not underwrite_run:
            raise HTTPException(status_code=500, detail="Underwrite execution did not return run payload")
        return ReUnderwriteRunOut(**underwrite_run)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/loans/{loan_id}/workout-cases", response_model=list[ReWorkoutCaseOut])
def list_workout_cases(loan_id: UUID):
    try:
        rows = re_svc.list_workout_cases(loan_id=loan_id)
        return [ReWorkoutCaseOut(**row) for row in rows]
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/loans/{loan_id}/workout-cases", response_model=ReWorkoutCaseOut, status_code=201)
def create_workout_case(loan_id: UUID, req: ReWorkoutCaseCreateRequest):
    try:
        row = re_svc.create_workout_case(
            loan_id=loan_id,
            business_id=req.business_id,
            case_status=req.case_status.value,
            assigned_to=req.assigned_to,
            summary=req.summary,
            created_by=req.created_by,
        )
        return ReWorkoutCaseOut(**row)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/workout-cases/{case_id}/actions", response_model=ReWorkoutActionOut, status_code=201)
def create_workout_action(case_id: UUID, req: ReWorkoutActionCreateRequest):
    try:
        row = re_svc.create_workout_action(
            case_id=case_id,
            business_id=req.business_id,
            action_type=req.action_type.value,
            status=req.status.value,
            due_date=req.due_date,
            owner=req.owner,
            summary=req.summary,
            audit_log_json=req.audit_log_json,
            document_ids=req.document_ids,
            created_by=req.created_by,
        )
        return ReWorkoutActionOut(**row)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/loans/{loan_id}/events", response_model=ReEventOut, status_code=201)
def create_event(loan_id: UUID, req: ReEventCreateRequest):
    try:
        row = re_svc.create_event(
            loan_id=loan_id,
            business_id=req.business_id,
            event_type=req.event_type.value,
            event_date=req.event_date,
            severity=req.severity.value,
            description=req.description,
            document_ids=req.document_ids,
            created_by=req.created_by,
        )
        return ReEventOut(**row)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/loans/{loan_id}/events", response_model=list[ReEventOut])
def list_events(loan_id: UUID):
    try:
        return [ReEventOut(**row) for row in re_svc.list_events(loan_id=loan_id)]
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/dev/seed")
def seed_real_estate_demo(business_id: UUID = Query(...)):
    try:
        return re_svc.seed_demo(business_id=business_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

