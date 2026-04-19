"""Compute the 6 Accounting Command Desk KPI tiles.

Each tile carries a 14-point sparkline plus label/value/delta/source, shaped
for ``KPIBarOut``. Source of truth for the numbers is the seed fixture; the
sparkline series are pre-canned so demo data stays stable across reloads.
"""
from __future__ import annotations

from typing import Any

from app.services.accounting_fixture_loader import AccountingRepo


def _fmt_usdk(n: float) -> str:
    a = abs(n)
    if a >= 1_000_000:
        return f"${n / 1_000_000:.2f}M"
    if a >= 1_000:
        return f"${n / 1_000:.1f}K"
    if n == int(n):
        return f"${int(n):,}"
    return f"${n:,.2f}"


def compute_kpis(repo: AccountingRepo) -> dict[str, Any]:
    txns = repo.transactions()
    receipts = repo.receipts()
    invoices = repo.invoices()
    expenses = repo.expenses()
    sparks = repo.kpi_sparklines()

    cash_in_30d = sum(t["amount"] for t in txns if t["amount"] > 0)
    cash_out_30d = sum(-t["amount"] for t in txns if t["amount"] < 0)
    unpaid = sum(
        (inv["amount"] - inv.get("paid", 0))
        for inv in invoices
        if inv["state"] in ("overdue", "sent")
    )
    unreviewed_receipts = sum(1 for r in receipts if r["state"] == "review")
    unreconciled_txns = sum(
        1
        for t in txns
        if t["state"] == "unreviewed"
        and not t.get("match_receipt_id")
        and not t.get("match_invoice_id")
    )
    reimbursable_pending = sum(
        e["amount"] for e in expenses if e["status"] == "pending_approval" and e.get("reimbursable")
    )

    tiles = [
        {
            "key": "cash-in",
            "label": "CASH IN 30D",
            "value": _fmt_usdk(cash_in_30d),
            "delta": "+$46.6K vs last 30",
            "delta_tone": "up",
            "source": "stripe · chase",
            "accent": "var(--sem-up)",
            "sparkline": sparks.get("cash_in", []),
            "spark_color": "var(--sem-up)",
        },
        {
            "key": "cash-out",
            "label": "CASH OUT 30D",
            "value": _fmt_usdk(cash_out_30d),
            "delta": "+8.4% vs last 30",
            "delta_tone": "down",
            "source": "chase · amex",
            "accent": "var(--neon-magenta)",
            "sparkline": sparks.get("cash_out", []),
            "spark_color": "var(--neon-magenta)",
        },
        {
            "key": "unpaid",
            "label": "UNPAID INVOICES",
            "value": _fmt_usdk(unpaid),
            "delta": f"{sum(1 for inv in invoices if inv['state'] == 'overdue')} overdue",
            "delta_tone": "warn",
            "source": "AR",
            "accent": "var(--neon-amber)",
            "sparkline": sparks.get("unpaid", []),
            "spark_color": "var(--neon-amber)",
        },
        {
            "key": "receipts",
            "label": "UNREVIEWED RECEIPTS",
            "value": str(unreviewed_receipts),
            "delta": "intake last 24h",
            "delta_tone": "neutral",
            "source": "intake",
            "accent": "var(--neon-cyan)",
            "sparkline": sparks.get("receipts", []),
            "spark_color": "var(--neon-cyan)",
        },
        {
            "key": "unrecon",
            "label": "UNRECONCILED TXNS",
            "value": str(unreconciled_txns),
            "delta": "awaiting match",
            "delta_tone": "neutral",
            "source": "plaid",
            "accent": "var(--neon-violet)",
            "sparkline": sparks.get("unrecon", []),
            "spark_color": "var(--neon-violet)",
        },
        {
            "key": "reimburse",
            "label": "REIMBURSE PENDING",
            "value": _fmt_usdk(reimbursable_pending),
            "delta": "approvals due",
            "delta_tone": "neutral",
            "source": "expenses",
            "accent": "var(--neon-lime)",
            "sparkline": sparks.get("reimburse", []),
            "spark_color": "var(--neon-lime)",
        },
    ]
    return {"tiles": tiles, "as_of": repo.as_of()}
