"""Read helpers for the Vultr Cloud Intelligence OS surface.

Every loader is env-scoped — pass `env_id` and never accept a missing one.
Returns plain dicts; the route layer maps to Pydantic. Keep SQL in this module
so service-level callers don't have to think about table names.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from app.db import get_cursor


# ─────────────────────────────────────────────────────────────────────────────
# Static reference data
# ─────────────────────────────────────────────────────────────────────────────

def list_regions(env_id: str) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT region_key, region_name, country, latitude, longitude,
                   data_center_count, power_capacity_mw, tier
              FROM dim_cloud_region
             WHERE env_id = %s
             ORDER BY region_name
            """,
            (env_id,),
        )
        return list(cur.fetchall())


def list_skus(env_id: str) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT sku_key, product_key, display_name, gpu_model, cpu_cores,
                   ram_gb, storage_gb, list_price_per_hour_usd,
                   cost_per_hour_usd, power_w, marked_demo
              FROM dim_cloud_sku
             WHERE env_id = %s
             ORDER BY sku_key
            """,
            (env_id,),
        )
        return list(cur.fetchall())


def list_products(env_id: str) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT product_key, family, display_name, unit_of_measure
              FROM dim_cloud_product
             WHERE env_id = %s
             ORDER BY family, product_key
            """,
            (env_id,),
        )
        return list(cur.fetchall())


# ─────────────────────────────────────────────────────────────────────────────
# Customers
# ─────────────────────────────────────────────────────────────────────────────

def list_customers(env_id: str, limit: int = 200, offset: int = 0) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT customer_id, account_id, parent_account_id, display_name,
                   signup_date, country, segment, salesforce_owner_id,
                   contract_type, account_status, support_tier, kyc_status,
                   risk_flags
              FROM dim_cloud_customer
             WHERE env_id = %s
             ORDER BY display_name
             LIMIT %s OFFSET %s
            """,
            (env_id, limit, offset),
        )
        return list(cur.fetchall())


def get_customer(env_id: str, customer_id: str) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT customer_id, account_id, parent_account_id, display_name,
                   signup_date, country, segment, salesforce_owner_id,
                   contract_type, account_status, support_tier, kyc_status,
                   risk_flags
              FROM dim_cloud_customer
             WHERE env_id = %s AND customer_id = %s
            """,
            (env_id, customer_id),
        )
        return cur.fetchone()


def get_customer_contract(env_id: str, customer_id: str) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT contract_key, customer_id, contract_type,
                   committed_amount_usd, start_date, end_date, discount_pct
              FROM dim_cloud_contract
             WHERE env_id = %s AND customer_id = %s
             ORDER BY start_date DESC
             LIMIT 1
            """,
            (env_id, customer_id),
        )
        return cur.fetchone()


def get_customer_daily_snapshots(
    env_id: str, customer_id: str, days: int = 30
) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT snapshot_date, daily_usage_revenue_usd,
                   daily_recognized_revenue_usd, outstanding_ar_usd,
                   support_tickets_open, churn_risk_score
              FROM fact_cloud_customer_daily_snapshot
             WHERE env_id = %s AND customer_id = %s
               AND snapshot_date >= CURRENT_DATE - INTERVAL '%s days'
             ORDER BY snapshot_date DESC
            """,
            (env_id, customer_id, days),
        )
        return list(cur.fetchall())


def get_customer_invoices(env_id: str, customer_id: str, limit: int = 12) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT invoice_line_id, invoice_key, period_start,
                   invoice_amount_usd, tax_usd, currency, issued_at,
                   paid_at, status
              FROM fact_cloud_invoice
             WHERE env_id = %s AND customer_id = %s
             ORDER BY period_start DESC
             LIMIT %s
            """,
            (env_id, customer_id, limit),
        )
        return list(cur.fetchall())


def get_customer_payments(env_id: str, customer_id: str, limit: int = 12) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT payment_id, invoice_key, paid_at, amount_usd, method
              FROM fact_cloud_payment
             WHERE env_id = %s AND customer_id = %s
             ORDER BY paid_at DESC
             LIMIT %s
            """,
            (env_id, customer_id, limit),
        )
        return list(cur.fetchall())


# ─────────────────────────────────────────────────────────────────────────────
# Reconciliation exceptions
# ─────────────────────────────────────────────────────────────────────────────

