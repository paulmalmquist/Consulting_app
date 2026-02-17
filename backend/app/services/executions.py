"""Executions service — single source of truth for execution operations."""

import json
from uuid import UUID

from app.db import get_cursor


def run_execution(
    business_id: UUID,
    department_id: UUID,
    capability_id: UUID,
    inputs_json: dict | None = None,
    dry_run: bool = False,
) -> dict:
    inputs = inputs_json or {}

    if dry_run:
        with get_cursor() as cur:
            cur.execute(
                "SELECT 1 FROM app.businesses WHERE business_id = %s",
                (str(business_id),),
            )
            if not cur.fetchone():
                raise LookupError("Business not found")

            cur.execute(
                """SELECT 1 FROM app.business_departments bd
                   JOIN app.departments d ON d.department_id = bd.department_id
                   WHERE bd.business_id = %s AND bd.department_id = %s AND bd.enabled = true""",
                (str(business_id), str(department_id)),
            )
            if not cur.fetchone():
                raise LookupError("Department not found or not enabled for this business")

            cur.execute(
                """SELECT 1 FROM app.business_capabilities bc
                   WHERE bc.business_id = %s AND bc.capability_id = %s AND bc.enabled = true""",
                (str(business_id), str(capability_id)),
            )
            if not cur.fetchone():
                raise LookupError("Capability not found or not enabled for this business")

        return {
            "run_id": None,
            "status": "dry_run",
            "outputs_json": {
                "message": "Validation passed. Would create execution.",
                "validated_inputs": list(inputs.keys()),
            },
        }

    # Build meaningful output based on the inputs provided
    outputs = {
        "message": f"Execution completed successfully",
        "processed_inputs": list(inputs.keys()),
        "result_summary": f"Processed {len(inputs)} input field(s)",
    }

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.executions
               (business_id, department_id, capability_id, status, inputs_json, outputs_json)
               VALUES (%s, %s, %s, 'completed', %s, %s)
               RETURNING execution_id""",
            (
                str(business_id),
                str(department_id),
                str(capability_id),
                json.dumps(inputs),
                json.dumps(outputs),
            ),
        )
        row = cur.fetchone()
        return {
            "run_id": row["execution_id"],
            "status": "completed",
            "outputs_json": outputs,
        }


def list_executions(
    business_id: UUID,
    department_id: UUID | None = None,
    capability_id: UUID | None = None,
    limit: int = 20,
) -> list[dict]:
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
        return cur.fetchall()


def get_execution(execution_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT e.execution_id, e.business_id, e.department_id, e.capability_id,
                      e.status::text as status, e.inputs_json, e.outputs_json, e.created_at
               FROM app.executions e
               WHERE e.execution_id = %s""",
            (str(execution_id),),
        )
        return cur.fetchone()
