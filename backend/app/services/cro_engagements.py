"""Consulting Revenue OS – Engagement service.

Engagement CRUD, delivery tracking, and completion with margin computation.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def create_engagement(
    *,
    env_id: str,
    business_id: UUID,
    client_id: UUID,
    name: str,
    engagement_type: str,
    budget: Decimal = Decimal("0"),
    start_date: date | None = None,
    end_date: date | None = None,
    notes: str | None = None,
) -> dict:
    """Create a new engagement for a client."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_engagement
              (env_id, business_id, client_id, name, engagement_type,
               budget, start_date, end_date, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, client_id, name, engagement_type,
                      status, start_date, end_date, budget, actual_spend,
                      margin_pct, notes, created_at
            """,
            (
                env_id, str(business_id), str(client_id), name, engagement_type,
                str(budget), start_date, end_date, notes,
            ),
        )
        row = cur.fetchone()

    emit_log(
        level="info",
        service="backend",
        action="cro.engagement.created",
        message=f"Engagement created: {name}",
        context={"engagement_id": str(row["id"]), "client_id": str(client_id)},
    )
    return row


def list_engagements(
    *,
    env_id: str,
    business_id: UUID,
    client_id: UUID | None = None,
    status: str | None = None,
) -> list[dict]:
    """List engagements with optional client/status filter."""
    with get_cursor() as cur:
        sql = """
            SELECT id, env_id, business_id, client_id, name, engagement_type,
                   status, start_date, end_date, budget, actual_spend,
                   margin_pct, notes, created_at
            FROM cro_engagement
            WHERE env_id = %s AND business_id = %s
        """
        params: list = [env_id, str(business_id)]

        if client_id:
            sql += " AND client_id = %s"
            params.append(str(client_id))

        if status:
            sql += " AND status = %s"
            params.append(status)

        sql += " ORDER BY created_at DESC"
        cur.execute(sql, tuple(params))
        return cur.fetchall()


def get_engagement(*, engagement_id: UUID) -> dict:
    """Get a single engagement by ID."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, env_id, business_id, client_id, name, engagement_type,
                   status, start_date, end_date, budget, actual_spend,
                   margin_pct, notes, created_at
            FROM cro_engagement WHERE id = %s
            """,
            (str(engagement_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Engagement {engagement_id} not found")
        return row


def update_engagement_spend(*, engagement_id: UUID, actual_spend: Decimal) -> dict:
    """Update actual spend and recompute margin."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT budget FROM cro_engagement WHERE id = %s",
            (str(engagement_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Engagement {engagement_id} not found")

        budget = Decimal(str(row["budget"]))
        margin = None
        if budget > 0:
            margin = round((budget - actual_spend) / budget, 4)

        cur.execute(
            """
            UPDATE cro_engagement
            SET actual_spend = %s, margin_pct = %s, updated_at = now()
            WHERE id = %s
            RETURNING id, budget, actual_spend, margin_pct, status
            """,
            (str(actual_spend), str(margin) if margin is not None else None, str(engagement_id)),
        )
        return cur.fetchone()


def complete_engagement(*, engagement_id: UUID) -> dict:
    """Mark an engagement as completed and finalize margin."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_engagement
            SET status = 'completed', end_date = COALESCE(end_date, CURRENT_DATE), updated_at = now()
            WHERE id = %s
            RETURNING id, status, end_date, budget, actual_spend, margin_pct
            """,
            (str(engagement_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Engagement {engagement_id} not found")
        return row