def list_exceptions(
    env_id: str,
    *,
    customer_id: str | None = None,
    exception_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    sql = [
        """
        SELECT e.exception_id, e.customer_id, c.display_name AS customer_name,
               e.exception_type, e.severity, e.period_start, e.period_end,
               e.amount_usd, e.detected_at, e.resolved_at, e.notes
          FROM fact_cloud_reconciliation_exception e
          LEFT JOIN dim_cloud_customer c
            ON c.env_id = e.env_id AND c.customer_id = e.customer_id
         WHERE e.env_id = %s
        """
    ]
    params: list[Any] = [env_id]
    if customer_id:
        sql.append("AND e.customer_id = %s")
        params.append(customer_id)
    if exception_type:
        sql.append("AND e.exception_type = %s")
        params.append(exception_type)
    sql.append("ORDER BY e.detected_at DESC NULLS LAST, e.amount_usd DESC")
    sql.append("LIMIT %s OFFSET %s")
    params.extend([limit, offset])

    with get_cursor() as cur:
        cur.execute(" ".join(sql), tuple(params))
        return list(cur.fetchall())


def get_exception(env_id: str, exception_id: str) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT e.exception_id, e.customer_id, c.display_name AS customer_name,
                   e.exception_type, e.severity, e.period_start, e.period_end,
                   e.amount_usd, e.detected_at, e.resolved_at, e.notes
              FROM fact_cloud_reconciliation_exception e
              LEFT JOIN dim_cloud_customer c
                ON c.env_id = e.env_id AND c.customer_id = e.customer_id
             WHERE e.env_id = %s AND e.exception_id = %s
            """,
            (env_id, exception_id),
        )
        return cur.fetchone()


# ─────────────────────────────────────────────────────────────────────────────
# Aggregate fact-table totals
# ─────────────────────────────────────────────────────────────────────────────

def total_platform_usage_usd(env_id: str, period_start: date, period_end: date) -> tuple[Decimal, int]:
    """Sum usage × list_price_per_hour for the period from telemetry."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              COALESCE(SUM(u.usage_quantity * sk.list_price_per_hour_usd), 0) AS amt,
              COUNT(*)                                                         AS n
              FROM fact_cloud_resource_usage_hourly u
              JOIN dim_cloud_sku sk
                ON sk.env_id = u.env_id AND sk.sku_key = u.sku_key
             WHERE u.env_id = %s
               AND u.usage_hour >= %s::timestamptz
               AND u.usage_hour <  (%s::date + INTERVAL '1 day')
            """,
            (env_id, period_start, period_end),
        )
        row = cur.fetchone()
        return Decimal(str(row["amt"] or 0)), int(row["n"] or 0)


def total_rated_billing_usd(env_id: str, period_start: date, period_end: date) -> tuple[Decimal, int]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(rated_amount_usd), 0) AS amt, COUNT(*) AS n
              FROM fact_cloud_billing_line_item
             WHERE env_id = %s
               AND period_start >= %s
               AND period_start <= %s
            """,
            (env_id, period_start, period_end),
        )
        row = cur.fetchone()
        return Decimal(str(row["amt"] or 0)), int(row["n"] or 0)


def total_invoiced_usd(env_id: str, period_start: date, period_end: date) -> tuple[Decimal, int]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(invoice_amount_usd), 0) AS amt, COUNT(*) AS n
              FROM fact_cloud_invoice
             WHERE env_id = %s
               AND period_start >= %s
               AND period_start <= %s
            """,
            (env_id, period_start, period_end),
        )
        row = cur.fetchone()
        return Decimal(str(row["amt"] or 0)), int(row["n"] or 0)


def total_recognized_revenue_usd(
    env_id: str, period_start: date, period_end: date
) -> tuple[Decimal, int]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(recognized_revenue_usd), 0) AS amt, COUNT(*) AS n
              FROM fact_cloud_revenue_recognition
             WHERE env_id = %s
               AND period_month >= %s
               AND period_month <= %s
            """,
            (env_id, period_start, period_end),
        )
        row = cur.fetchone()
        return Decimal(str(row["amt"] or 0)), int(row["n"] or 0)


