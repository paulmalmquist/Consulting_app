"""Consulting Revenue OS – Client service.

Convert prospects to clients, manage client lifecycle,
and provide engagement + revenue summaries.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import resolve_tenant_id


def convert_to_client(
    *,
    env_id: str,
    business_id: UUID,
    crm_account_id: UUID,
    crm_opportunity_id: UUID | None = None,
    proposal_id: UUID | None = None,
    account_owner: str | None = None,
    start_date: date | None = None,
) -> dict:
    """Convert a prospect account to a client.

    Atomic operation:
    1. Create cro_client record
    2. Update crm_account.account_type → 'customer'
    3. If opportunity provided, set status → 'won'
    """
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        # Create client record
        cur.execute(
            """
            INSERT INTO cro_client
              (env_id, business_id, crm_account_id, crm_opportunity_id,
               proposal_id, account_owner, start_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, crm_account_id, crm_opportunity_id,
                      proposal_id, client_status, account_owner, start_date,
                      lifetime_value, created_at
            """,
            (
                env_id, str(business_id), str(crm_account_id),
                str(crm_opportunity_id) if crm_opportunity_id else None,
                str(proposal_id) if proposal_id else None,
                account_owner, start_date or date.today(),
            ),
        )
        client = cur.fetchone()

        # Update account type to customer
        cur.execute(
            """
            UPDATE crm_account SET account_type = 'customer'
            WHERE crm_account_id = %s
            """,
            (str(crm_account_id),),
        )

        # If opportunity provided, mark as won
        if crm_opportunity_id:
            # Find closed_won stage
            cur.execute(
                """
                SELECT crm_pipeline_stage_id FROM crm_pipeline_stage
                WHERE tenant_id = %s AND business_id = %s AND key = 'closed_won'
                """,
                (tenant_id, str(business_id)),
            )
            won_stage = cur.fetchone()
            if won_stage:
                cur.execute(
                    """
                    UPDATE crm_opportunity
                    SET status = 'won', crm_pipeline_stage_id = %s
                    WHERE crm_opportunity_id = %s
                    """,
                    (str(won_stage["crm_pipeline_stage_id"]), str(crm_opportunity_id)),
                )

        # Get account name for response
        cur.execute(
            "SELECT name FROM crm_account WHERE crm_account_id = %s",
            (str(crm_account_id),),
        )
        account = cur.fetchone()

    emit_log(
        level="info",
        service="backend",
        action="cro.client.converted",
        message=f"Account {crm_account_id} converted to client",
        context={"client_id": str(client["id"]), "crm_account_id": str(crm_account_id)},
    )

    return {
        **client,
        "company_name": account["name"] if account else "",
        "active_engagements": 0,
        "total_revenue": Decimal("0"),
    }


def list_clients(
    *,
    env_id: str,
    business_id: UUID,
    status: str | None = None,
) -> list[dict]:
    """List clients with engagement and revenue summaries."""
    with get_cursor() as cur:
        sql = """
            SELECT c.id, c.env_id, c.business_id, c.crm_account_id,
                   a.name AS company_name,
                   c.client_status, c.account_owner, c.start_date,
                   c.lifetime_value,
                   COUNT(e.id) FILTER (WHERE e.status = 'active') AS active_engagements,
                   COALESCE(SUM(rs.amount) FILTER (WHERE rs.invoice_status = 'paid'), 0) AS total_revenue,
                   c.created_at
            FROM cro_client c
            JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            LEFT JOIN cro_engagement e ON e.client_id = c.id
            LEFT JOIN cro_revenue_schedule rs ON rs.client_id = c.id
            WHERE c.env_id = %s AND c.business_id = %s
        """
        params: list = [env_id, str(business_id)]

        if status:
            sql += " AND c.client_status = %s"
            params.append(status)

        sql += """
            GROUP BY c.id, c.env_id, c.business_id, c.crm_account_id,
                     a.name, c.client_status, c.account_owner, c.start_date,
                     c.lifetime_value, c.created_at
            ORDER BY c.created_at DESC
        """

        cur.execute(sql, tuple(params))
        return cur.fetchall()


def get_client(*, client_id: UUID) -> dict:
    """Get a single client with summary data."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT c.id, c.env_id, c.business_id, c.crm_account_id,
                   a.name AS company_name,
                   c.client_status, c.account_owner, c.start_date,
                   c.lifetime_value,
                   COUNT(e.id) FILTER (WHERE e.status = 'active') AS active_engagements,
                   COALESCE(SUM(rs.amount) FILTER (WHERE rs.invoice_status = 'paid'), 0) AS total_revenue,
                   c.created_at
            FROM cro_client c
            JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            LEFT JOIN cro_engagement e ON e.client_id = c.id
            LEFT JOIN cro_revenue_schedule rs ON rs.client_id = c.id
            WHERE c.id = %s
            GROUP BY c.id, c.env_id, c.business_id, c.crm_account_id,
                     a.name, c.client_status, c.account_owner, c.start_date,
                     c.lifetime_value, c.created_at
            """,
            (str(client_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Client {client_id} not found")
        return row


def update_client_status(*, client_id: UUID, status: str) -> dict:
    """Update client lifecycle status."""
    valid = {"active", "paused", "churned", "completed"}
    if status not in valid:
        raise ValueError(f"Invalid client status: {status}. Must be one of {valid}")

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_client SET client_status = %s, updated_at = now()
            WHERE id = %s
            RETURNING id, client_status
            """,
            (status, str(client_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Client {client_id} not found")
        return row
