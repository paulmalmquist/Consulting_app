"""Compute the 6 Accounting Command Desk KPI tiles.

Each tile carries a 14-day sparkline + label/value/delta/source. Sources:
- nv_bank_transaction  — cash-in / cash-out daily totals
- nv_invoice           — unpaid outstanding, overdue count
- nv_receipt_review_item — receipts pending review
- nv_bank_transaction  — unreconciled txns
- nv_expense_draft     — reimbursables pending
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from app.db import get_cursor


def _fmt_usdk(n: float) -> str:
    a = abs(n)
    if a >= 1_000_000:
        return f"${n / 1_000_000:.2f}M"
    if a >= 1_000:
        return f"${n / 1_000:.1f}K"
    if n == int(n):
        return f"${int(n):,}"
    return f"${n:,.2f}"


def _daily_buckets(
    *, env_id: str, business_id: str, sign: str, days: int = 14
) -> list[float]:
    """Daily cash-in (positive amounts) or cash-out (abs of negatives) totals."""
    today = date.today()
    start = today - timedelta(days=days - 1)
    where_sign = "amount_cents > 0" if sign == "in" else "amount_cents < 0"
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT posted_at::date AS d,
                   SUM(ABS(amount_cents)) AS total_cents
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid
               AND parent_txn_id IS NULL
               AND {where_sign}
               AND posted_at::date >= %s
               AND posted_at::date <= %s
             GROUP BY d
             ORDER BY d ASC
            """,
            (env_id, business_id, start, today),
        )
        by_date = {r["d"]: float(r["total_cents"] or 0) / 100 for r in cur.fetchall()}
    return [by_date.get(start + timedelta(days=i), 0.0) for i in range(days)]


