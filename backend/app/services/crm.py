from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor
from app.services import materialization
from app.services.reporting_common import normalize_key, resolve_tenant_id


def list_accounts(*, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            SELECT crm_account_id, name, account_type, industry, website, created_at
            FROM crm_account
            WHERE business_id = %s
            ORDER BY created_at DESC
            """,
            (str(business_id),),
        )
        return cur.fetchall()


def create_account(*, business_id: UUID, name: str, account_type: str, industry: str | None, website: str | None) -> dict:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            INSERT INTO crm_account
              (tenant_id, business_id, external_key, name, account_type, industry, website)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING crm_account_id, name, account_type, industry, website, created_at
            """,
            (
                tenant_id,
                str(business_id),
                normalize_key(name),
                name,
                account_type,
                industry,
                website,
            ),
        )
        row = cur.fetchone()

    materialization.enqueue_materialization_job(
        business_id=business_id,
        event_type="crm.account.created",
        event_payload={"crm_account_id": str(row["crm_account_id"])},
        idempotency_key=f"crm_account_{row['crm_account_id']}",
    )
    materialization.materialize_business_snapshot(business_id=business_id)
    return row


def list_pipeline_stages(*, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            SELECT crm_pipeline_stage_id, key, label, stage_order, win_probability, is_closed, is_won, created_at
            FROM crm_pipeline_stage
            WHERE tenant_id = %s AND business_id = %s
            ORDER BY stage_order, created_at
            """,
            (tenant_id, str(business_id)),
        )
        rows = cur.fetchall()

        if rows:
            return rows

        defaults = [
            ("prospect", "Prospect", 10, 0.1, False, False),
            ("qualified", "Qualified", 20, 0.25, False, False),
            ("proposal", "Proposal", 30, 0.5, False, False),
            ("negotiation", "Negotiation", 40, 0.7, False, False),
            ("closed_won", "Closed Won", 90, 1.0, True, True),
            ("closed_lost", "Closed Lost", 100, 0.0, True, False),
        ]
        for key, label, order, prob, closed, won in defaults:
            cur.execute(
                """
                INSERT INTO crm_pipeline_stage
                  (tenant_id, business_id, key, label, stage_order, win_probability, is_closed, is_won)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, business_id, key) DO NOTHING
                """,
                (tenant_id, str(business_id), key, label, order, prob, closed, won),
            )

        cur.execute(
            """
            SELECT crm_pipeline_stage_id, key, label, stage_order, win_probability, is_closed, is_won, created_at
            FROM crm_pipeline_stage
            WHERE tenant_id = %s AND business_id = %s
            ORDER BY stage_order, created_at
            """,
            (tenant_id, str(business_id)),
        )
        return cur.fetchall()


def list_opportunities(*, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            SELECT o.crm_opportunity_id,
                   o.name,
                   o.amount,
                   o.currency_code,
                   o.status,
                   o.expected_close_date,
                   o.actual_close_date,
                   a.name AS account_name,
                   s.key AS stage_key,
                   s.label AS stage_label,
                   o.created_at
            FROM crm_opportunity o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            WHERE o.business_id = %s
            ORDER BY o.created_at DESC
            """,
            (str(business_id),),
        )
        return cur.fetchall()


def create_opportunity(
    *,
    business_id: UUID,
    name: str,
    amount: str,
    crm_account_id: UUID | None,
    crm_pipeline_stage_id: UUID | None,
    expected_close_date,
) -> dict:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        if crm_pipeline_stage_id is None:
            stages = list_pipeline_stages(business_id=business_id)
            crm_pipeline_stage_id = stages[0]["crm_pipeline_stage_id"] if stages else None
            if crm_pipeline_stage_id is None:
                raise LookupError("No CRM pipeline stage available")

        cur.execute(
            """
            INSERT INTO crm_opportunity
              (tenant_id, business_id, crm_account_id, crm_pipeline_stage_id, external_key,
               name, amount, expected_close_date, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'open')
            RETURNING crm_opportunity_id, name, amount, status, expected_close_date, created_at
            """,
            (
                tenant_id,
                str(business_id),
                str(crm_account_id) if crm_account_id else None,
                str(crm_pipeline_stage_id) if crm_pipeline_stage_id else None,
                normalize_key(name),
                name,
                amount,
                expected_close_date,
            ),
        )
        row = cur.fetchone()

        cur.execute(
            """
            INSERT INTO crm_opportunity_stage_history
              (tenant_id, business_id, crm_opportunity_id, from_stage_id, to_stage_id, changed_at, note)
            VALUES (%s, %s, %s, NULL, %s, %s, %s)
            """,
            (
                tenant_id,
                str(business_id),
                row["crm_opportunity_id"],
                str(crm_pipeline_stage_id),
                datetime.now(timezone.utc),
                "Initial stage",
            ),
        )

    materialization.enqueue_materialization_job(
        business_id=business_id,
        event_type="crm.opportunity.created",
        event_payload={"crm_opportunity_id": str(row["crm_opportunity_id"])},
        idempotency_key=f"crm_opportunity_{row['crm_opportunity_id']}",
    )
    materialization.materialize_business_snapshot(business_id=business_id)
    return row


def create_activity(
    *,
    business_id: UUID,
    subject: str,
    activity_type: str,
    crm_account_id: UUID | None,
    crm_contact_id: UUID | None,
    crm_opportunity_id: UUID | None,
) -> dict:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute(
            """
            INSERT INTO crm_activity
              (tenant_id, business_id, crm_account_id, crm_contact_id, crm_opportunity_id,
               activity_type, subject)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING crm_activity_id, activity_type, subject, activity_at, created_at
            """,
            (
                tenant_id,
                str(business_id),
                str(crm_account_id) if crm_account_id else None,
                str(crm_contact_id) if crm_contact_id else None,
                str(crm_opportunity_id) if crm_opportunity_id else None,
                activity_type,
                subject,
            ),
        )
        row = cur.fetchone()

    materialization.enqueue_materialization_job(
        business_id=business_id,
        event_type="crm.activity.created",
        event_payload={"crm_activity_id": str(row["crm_activity_id"])},
        idempotency_key=f"crm_activity_{row['crm_activity_id']}",
    )
    materialization.materialize_business_snapshot(business_id=business_id)
    return row
