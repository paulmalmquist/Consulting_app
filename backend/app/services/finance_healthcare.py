"""Healthcare/MSO finance domain service."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.finance.provider_comp_engine import compute_provider_comp
from app.finance.utils import qmoney
from app.services.finance_common import get_partition_context


def _get_mso(cur, fin_mso_id: UUID) -> dict:
    cur.execute("SELECT * FROM fin_mso WHERE fin_mso_id = %s", (str(fin_mso_id),))
    row = cur.fetchone()
    if not row:
        raise LookupError("MSO not found")
    return row


def _get_provider(cur, fin_provider_id: UUID) -> dict:
    cur.execute("SELECT * FROM fin_provider WHERE fin_provider_id = %s", (str(fin_provider_id),))
    row = cur.fetchone()
    if not row:
        raise LookupError("Provider not found")
    return row


def create_mso(
    *,
    business_id: UUID,
    partition_id: UUID,
    code: str,
    name: str,
    fin_entity_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """INSERT INTO fin_mso
               (tenant_id, business_id, partition_id, fin_entity_id, code, name, status)
               VALUES (%s, %s, %s, %s, %s, %s, 'active')
               RETURNING *""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                str(fin_entity_id) if fin_entity_id else None,
                code,
                name,
            ),
        )
        return cur.fetchone()


def list_msos(*, business_id: UUID, partition_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)
        cur.execute(
            "SELECT * FROM fin_mso WHERE business_id = %s AND partition_id = %s ORDER BY created_at DESC",
            (str(business_id), str(partition_id)),
        )
        return cur.fetchall()


def create_clinic(
    *,
    business_id: UUID,
    partition_id: UUID,
    fin_mso_id: UUID,
    code: str,
    name: str,
    npi: str | None,
    fin_entity_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, partition_id)
        _get_mso(cur, fin_mso_id)
        cur.execute(
            """INSERT INTO fin_clinic
               (tenant_id, business_id, partition_id, fin_mso_id, fin_entity_id, code, name, npi, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active')
               RETURNING *""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                str(fin_mso_id),
                str(fin_entity_id) if fin_entity_id else None,
                code,
                name,
                npi,
            ),
        )
        return cur.fetchone()


def list_clinics(*, business_id: UUID, partition_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """SELECT c.*, m.name AS mso_name
               FROM fin_clinic c
               LEFT JOIN fin_mso m ON m.fin_mso_id = c.fin_mso_id
               WHERE c.business_id = %s AND c.partition_id = %s
               ORDER BY c.created_at DESC""",
            (str(business_id), str(partition_id)),
        )
        return cur.fetchall()


def create_provider(
    *,
    business_id: UUID,
    partition_id: UUID,
    fin_clinic_id: UUID | None,
    fin_mso_id: UUID | None,
    fin_participant_id: UUID | None,
    provider_type: str | None,
    license_number: str | None,
    npi: str | None,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """INSERT INTO fin_provider
               (tenant_id, business_id, partition_id, fin_clinic_id, fin_mso_id,
                fin_participant_id, provider_type, license_number, npi, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
               RETURNING *""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                str(fin_clinic_id) if fin_clinic_id else None,
                str(fin_mso_id) if fin_mso_id else None,
                str(fin_participant_id) if fin_participant_id else None,
                provider_type,
                license_number,
                npi,
            ),
        )
        return cur.fetchone()


def list_providers(*, business_id: UUID, partition_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)
        cur.execute(
            "SELECT * FROM fin_provider WHERE business_id = %s AND partition_id = %s ORDER BY created_at DESC",
            (str(business_id), str(partition_id)),
        )
        return cur.fetchall()


