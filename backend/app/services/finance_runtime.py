"""Deterministic finance run orchestration service."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from app.db import get_cursor
from app.finance.execution_runtime import FinRunEnvelope, build_envelope_hash
from app.services import finance_construction, finance_healthcare, finance_legal, finance_repe
from app.services.finance_common import get_partition_context


SUPPORTED_ENGINE_KINDS = {
    "waterfall",
    "capital_rollforward",
    "contingency",
    "provider_comp",
    "construction_forecast",
}


def _insert_run(
    *,
    business_id: UUID,
    partition_id: UUID,
    engine_kind: str,
    as_of_date: date,
    idempotency_key: str,
    dataset_version_id: UUID | None,
    fin_rule_version_id: UUID | None,
    payload: dict,
) -> tuple[dict, bool]:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, partition_id)

        cur.execute(
            """SELECT *
               FROM fin_run
               WHERE tenant_id = %s
                 AND business_id = %s
                 AND partition_id = %s
                 AND idempotency_key = %s""",
            (ctx["tenant_id"], str(business_id), str(partition_id), idempotency_key),
        )
        existing = cur.fetchone()
        if existing:
            return existing, True

        envelope = FinRunEnvelope(
            tenant_id=str(ctx["tenant_id"]),
            business_id=str(business_id),
            partition_id=str(partition_id),
            engine_kind=engine_kind,
            as_of_date=as_of_date,
            idempotency_key=idempotency_key,
            dataset_version_id=str(dataset_version_id) if dataset_version_id else None,
            fin_rule_version_id=str(fin_rule_version_id) if fin_rule_version_id else None,
            input_ref_table=str(payload.get("input_ref_table") or ""),
            input_ref_id=str(payload.get("input_ref_id") or ""),
            payload=payload,
        )
        envelope_hash = build_envelope_hash(envelope)

        cur.execute(
            """INSERT INTO fin_run
               (tenant_id, business_id, partition_id, engine_kind, status,
                idempotency_key, deterministic_hash, as_of_date,
                dataset_version_id, fin_rule_version_id,
                input_ref_table, input_ref_id,
                started_at)
               VALUES (%s, %s, %s, %s, 'running', %s, %s, %s, %s, %s, %s, %s, now())
               RETURNING *""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                engine_kind,
                idempotency_key,
                envelope_hash,
                as_of_date,
                str(dataset_version_id) if dataset_version_id else None,
                str(fin_rule_version_id) if fin_rule_version_id else None,
                payload.get("input_ref_table"),
                payload.get("input_ref_id"),
            ),
        )
        return cur.fetchone(), False


def _dispatch_run(
    *,
    fin_run_id: UUID,
    business_id: UUID,
    partition_id: UUID,
    engine_kind: str,
    as_of_date: date,
    idempotency_key: str,
    payload: dict,
) -> dict:
    if engine_kind == "waterfall":
        return finance_repe.execute_waterfall_run(
            fin_run_id=fin_run_id,
            business_id=business_id,
            partition_id=partition_id,
            fund_id=UUID(payload["fund_id"]),
            distribution_event_id=UUID(payload["distribution_event_id"]),
            as_of_date=as_of_date,
            idempotency_key=idempotency_key,
        )

    if engine_kind == "capital_rollforward":
        return finance_repe.run_capital_rollforward(
            fin_run_id=fin_run_id,
            business_id=business_id,
            partition_id=partition_id,
            fund_id=UUID(payload["fund_id"]),
            as_of_date=as_of_date,
            idempotency_key=idempotency_key,
        )

    if engine_kind == "contingency":
        return finance_legal.run_contingency(
            fin_run_id=fin_run_id,
            matter_id=UUID(payload["matter_id"]),
            as_of_date=as_of_date,
            settlement_amount=payload["settlement_amount"],
            expense_amount=payload["expense_amount"],
        )

    if engine_kind == "provider_comp":
        return finance_healthcare.run_provider_comp(
            fin_run_id=fin_run_id,
            provider_id=UUID(payload["provider_id"]),
            as_of_date=as_of_date,
            gross_collections=payload["gross_collections"],
            net_collections=payload["net_collections"],
            fin_provider_comp_plan_id=UUID(payload["provider_comp_plan_id"])
            if payload.get("provider_comp_plan_id")
            else None,
        )

    if engine_kind == "construction_forecast":
        return finance_construction.run_forecast(
            fin_run_id=fin_run_id,
            fin_project_id=UUID(payload["project_id"]),
            as_of_date=as_of_date,
        )

    raise ValueError(f"Unsupported finance engine kind: {engine_kind}")


