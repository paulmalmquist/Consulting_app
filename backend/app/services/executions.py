"""Executions service — single source of truth for execution operations."""

import json
from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor


def _emit_execution_event(
    event_type: str,
    execution_id,
    business_id: UUID,
    execution_type: str | None,
    inputs: dict,
    *,
    error: str | None = None,
) -> None:
    """Emit a best-effort execution lifecycle event.

    Never raises and never blocks beyond the publisher's bounded timeout; it is
    a pure no-op when no broker is configured (e.g. in CI). The emit is
    observability only — it cannot change the execution's result or behavior.
    """
    from app.events import EventEnvelope, Topics, publish_event

    status = event_type.split(".", 1)[-1]
    payload: dict = {"status": status, "execution_type": execution_type}
    if event_type != "execution.started":
        payload["input_keys"] = list(inputs.keys())
    if error is not None:
        payload["error"] = error

    publish_event(
        Topics.EXECUTIONS,
        EventEnvelope(
            event_type=event_type,
            idempotency_key=f"{event_type}:{execution_id}",
            occurred_at=datetime.now(timezone.utc),
            run_id=str(execution_id),
            business_id=business_id,
            payload=payload,
        ),
    )


def run_execution(
    business_id: UUID,
    department_id: UUID | None,
    capability_id: UUID | None,
    inputs_json: dict | None = None,
    dry_run: bool = False,
    execution_type: str | None = None,
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

            if department_id:
                cur.execute(
                    """SELECT 1 FROM app.business_departments bd
                       JOIN app.departments d ON d.department_id = bd.department_id
                       WHERE bd.business_id = %s AND bd.department_id = %s AND bd.enabled = true""",
                    (str(business_id), str(department_id)),
                )
                if not cur.fetchone():
                    raise LookupError("Department not found or not enabled for this business")

            if capability_id:
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

    with get_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM app.businesses WHERE business_id = %s",
            (str(business_id),),
        )
        if not cur.fetchone():
            raise LookupError("Business not found")

        if department_id:
            cur.execute(
                """SELECT 1 FROM app.business_departments bd
                   WHERE bd.business_id = %s AND bd.department_id = %s AND bd.enabled = true""",
                (str(business_id), str(department_id)),
            )
            if not cur.fetchone():
                raise LookupError("Department not found or not enabled for this business")

        if capability_id:
            cur.execute(
                """SELECT 1 FROM app.business_capabilities bc
                   WHERE bc.business_id = %s AND bc.capability_id = %s AND bc.enabled = true""",
                (str(business_id), str(capability_id)),
            )
            if not cur.fetchone():
                raise LookupError("Capability not found or not enabled for this business")

        cur.execute(
            """INSERT INTO app.executions
               (business_id, department_id, capability_id, status, inputs_json, outputs_json, execution_type, result_json, logs_json)
               VALUES (%s, %s, %s, 'queued', %s, %s::jsonb, %s, '{}'::jsonb, '[]'::jsonb)
               RETURNING execution_id""",
            (
                str(business_id),
                str(department_id) if department_id else None,
                str(capability_id) if capability_id else None,
                json.dumps(inputs),
                json.dumps({"message": "Execution queued"}),
                execution_type,
            ),
        )
        row = cur.fetchone()
        execution_id = row["execution_id"]

        # Best-effort lifecycle event: the row now exists. No-op without a broker.
        _emit_execution_event(
            "execution.started", execution_id, business_id, execution_type, inputs
        )

        try:
            logs = [{"at": "queued", "message": "Execution accepted"}]
            outputs: dict = {
                "message": "Execution completed successfully",
                "processed_inputs": list(inputs.keys()),
                "result_summary": f"Processed {len(inputs)} input field(s)",
            }
            result_json: dict = {}

            if execution_type == "RE_UNDERWRITE_RUN":
                from app.services import real_estate as re_svc

                loan_id = inputs.get("loan_id")
                if not loan_id:
                    raise ValueError("loan_id is required for RE_UNDERWRITE_RUN")
                logs.append({"at": "running", "message": "Running deterministic RE_UNDERWRITE_RUN"})
                run_result = re_svc.run_underwrite_execution(
                    cur=cur,
                    business_id=business_id,
                    loan_id=UUID(str(loan_id)),
                    execution_id=UUID(str(execution_id)),
                    inputs_json=inputs,
                )
                outputs = {
                    "execution_type": execution_type,
                    "underwrite_run_id": run_result["underwrite_run"]["underwrite_run_id"],
                    "loan_id": run_result["loan_id"],
                    "version": run_result["version"],
                    "outputs": run_result["outputs"],
                    "underwrite_run": run_result["underwrite_run"],
                }
                result_json = outputs
                logs.append({"at": "completed", "message": "RE_UNDERWRITE_RUN completed"})
            else:
                result_json = outputs
                logs.append({"at": "completed", "message": "Execution completed"})

            cur.execute(
                """
                UPDATE app.executions
                SET status='completed',
                    outputs_json = %s::jsonb,
                    result_json = %s::jsonb,
                    logs_json = %s::jsonb
                WHERE execution_id = %s
                """,
                (
                    json.dumps(outputs),
                    json.dumps(result_json),
                    json.dumps(logs),
                    str(execution_id),
                ),
            )
            result = {
                "run_id": execution_id,
                "status": "completed",
                "outputs_json": outputs,
            }
        except Exception as exc:
            # Observability only: the original exception still propagates, so the
            # transaction rolls back and the API surfaces the error unchanged.
            _emit_execution_event(
                "execution.failed",
                execution_id,
                business_id,
                execution_type,
                inputs,
                error=type(exc).__name__,
            )
            raise

    # Cursor context has exited: the row is committed. Emit the terminal event.
    _emit_execution_event(
        "execution.completed", execution_id, business_id, execution_type, inputs
    )
    return result


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