def total_collected_cash_usd(env_id: str, period_start: date, period_end: date) -> tuple[Decimal, int]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(amount_usd), 0) AS amt, COUNT(*) AS n
              FROM fact_cloud_payment
             WHERE env_id = %s
               AND paid_at >= %s::timestamptz
               AND paid_at <  (%s::date + INTERVAL '1 day')
            """,
            (env_id, period_start, period_end),
        )
        row = cur.fetchone()
        return Decimal(str(row["amt"] or 0)), int(row["n"] or 0)


def total_committed_usd(env_id: str, period_start: date, period_end: date) -> tuple[Decimal, int]:
    """Pro-rated committed amount for active contracts during the period."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(committed_amount_usd), 0) AS amt, COUNT(*) AS n
              FROM dim_cloud_contract
             WHERE env_id = %s
               AND start_date <= %s
               AND end_date   >= %s
            """,
            (env_id, period_end, period_start),
        )
        row = cur.fetchone()
        return Decimal(str(row["amt"] or 0)), int(row["n"] or 0)


# ─────────────────────────────────────────────────────────────────────────────
# Sales pipeline / support / incidents
# ─────────────────────────────────────────────────────────────────────────────

def list_pipeline(env_id: str, *, snapshot_date: date | None = None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        if snapshot_date is None:
            cur.execute(
                """
                SELECT MAX(snapshot_date) AS d
                  FROM fact_cloud_sales_pipeline
                 WHERE env_id = %s
                """,
                (env_id,),
            )
            snapshot_date = (cur.fetchone() or {}).get("d")
        if snapshot_date is None:
            return []
        cur.execute(
            """
            SELECT p.opportunity_id, p.customer_id, c.display_name AS customer_name,
                   p.rep_key, p.stage, p.amount_usd, p.close_probability,
                   p.expected_close_date, p.committed_capacity_usd, p.lost_reason
              FROM fact_cloud_sales_pipeline p
              LEFT JOIN dim_cloud_customer c
                ON c.env_id = p.env_id AND c.customer_id = p.customer_id
             WHERE p.env_id = %s AND p.snapshot_date = %s
             ORDER BY p.amount_usd DESC
            """,
            (env_id, snapshot_date),
        )
        return list(cur.fetchall())


def list_recent_tickets(env_id: str, *, days: int = 30, limit: int = 200) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ticket_id, customer_id, category_key, opened_at, resolved_at,
                   severity, sla_breached, region_key, sku_key, customer_satisfaction
              FROM fact_cloud_support_ticket
             WHERE env_id = %s
               AND opened_at >= now() - (%s || ' days')::interval
             ORDER BY opened_at DESC
             LIMIT %s
            """,
            (env_id, days, limit),
        )
        return list(cur.fetchall())


def list_incidents(env_id: str, *, days: int = 90) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT incident_id, region_key, sku_key, started_at, resolved_at,
                   severity, customers_impacted, root_cause
              FROM fact_cloud_incident
             WHERE env_id = %s
               AND started_at >= now() - (%s || ' days')::interval
             ORDER BY started_at DESC
            """,
            (env_id, days),
        )
        return list(cur.fetchall())


# ─────────────────────────────────────────────────────────────────────────────
# Source freshness
# ─────────────────────────────────────────────────────────────────────────────

def latest_source_timestamps(env_id: str) -> dict[str, datetime | None]:
    """Return the most-recent observed timestamp per source system across facts.

    Each fact table exposes a different "as-of" column; we coalesce to a single
    bucket per source for the freshness check. Date-only columns are cast to
    timestamptz at midnight UTC.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT 'usage'    AS src, MAX(source_updated_at)                         AS last_at FROM fact_cloud_resource_usage_hourly WHERE env_id = %(e)s
            UNION ALL SELECT 'billing',  MAX((period_end::timestamptz))              FROM fact_cloud_billing_line_item   WHERE env_id = %(e)s
            UNION ALL SELECT 'invoice',  MAX(issued_at)                               FROM fact_cloud_invoice             WHERE env_id = %(e)s
            UNION ALL SELECT 'payment',  MAX(paid_at)                                 FROM fact_cloud_payment             WHERE env_id = %(e)s
            UNION ALL SELECT 'revrec',   MAX(period_month::timestamptz)               FROM fact_cloud_revenue_recognition WHERE env_id = %(e)s
            UNION ALL SELECT 'support',  MAX(opened_at)                               FROM fact_cloud_support_ticket      WHERE env_id = %(e)s
            UNION ALL SELECT 'pipeline', MAX(snapshot_date::timestamptz)              FROM fact_cloud_sales_pipeline      WHERE env_id = %(e)s
            """,
            {"e": env_id},
        )
        return {row["src"]: row["last_at"] for row in cur.fetchall()}


# ─────────────────────────────────────────────────────────────────────────────
# Period helpers
# ─────────────────────────────────────────────────────────────────────────────

def period_bounds(period: str, *, today: date | None = None) -> tuple[date, date]:
    """Convert a period code to (start, end) dates inclusive.

    Periods: 7D, 30D, 90D, MTD, QTD, YTD.
    """
    today = today or date.today()
    if period == "7D":
        return today - timedelta(days=6), today
    if period == "30D":
        return today - timedelta(days=29), today
    if period == "90D":
        return today - timedelta(days=89), today
    if period == "MTD":
        return today.replace(day=1), today
    if period == "QTD":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        return date(today.year, q_start_month, 1), today
    if period == "YTD":
        return date(today.year, 1, 1), today
    raise ValueError(f"unknown period code: {period}")