def _count_daily_bucket_ids(
    *, env_id: str, business_id: str, table: str, date_col: str, where: str, days: int = 14
) -> list[float]:
    today = date.today()
    start = today - timedelta(days=days - 1)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {date_col}::date AS d, COUNT(*) AS n
              FROM {table}
             WHERE env_id = %s AND business_id = %s::uuid
               AND {where}
               AND {date_col}::date >= %s
               AND {date_col}::date <= %s
             GROUP BY d
             ORDER BY d ASC
            """,
            (env_id, business_id, start, today),
        )
        by_date = {r["d"]: float(r["n"] or 0) for r in cur.fetchall()}
    return [by_date.get(start + timedelta(days=i), 0.0) for i in range(days)]


def compute_kpis(*, env_id: str, business_id: str) -> dict[str, Any]:
    today = date.today()
    cutoff_30 = today - timedelta(days=30)
    cutoff_60 = today - timedelta(days=60)

    with get_cursor() as cur:
        # Cash in/out (30-day + prior 30-day)
        cur.execute(
            """
            SELECT
              SUM(CASE WHEN amount_cents > 0 AND posted_at::date >= %s THEN amount_cents END) AS in_30,
              SUM(CASE WHEN amount_cents < 0 AND posted_at::date >= %s THEN ABS(amount_cents) END) AS out_30,
              SUM(CASE WHEN amount_cents > 0 AND posted_at::date >= %s AND posted_at::date < %s THEN amount_cents END) AS in_prev,
              SUM(CASE WHEN amount_cents < 0 AND posted_at::date >= %s AND posted_at::date < %s THEN ABS(amount_cents) END) AS out_prev
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid
               AND parent_txn_id IS NULL
            """,
            (cutoff_30, cutoff_30, cutoff_60, cutoff_30, cutoff_60, cutoff_30, env_id, business_id),
        )
        row = cur.fetchone()
        in_30 = float((row["in_30"] or 0) / 100)
        out_30 = float((row["out_30"] or 0) / 100)
        in_prev = float((row["in_prev"] or 0) / 100)
        out_prev = float((row["out_prev"] or 0) / 100)

        # Invoices: unpaid outstanding + overdue count
        cur.execute(
            """
            SELECT
              SUM(CASE WHEN state IN ('overdue','sent')
                       THEN amount_cents - COALESCE(paid_cents, 0) END) AS unpaid_cents,
              COUNT(*) FILTER (WHERE state = 'overdue') AS overdue_n
              FROM nv_invoice
             WHERE env_id = %s AND business_id = %s::uuid
            """,
            (env_id, business_id),
        )
        row = cur.fetchone()
        unpaid = float((row["unpaid_cents"] or 0) / 100)
        overdue_n = int(row["overdue_n"] or 0)

        # Open review items (receipts needing review)
        cur.execute(
            """
            SELECT COUNT(*) AS n
              FROM nv_receipt_review_item
             WHERE env_id = %s AND business_id = %s::uuid
               AND status = 'open'
               AND reason IN ('low_confidence','apple_ambiguous','uncategorized','price_increased','cadence_changed')
            """,
            (env_id, business_id),
        )
        receipts_review = int(cur.fetchone()["n"] or 0)

        # Unreconciled transactions
        cur.execute(
            """
            SELECT COUNT(*) AS n
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid
               AND parent_txn_id IS NULL
               AND match_state = 'unreviewed'
               AND match_receipt_id IS NULL
               AND match_invoice_id IS NULL
            """,
            (env_id, business_id),
        )
        unrecon = int(cur.fetchone()["n"] or 0)

        # Reimbursable drafts pending
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total,
                   COUNT(*) AS n
              FROM nv_expense_draft
             WHERE env_id = %s AND business_id = %s::uuid
               AND status = 'draft'
            """,
            (env_id, business_id),
        )
        row = cur.fetchone()
        reimburse_total = float(row["total"] or 0)
        reimburse_n = int(row["n"] or 0)

    cash_in_spark = _daily_buckets(env_id=env_id, business_id=business_id, sign="in")
    cash_out_spark = _daily_buckets(env_id=env_id, business_id=business_id, sign="out")
    receipts_spark = _count_daily_bucket_ids(
        env_id=env_id, business_id=business_id,
        table="nv_receipt_review_item", date_col="created_at",
        where="status = 'open'",
    )
    unrecon_spark = _count_daily_bucket_ids(
        env_id=env_id, business_id=business_id,
        table="nv_bank_transaction", date_col="posted_at",
        where=("parent_txn_id IS NULL AND match_state = 'unreviewed' "
               "AND match_receipt_id IS NULL AND match_invoice_id IS NULL"),
    )
    reimburse_spark = _count_daily_bucket_ids(
        env_id=env_id, business_id=business_id,
        table="nv_expense_draft", date_col="created_at",
        where="status = 'draft'",
    )
    unpaid_spark = [unpaid] * 14  # slow-moving; flat line is honest

    def _delta(curr: float, prev: float) -> tuple[str, str]:
        if prev == 0:
            return (f"{_fmt_usdk(curr)} new 30d", "neutral")
        pct = (curr - prev) / prev * 100
        sign = "+" if pct >= 0 else ""
        tone = "up" if pct >= 0 else "down"
        return (f"{sign}{pct:.1f}% vs prior 30d", tone)

    in_delta, in_tone = _delta(in_30, in_prev)
    out_delta, out_tone = _delta(out_30, out_prev)
    # Cash-out growing is "bad" → flip tone
    out_tone = "down" if out_tone == "up" else "up"

    tiles = [
        {
            "key": "cash-in",
            "label": "CASH IN 30D",
            "value": _fmt_usdk(in_30),
            "delta": in_delta,
            "delta_tone": in_tone,
            "source": "stripe · chase",
            "accent": "var(--sem-up)",
            "sparkline": cash_in_spark,
            "spark_color": "var(--sem-up)",
        },
        {
            "key": "cash-out",
            "label": "CASH OUT 30D",
            "value": _fmt_usdk(out_30),
            "delta": out_delta,
            "delta_tone": out_tone,
            "source": "chase · amex",
            "accent": "var(--neon-magenta)",
            "sparkline": cash_out_spark,
            "spark_color": "var(--neon-magenta)",
        },
        {
            "key": "unpaid",
            "label": "UNPAID INVOICES",
            "value": _fmt_usdk(unpaid),
            "delta": f"{overdue_n} overdue",
            "delta_tone": "warn",
            "source": "AR",
            "accent": "var(--neon-amber)",
            "sparkline": unpaid_spark,
            "spark_color": "var(--neon-amber)",
        },
        {
            "key": "receipts",
            "label": "UNREVIEWED RECEIPTS",
            "value": str(receipts_review),
            "delta": "pending review",
            "delta_tone": "neutral",
            "source": "intake",
            "accent": "var(--neon-cyan)",
            "sparkline": receipts_spark,
            "spark_color": "var(--neon-cyan)",
        },
        {
            "key": "unrecon",
            "label": "UNRECONCILED TXNS",
            "value": str(unrecon),
            "delta": "awaiting match",
            "delta_tone": "neutral",
            "source": "plaid",
            "accent": "var(--neon-violet)",
            "sparkline": unrecon_spark,
            "spark_color": "var(--neon-violet)",
        },
        {
            "key": "reimburse",
            "label": "REIMBURSE PENDING",
            "value": _fmt_usdk(reimburse_total),
            "delta": f"{reimburse_n} drafts",
            "delta_tone": "neutral",
            "source": "expenses",
            "accent": "var(--neon-lime)",
            "sparkline": reimburse_spark,
            "spark_color": "var(--neon-lime)",
        },
    ]
    return {"tiles": tiles, "as_of": today.isoformat()}