def _mark_run_completed(fin_run_id: UUID, deterministic_hash: str | None, result_refs: list[dict]) -> dict:
    with get_cursor() as cur:
        if deterministic_hash:
            cur.execute(
                """UPDATE fin_run
                   SET status = 'completed', completed_at = now(), deterministic_hash = %s
                   WHERE fin_run_id = %s""",
                (deterministic_hash, str(fin_run_id)),
            )
        else:
            cur.execute(
                """UPDATE fin_run
                   SET status = 'completed', completed_at = now()
                   WHERE fin_run_id = %s""",
                (str(fin_run_id),),
            )

        for ref in result_refs:
            cur.execute(
                """INSERT INTO fin_run_result_ref
                   (fin_run_id, tenant_id, business_id, partition_id, result_table, result_id)
                   SELECT fin_run_id, tenant_id, business_id, partition_id, %s, %s
                   FROM fin_run
                   WHERE fin_run_id = %s
                   ON CONFLICT DO NOTHING""",
                (ref["result_table"], ref["result_id"], str(fin_run_id)),
            )

        cur.execute("SELECT * FROM fin_run WHERE fin_run_id = %s", (str(fin_run_id),))
        run_row = cur.fetchone()

        cur.execute(
            """INSERT INTO fin_run_event
               (fin_run_id, tenant_id, business_id, partition_id, status, message)
               VALUES (%s, %s, %s, %s, 'completed', 'Run completed')""",
            (
                run_row["fin_run_id"],
                run_row["tenant_id"],
                run_row["business_id"],
                run_row["partition_id"],
            ),
        )

        return run_row


def _mark_run_failed(fin_run_id: UUID, message: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE fin_run
               SET status = 'failed', completed_at = now(), error_message = %s
               WHERE fin_run_id = %s""",
            (message[:2000], str(fin_run_id)),
        )

        cur.execute("SELECT * FROM fin_run WHERE fin_run_id = %s", (str(fin_run_id),))
        run_row = cur.fetchone()
        if run_row:
            cur.execute(
                """INSERT INTO fin_run_event
                   (fin_run_id, tenant_id, business_id, partition_id, status, message)
                   VALUES (%s, %s, %s, %s, 'failed', %s)""",
                (
                    run_row["fin_run_id"],
                    run_row["tenant_id"],
                    run_row["business_id"],
                    run_row["partition_id"],
                    message[:2000],
                ),
            )


def submit_run(
    *,
    business_id: UUID,
    partition_id: UUID,
    engine_kind: str,
    as_of_date: date,
    idempotency_key: str,
    payload: dict,
    dataset_version_id: UUID | None = None,
    fin_rule_version_id: UUID | None = None,
) -> dict:
    if engine_kind not in SUPPORTED_ENGINE_KINDS:
        raise ValueError(f"Unsupported engine_kind: {engine_kind}")

    run_row, is_existing = _insert_run(
        business_id=business_id,
        partition_id=partition_id,
        engine_kind=engine_kind,
        as_of_date=as_of_date,
        idempotency_key=idempotency_key,
        dataset_version_id=dataset_version_id,
        fin_rule_version_id=fin_rule_version_id,
        payload=payload,
    )

    if is_existing:
        return run_row

    try:
        result = _dispatch_run(
            fin_run_id=run_row["fin_run_id"],
            business_id=business_id,
            partition_id=partition_id,
            engine_kind=engine_kind,
            as_of_date=as_of_date,
            idempotency_key=idempotency_key,
            payload=payload,
        )
    except Exception as exc:
        _mark_run_failed(run_row["fin_run_id"], str(exc))
        raise

    finalized = _mark_run_completed(
        run_row["fin_run_id"],
        deterministic_hash=result.get("deterministic_hash"),
        result_refs=result.get("result_refs", []),
    )

    out = dict(finalized)
    out["result_refs"] = result.get("result_refs", [])
    return out


def get_run(*, run_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM fin_run WHERE fin_run_id = %s", (str(run_id),))
        return cur.fetchone()


def get_run_results(*, run_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT result_table, result_id, created_at
               FROM fin_run_result_ref
               WHERE fin_run_id = %s
               ORDER BY created_at""",
            (str(run_id),),
        )
        return cur.fetchall()
