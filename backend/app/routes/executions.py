from fastapi import APIRouter, Query
import time
from uuid import UUID
from typing import Optional
from app.schemas.executions import RunExecutionRequest, RunExecutionResponse, ExecutionOut
from app.services import executions as exec_svc
from app.services import audit as audit_svc

router = APIRouter(prefix="/api/executions")


@router.post("/run", response_model=RunExecutionResponse)
def run_execution(req: RunExecutionRequest):
    start = time.monotonic()
    result = exec_svc.run_execution(
        business_id=req.business_id,
        department_id=req.department_id,
        capability_id=req.capability_id,
        inputs_json=req.inputs_json,
        execution_type=req.execution_type,
    )
    ms = int((time.monotonic() - start) * 1000)
    audit_svc.record_event(
        actor="api_user", action="run_execution", tool_name="bm.run_execution",
        success=result["status"] == "completed", latency_ms=ms,
        business_id=req.business_id, object_type="execution",
        object_id=result["run_id"],
        input_data={"department_id": str(req.department_id), "capability_id": str(req.capability_id)},
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
