"""Bottom-band trend data for the Accounting Command Desk.

- Expense by category: 30-day outflow, grouped by category
- Cash movement: 30-day daily inflow + outflow
- Tooling spend MoM: delegated to receipt_reports.tooling_spend_mom
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from app.db import get_cursor


_CATEGORY_COLORS = {
    "Software & SaaS": "var(--neon-cyan)",
    "AI tools": "var(--neon-cyan)",
    "Payroll": "var(--neon-violet)",
    "Travel": "var(--neon-amber)",
    "Rent": "var(--neon-magenta)",
    "Legal & Professional": "var(--sem-down)",
    "Office Supplies": "var(--sem-up)",
    "Meals": "var(--neon-lime)",
    "Developer tools": "var(--neon-cyan)",
    "Productivity": "var(--sem-up)",
    "Cloud / Storage": "var(--neon-cyan)",
    "Media": "var(--neon-violet)",
    "Security": "var(--neon-amber)",
    "Uncategorized": "var(--fg-3)",
}
_FALLBACK = "var(--fg-3)"


def expense_by_category(*, env_id: str, business_id: str) -> dict[str, Any]:
    cutoff = date.today() - timedelta(days=30)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(category, 'Uncategorized') AS cat,
                   SUM(ABS(amount_cents)) AS total_cents
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid
               AND parent_txn_id IS NULL
               AND amount_cents < 0
               AND posted_at::date >= %s
             GROUP BY cat
             ORDER BY total_cents DESC
            """,
            (env_id, business_id, cutoff),
        )
        rows = cur.fetchall()
    total = sum(float(r["total_cents"] or 0) / 100 for r in rows) or 1.0
    slices = []
    for r in rows:
        amt = float(r["total_cents"] or 0) / 100
        cat = r["cat"] or "Uncategorized"
        slices.append({
            "key": cat.lower().replace(" & ", "-").replace(" / ", "-").replace(" ", "-"),
            "label": cat,
            "amount": round(amt, 2),
            "pct": round(amt / total * 100, 1),
            "color": _CATEGORY_COLORS.get(cat, _FALLBACK),
        })
    return {"slices": slices, "total_30d": round(total, 2)}


def cash_movement_30d(*, env_id: str, business_id: str) -> dict[str, Any]:
    today = date.today()
    start = today - timedelta(days=29)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT posted_at::date AS d,
                   SUM(CASE WHEN amount_cents > 0 THEN amount_cents END) AS in_cents,
                   SUM(CASE WHEN amount_cents < 0 THEN ABS(amount_cents) END) AS out_cents
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid
               AND parent_txn_id IS NULL
               AND posted_at::date >= %s
             GROUP BY d
             ORDER BY d ASC
            """,
            (env_id, business_id, start),
        )
        by_date = {r["d"]: (float(r["in_cents"] or 0) / 100, float(r["out_cents"] or 0) / 100)
                   for r in cur.fetchall()}
    inflow: list[float] = []
    outflow: list[float] = []
    for i in range(30):
        d = start + timedelta(days=i)
        inc, outc = by_date.get(d, (0.0, 0.0))
        inflow.append(inc)
        outflow.append(outc)

    MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    def _lbl(d: date) -> str:
        return f"{MONTHS[d.month - 1]} {d.day:02d}"

    in_30d = sum(inflow)
    out_30d = sum(outflow)
    return {
        "inflow": inflow,
        "outflow": outflow,
        "net_30d": round(in_30d - out_30d, 2),
        "in_30d": round(in_30d, 2),
        "out_30d": round(out_30d, 2),
        "axis_labels": [_lbl(start), _lbl(start + timedelta(days=14)), _lbl(today)],
    }
