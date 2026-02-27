"""Consulting Revenue OS – Revenue schedule service.

Revenue schedule CRUD, invoice status management, and revenue summaries (MTD/QTD/YTD).
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def create_revenue_entries(
    *,
    env_id: str,
    business_id: UUID,
    entries: list[dict],
) -> list[dict]:
    """Bulk-create revenue schedule entries."""
    results = []
    with get_cursor() as cur:
        for entry in entries:
            cur.execute(
                """
                INSERT INTO cro_revenue_schedule
                  (env_id, business_id, engagement_id, client_id, period_date, amount, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, engagement_id, client_id, period_date, amount, currency,
                          invoice_status, invoiced_at, paid_at, notes, created_at
                """,
                (
                    env_id, str(business_id),
                    str(entry["engagement_id"]),
                    str(entry["client_id"]),
                    entry["period_date"],
                    str(entry["amount"]),
                    entry.get("notes"),
                ),
            )
            results.append(cur.fetchone())

    emit_log(
        level="info",
        service="backend",
        action="cro.revenue.entries_created",
        message=f"Created {len(results)} revenue entries",
        context={"count": len(results)},
    )
    return results


def list_revenue_entries(
    *,
    env_id: str,
    business_id: UUID,
    client_id: UUID | None = None,
    engagement_id: UUID | None = None,
    invoice_status: str | None = None,
) -> list[dict]:
    """List revenue schedule entries with optional filters."""
    with get_cursor() as cur:
        sql = """
            SELECT id, engagement_id, client_id, period_date, amount, currency,
                   invoice_status, invoiced_at, paid_at, notes, created_at
            FROM cro_revenue_schedule
            WHERE env_id = %s AND business_id = %s
        """
        params: list = [env_id, str(business_id)]

        if client_id:
            sql += " AND client_id = %s"
            params.append(str(client_id))

        if engagement_id:
            sql += " AND engagement_id = %s"
            params.append(str(engagement_id))

        if invoice_status:
            sql += " AND invoice_status = %s"
            params.append(invoice_status)

        sql += " ORDER BY period_date DESC"
        cur.execute(sql, tuple(params))
        return cur.fetchall()


def update_invoice_status(
    *,
    entry_id: UUID,
    invoice_status: str,
) -> dict:
    """Update invoice status for a revenue entry."""
    now = datetime.now(timezone.utc)

    with get_cursor() as cur:
        set_parts = ["invoice_status = %s", "updated_at = %s"]
        params: list = [invoice_status, now]

        if invoice_status == "invoiced":
            set_parts.append("invoiced_at = %s")
            params.append(now)
        elif invoice_status == "paid":
            set_parts.append("paid_at = %s")
            params.append(now)

        params.append(str(entry_id))

        cur.execute(
            f"""
            UPDATE cro_revenue_schedule
            SET {', '.join(set_parts)}
            WHERE id = %s
            RETURNING id, invoice_status, invoiced_at, paid_at
            """,
            tuple(params),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Revenue entry {entry_id} not found")
        return row


def get_revenue_summary(*, env_id: str, business_id: UUID) -> dict:
    """Compute revenue summary: MTD, QTD, YTD, scheduled next 30d, overdue."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                COALESCE(SUM(amount) FILTER (
                    WHERE invoice_status = 'paid'
                      AND paid_at >= date_trunc('month', CURRENT_DATE)
                ), 0) AS revenue_mtd,
                COALESCE(SUM(amount) FILTER (
                    WHERE invoice_status = 'paid'
                      AND paid_at >= date_trunc('quarter', CURRENT_DATE)
                ), 0) AS revenue_qtd,
                COALESCE(SUM(amount) FILTER (
                    WHERE invoice_status = 'paid'
                      AND paid_at >= date_trunc('year', CURRENT_DATE)
                ), 0) AS revenue_ytd,
                COALESCE(SUM(amount) FILTER (
                    WHERE invoice_status = 'scheduled'
                      AND period_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '30 days'
                ), 0) AS scheduled_next_30d,
                COALESCE(SUM(amount) FILTER (
                    WHERE invoice_status = 'overdue'
                ), 0) AS overdue
            FROM cro_revenue_schedule
            WHERE env_id = %s AND business_id = %s
            """,
            (env_id, str(business_id)),
        )
        return cur.fetchone()
