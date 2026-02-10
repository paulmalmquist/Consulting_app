from fastapi import APIRouter, Query
from uuid import UUID
from typing import Optional
from app.schemas.executions import RunExecutionRequest, RunExecutionResponse, ExecutionOut
from app.services import executions as exec_svc

router = APIRouter(prefix="/api/executions")


@router.post("/run", response_model=RunExecutionResponse)
def run_execution(req: RunExecutionRequest):
    result = exec_svc.run_execution(
        business_id=req.business_id,
        department_id=req.department_id,
        capability_id=req.capability_id,
        inputs_json=req.inputs_json,
    )
    return RunExecutionResponse(
        run_id=result["run_id"],
        status=result["status"],
        outputs_json=result["outputs_json"],
    )


@router.get("", response_model=list[ExecutionOut])
def list_executions(
    business_id: UUID = Query(...),
    department_id: Optional[UUID] = Query(None),
    capability_id: Optional[UUID] = Query(None),
    limit: int = Query(20, le=100),
):
    rows = exec_svc.list_executions(business_id, department_id, capability_id, limit)
    return [ExecutionOut(**r) for r in rows]
