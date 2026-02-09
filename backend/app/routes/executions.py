from fastapi import APIRouter, Query
from uuid import UUID
from typing import Optional
from app.db import get_cursor
from app.schemas.executions import RunExecutionRequest, RunExecutionResponse, ExecutionOut
import json

router = APIRouter(prefix="/api/executions")


@router.post("/run", response_model=RunExecutionResponse)
def run_execution(req: RunExecutionRequest):
    """Create an execution record. This is a stub that immediately completes.

    TODO: Integrate with actual execution engine / job queue.
    """
    # Stub outputs based on inputs
    stub_outputs = {
        "message": "Execution completed successfully (stub)",
        "processed_inputs": list(req.inputs_json.keys()) if req.inputs_json else [],
    }

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.executions
               (business_id, department_id, capability_id, status, inputs_json, outputs_json)
               VALUES (%s, %s, %s, 'completed', %s, %s)
               RETURNING execution_id""",
            (
                str(req.business_id),
                str(req.department_id),
                str(req.capability_id),
                json.dumps(req.inputs_json),
                json.dumps(stub_outputs),
            ),
        )
        row = cur.fetchone()
        return RunExecutionResponse(
            run_id=row["execution_id"],
            status="completed",
            outputs_json=stub_outputs,
        )


@router.get("", response_model=list[ExecutionOut])
def list_executions(
    business_id: UUID = Query(...),
    department_id: Optional[UUID] = Query(None),
    capability_id: Optional[UUID] = Query(None),
    limit: int = Query(20, le=100),
):
    with get_cursor() as cur:
        conditions = ["e.business_id = %s"]
        params: list = [str(business_id)]

        if department_id:
            conditions.append("e.department_id = %s")
            params.append(str(department_id))

        if capability_id:
            conditions.append("e.capability_id = %s")
            params.append(str(capability_id))

        params.append(limit)
        where = " AND ".join(conditions)

        cur.execute(
            f"""SELECT e.execution_id, e.business_id, e.department_id, e.capability_id,
                       e.status::text as status, e.inputs_json, e.outputs_json, e.created_at
                FROM app.executions e
                WHERE {where}
                ORDER BY e.created_at DESC
                LIMIT %s""",
            params,
        )
        rows = cur.fetchall()
        return [ExecutionOut(**r) for r in rows]
