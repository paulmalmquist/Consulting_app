from __future__ import annotations

import json
from uuid import UUID, uuid4

from app.db import get_cursor


def start_run(
    *,
    run_type: str,
    fund_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
    triggered_by: str | None = None,
) -> str:
    run_id = str(uuid4())
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_run_provenance (
                run_id, run_type, fund_id, quarter,
                scenario_id, triggered_by, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'running')
            RETURNING provenance_id, run_id
            """,
            (
                run_id, run_type, str(fund_id), quarter,
                str(scenario_id) if scenario_id else None,
                triggered_by,
            ),
        )
        cur.fetchone()
    return run_id


def complete_run(
    *,
    run_id: str,
    effective_assumptions_hash: str | None = None,
    effective_assumptions_json: dict | None = None,
    ledger_inputs_hash: str | None = None,
    accounting_inputs_hash: str | None = None,
    valuation_inputs_hash: str | None = None,
    base_assumption_set_id: UUID | None = None,
    metadata: dict | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_run_provenance
            SET status = 'success',
                completed_at = now(),
                effective_assumptions_hash = %s,
                effective_assumptions_json = %s,
                ledger_inputs_hash = %s,
                accounting_inputs_hash = %s,
                valuation_inputs_hash = %s,
                base_assumption_set_id = %s,
                metadata_json = %s
            WHERE run_id = %s
            RETURNING *
            """,
            (
                effective_assumptions_hash,
                json.dumps(effective_assumptions_json) if effective_assumptions_json else None,
                ledger_inputs_hash,
                accounting_inputs_hash,
                valuation_inputs_hash,
                str(base_assumption_set_id) if base_assumption_set_id else None,
                json.dumps(metadata or {}),
                run_id,
            ),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Run {run_id} not found")
        return row


def fail_run(*, run_id: str, error_message: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_run_provenance
            SET status = 'failed',
                completed_at = now(),
                error_message = %s
            WHERE run_id = %s
            RETURNING *
            """,
            (error_message, run_id),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Run {run_id} not found")
        return row


def get_run(*, run_id: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM re_run_provenance WHERE run_id = %s",
            (run_id,),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Run {run_id} not found")
        return row


def list_runs(
    *,
    fund_id: UUID,
    quarter: str | None = None,
    run_type: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["fund_id = %s"]
        params: list = [str(fund_id)]

        if quarter:
            conditions.append("quarter = %s")
            params.append(quarter)
        if run_type:
            conditions.append("run_type = %s")
            params.append(run_type)

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT * FROM re_run_provenance
            WHERE {where}
            ORDER BY started_at DESC
            """,
            params,
        )
        return cur.fetchall()