def create_provider_comp_plan(
    *,
    provider_id: UUID,
    plan_name: str,
    plan_formula: str,
    base_rate: Decimal,
    incentive_rate: Decimal,
    effective_from: date,
    effective_to: date | None,
) -> dict:
    with get_cursor() as cur:
        provider = _get_provider(cur, provider_id)
        cur.execute(
            """INSERT INTO fin_provider_comp_plan
               (tenant_id, business_id, partition_id, fin_provider_id, plan_name, plan_formula,
                base_rate, incentive_rate, effective_from, effective_to)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                provider["tenant_id"],
                provider["business_id"],
                provider["partition_id"],
                provider["fin_provider_id"],
                plan_name,
                plan_formula,
                qmoney(base_rate),
                qmoney(incentive_rate),
                effective_from,
                effective_to,
            ),
        )
        return cur.fetchone()


def run_provider_comp(
    *,
    fin_run_id: UUID,
    provider_id: UUID,
    as_of_date: date,
    gross_collections: Decimal,
    net_collections: Decimal,
    fin_provider_comp_plan_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        provider = _get_provider(cur, provider_id)

        plan = None
        if fin_provider_comp_plan_id:
            cur.execute(
                """SELECT *
                   FROM fin_provider_comp_plan
                   WHERE fin_provider_comp_plan_id = %s
                     AND fin_provider_id = %s""",
                (str(fin_provider_comp_plan_id), str(provider_id)),
            )
            plan = cur.fetchone()
        else:
            cur.execute(
                """SELECT *
                   FROM fin_provider_comp_plan
                   WHERE fin_provider_id = %s
                   AND effective_from <= %s
                   AND (effective_to IS NULL OR effective_to >= %s)
                   ORDER BY effective_from DESC
                   LIMIT 1""",
                (str(provider_id), as_of_date, as_of_date),
            )
            plan = cur.fetchone()

        if not plan:
            raise LookupError("No active provider comp plan for provider")

        comp_amount = compute_provider_comp(
            plan_formula=plan["plan_formula"],
            base_rate=qmoney(plan["base_rate"]),
            incentive_rate=qmoney(plan["incentive_rate"]),
            gross_collections=qmoney(gross_collections),
            net_collections=qmoney(net_collections),
        )

        cur.execute(
            """INSERT INTO fin_provider_comp_run
               (tenant_id, business_id, partition_id, fin_provider_id, fin_provider_comp_plan_id,
                as_of_date, gross_collections, net_collections, compensation_amount, status, fin_run_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'completed', %s)
               RETURNING *""",
            (
                provider["tenant_id"],
                provider["business_id"],
                provider["partition_id"],
                provider["fin_provider_id"],
                plan["fin_provider_comp_plan_id"],
                as_of_date,
                qmoney(gross_collections),
                qmoney(net_collections),
                comp_amount,
                str(fin_run_id),
            ),
        )
        run = cur.fetchone()

        return {
            "deterministic_hash": f"provider_comp:{run['fin_provider_comp_run_id']}",
            "result_refs": [{"result_table": "fin_provider_comp_run", "result_id": run["fin_provider_comp_run_id"]}],
            "compensation_amount": comp_amount,
        }


def list_provider_comp_runs(*, provider_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        _get_provider(cur, provider_id)
        cur.execute(
            """SELECT *
               FROM fin_provider_comp_run
               WHERE fin_provider_id = %s
               ORDER BY as_of_date DESC, created_at DESC""",
            (str(provider_id),),
        )
        return cur.fetchall()


def create_claim(
    *,
    business_id: UUID,
    partition_id: UUID,
    claim_number: str,
    fin_clinic_id: UUID | None,
    fin_provider_id: UUID | None,
    service_date: date | None,
    billed_amount: Decimal,
    allowed_amount: Decimal,
    paid_amount: Decimal,
    status: str,
) -> dict:
    with get_cursor() as cur:
        ctx = get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """INSERT INTO fin_claim
               (tenant_id, business_id, partition_id, fin_clinic_id, fin_provider_id,
                claim_number, service_date, billed_amount, allowed_amount, paid_amount, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING *""",
            (
                ctx["tenant_id"],
                str(business_id),
                str(partition_id),
                str(fin_clinic_id) if fin_clinic_id else None,
                str(fin_provider_id) if fin_provider_id else None,
                claim_number,
                service_date,
                qmoney(billed_amount),
                qmoney(allowed_amount),
                qmoney(paid_amount),
                status,
            ),
        )
        return cur.fetchone()


def list_claims(*, business_id: UUID, partition_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """SELECT *
               FROM fin_claim
               WHERE business_id = %s AND partition_id = %s
               ORDER BY created_at DESC""",
            (str(business_id), str(partition_id)),
        )
        return cur.fetchall()


def list_denials_reconciliation(*, business_id: UUID, partition_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        get_partition_context(cur, business_id, partition_id)
        cur.execute(
            """SELECT
                cd.resolution_status,
                COUNT(*)::int AS denial_count,
                COALESCE(SUM(c.billed_amount), 0) AS billed_amount,
                COALESCE(SUM(c.paid_amount), 0) AS paid_amount
               FROM fin_claim_denial cd
               JOIN fin_claim c ON c.fin_claim_id = cd.fin_claim_id
               WHERE cd.business_id = %s AND cd.partition_id = %s
               GROUP BY cd.resolution_status
               ORDER BY cd.resolution_status""",
            (str(business_id), str(partition_id)),
        )
        return cur.fetchall()
