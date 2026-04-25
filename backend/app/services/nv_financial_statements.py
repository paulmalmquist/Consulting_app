"""Simple financial statements for Novendor Accounting Command Desk."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from app.db import get_cursor


def _month_starts(n: int) -> list[date]:
    """Last n calendar month start dates, oldest first."""
    today = date.today()
    months = []
    y, m = today.year, today.month
    for _ in range(n):
        months.append(date(y, m, 1))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(months))


def _month_end(d: date) -> date:
    """Last day of d's month."""
    if d.month == 12:
        return date(d.year + 1, 1, 1) - timedelta(days=1)
    return date(d.year, d.month + 1, 1) - timedelta(days=1)


def income_statement(*, env_id: str, business_id: str, months: int = 6) -> dict[str, Any]:
    """Monthly income statement for the last N calendar months."""
    starts = _month_starts(months)
    ends = [_month_end(s) for s in starts]
    labels = [s.strftime("%b") for s in starts]

    revenue: list[float] = [0.0] * months
    total_expenses: list[float] = [0.0] * months
    expenses_by_cat: dict[str, list[float]] = {}

    with get_cursor() as cur:
        # Revenue: sum of payments received per month (paid_at on invoices)
        cur.execute(
            """
            SELECT paid_at::date AS d, SUM(paid_cents) AS total_cents
              FROM nv_invoice
             WHERE env_id = %s AND business_id = %s::uuid
               AND state = 'paid'
               AND paid_at IS NOT NULL
               AND paid_at::date >= %s
               AND paid_at::date <= %s
             GROUP BY d
            """,
            (env_id, business_id, starts[0], ends[-1]),
        )
        for row in cur.fetchall():
            d = row["d"]
            for i, (s, e) in enumerate(zip(starts, ends)):
                if s <= d <= e:
                    revenue[i] += float((row["total_cents"] or 0) / 100)

        # Expenses: outflow transactions grouped by category per month
        cur.execute(
            """
            SELECT posted_at::date AS d,
                   COALESCE(category, 'uncategorized') AS cat,
                   SUM(ABS(amount_cents)) AS total_cents
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid
               AND parent_txn_id IS NULL
               AND amount_cents < 0
               AND posted_at::date >= %s
               AND posted_at::date <= %s
             GROUP BY d, cat
            """,
            (env_id, business_id, starts[0], ends[-1]),
        )
        for row in cur.fetchall():
            d = row["d"]
            cat = row["cat"]
            if cat not in expenses_by_cat:
                expenses_by_cat[cat] = [0.0] * months
            for i, (s, e) in enumerate(zip(starts, ends)):
                if s <= d <= e:
                    amt = float((row["total_cents"] or 0) / 100)
                    expenses_by_cat[cat][i] += amt
                    total_expenses[i] += amt

    net = [revenue[i] - total_expenses[i] for i in range(months)]

    current = {
        "revenue": revenue[-1],
        "expenses": total_expenses[-1],
        "net": net[-1],
    }

    return {
        "months": labels,
        "revenue": revenue,
        "expenses_by_cat": expenses_by_cat,
        "total_expenses": total_expenses,
        "net": net,
        "current_month": current,
    }


def balance_snapshot(*, env_id: str, business_id: str) -> dict[str, Any]:
    """Simple balance sheet snapshot: assets / liabilities / equity."""
    today = date.today()

    with get_cursor() as cur:
        # Cash (bank transactions net)
        cur.execute(
            """
            SELECT COUNT(*) AS txn_count, SUM(amount_cents) AS balance_cents
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid
               AND parent_txn_id IS NULL
            """,
            (env_id, business_id),
        )
        row = cur.fetchone()
        txn_count = int(row["txn_count"] or 0)
        cash = float((row["balance_cents"] or 0) / 100) if txn_count > 0 else None

        # Receivables: unpaid invoice balances
        cur.execute(
            """
            SELECT SUM(amount_cents - COALESCE(paid_cents, 0)) AS receivable_cents
              FROM nv_invoice
             WHERE env_id = %s AND business_id = %s::uuid
               AND state IN ('overdue', 'sent')
            """,
            (env_id, business_id),
        )
        receivables = float((cur.fetchone()["receivable_cents"] or 0) / 100)

        # Liabilities: confirmed expense drafts not yet paid
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total
              FROM nv_expense_draft
             WHERE env_id = %s AND business_id = %s::uuid
               AND status = 'confirmed'
            """,
            (env_id, business_id),
        )
        payables = float(cur.fetchone()["total"] or 0)

    cash_val = cash if cash is not None else 0.0
    total_assets = cash_val + receivables
    total_liabilities = payables
    equity = total_assets - total_liabilities

    return {
        "as_of": today.isoformat(),
        "assets": {
            "cash": cash,
            "cash_status": "live" if txn_count > 0 else "unavailable",
            "cash_unavailable_reason": None if txn_count > 0 else "no_transactions_imported",
            "receivables": receivables,
            "total": total_assets,
        },
        "liabilities": {
            "payables": payables,
            "total": total_liabilities,
        },
        "equity": equity,
    }
