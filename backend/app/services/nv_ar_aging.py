"""AR aging service — feeds the Revenue Watch rail module.

Buckets outstanding nv_invoice rows into overdue / upcoming / recent payments,
with per-bucket totals.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from app.db import get_cursor


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _fmt_md(d: date | None) -> str:
    if d is None:
        return "—"
    return f"{MONTHS[d.month - 1]} {d.day:02d}"


def _rel_label(d: date | None, today: date) -> str:
    if d is None:
        return "—"
    delta = (today - d).days
    if delta <= 0:
        return "today"
    if delta < 24 / 24:
        return f"{delta}h"
    return f"{delta}d"


def compute_ar_aging(*, env_id: str, business_id: str) -> dict[str, Any]:
    today = date.today()
    overdue: list[dict[str, Any]] = []
    upcoming: list[dict[str, Any]] = []
    payments: list[dict[str, Any]] = []
    overdue_total = 0.0
    upcoming_total = 0.0
    paid_30d = 0.0
    cutoff_30d = today - timedelta(days=30)

    with get_cursor() as cur:
        # Overdue
        cur.execute(
            """
            SELECT id, invoice_number, client, amount_cents, paid_cents, due_date
              FROM nv_invoice
             WHERE env_id = %s AND business_id = %s::uuid
               AND state IN ('overdue','sent')
               AND due_date <= %s
             ORDER BY due_date ASC
             LIMIT 50
            """,
            (env_id, business_id, today),
        )
        for r in cur.fetchall():
            outstanding = float((int(r["amount_cents"]) - int(r["paid_cents"] or 0)) / 100)
            if outstanding <= 0:
                continue
            days = (today - r["due_date"]).days if r["due_date"] else 0
            overdue_total += outstanding
            overdue.append(
                {
                    "id": str(r["id"]),
                    "invoice_number": r["invoice_number"],
                    "client": r["client"],
                    "amount": outstanding,
                    "days": days,
                    "glow": days > 0,
                }
            )

        # Upcoming (due in the next 60 days, not yet paid)
        cur.execute(
            """
            SELECT id, invoice_number, client, amount_cents, paid_cents, due_date
              FROM nv_invoice
             WHERE env_id = %s AND business_id = %s::uuid
               AND state = 'sent'
               AND due_date > %s
               AND due_date <= %s
             ORDER BY due_date ASC
             LIMIT 50
            """,
            (env_id, business_id, today, today + timedelta(days=60)),
        )
        for r in cur.fetchall():
            outstanding = float((int(r["amount_cents"]) - int(r["paid_cents"] or 0)) / 100)
            if outstanding <= 0:
                continue
            days = (r["due_date"] - today).days if r["due_date"] else 0
            upcoming_total += outstanding
            upcoming.append(
                {
                    "id": str(r["id"]),
                    "invoice_number": r["invoice_number"],
                    "client": r["client"],
                    "amount": outstanding,
                    "due": _fmt_md(r["due_date"]),
                    "days": days,
                }
            )

        # Recent payments (paid in last 30 days)
        cur.execute(
            """
            SELECT id, invoice_number, client, paid_cents, updated_at
              FROM nv_invoice
             WHERE env_id = %s AND business_id = %s::uuid
               AND state = 'paid'
               AND updated_at >= %s
             ORDER BY updated_at DESC
             LIMIT 10
            """,
            (env_id, business_id, cutoff_30d),
        )
        for r in cur.fetchall():
            amt = float(int(r["paid_cents"] or 0) / 100)
            paid_30d += amt
            rel = (
                _rel_label(r["updated_at"].date(), today)
                if r.get("updated_at")
                else "—"
            )
            payments.append(
                {
                    "id": str(r["id"]),
                    "invoice_number": r["invoice_number"],
                    "client": r["client"],
                    "amount": amt,
                    "paid_rel": rel,
                }
            )

    return {
        "overdue": overdue,
        "upcoming": upcoming,
        "payments": payments,
        "overdue_total": round(overdue_total, 2),
        "upcoming_total": round(upcoming_total, 2),
        "paid_30d": round(paid_30d, 2),
    }
