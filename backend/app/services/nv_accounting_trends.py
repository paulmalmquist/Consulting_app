"""Bottom-band trend data: expense-by-category, tooling-spend MoM, cash movement."""
from __future__ import annotations

from typing import Any

from app.services.accounting_fixture_loader import AccountingRepo


_CATEGORY_COLORS = {
    "Software & SaaS": "var(--neon-cyan)",
    "Payroll": "var(--neon-violet)",
    "Travel": "var(--neon-amber)",
    "Rent": "var(--neon-magenta)",
    "Legal & Professional": "var(--sem-down)",
    "Office Supplies": "var(--sem-up)",
    "Meals": "var(--neon-lime)",
    "Revenue": "var(--sem-up)",
}
_FALLBACK_COLOR = "var(--fg-3)"


def expense_by_category(repo: AccountingRepo) -> dict[str, Any]:
    totals: dict[str, float] = {}
    for t in repo.transactions():
        if t["amount"] >= 0:
            continue
        cat = t.get("category") or "Uncategorized"
        if cat == "Revenue":
            continue
        totals[cat] = totals.get(cat, 0.0) + abs(float(t["amount"]))
    grand = sum(totals.values()) or 1.0
    slices = [
        {
            "key": cat.lower().replace(" & ", "-").replace(" ", "-"),
            "label": cat,
            "amount": round(amount, 2),
            "pct": round(amount / grand * 100, 1),
            "color": _CATEGORY_COLORS.get(cat, _FALLBACK_COLOR),
        }
        for cat, amount in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return {"slices": slices, "total_30d": round(grand, 2)}


def tooling_spend_mom(repo: AccountingRepo) -> dict[str, Any]:
    """Simple 6-month software spend series using current-month SaaS transactions + simulated prior."""
    current_saas = sum(
        abs(float(t["amount"]))
        for t in repo.transactions()
        if t["amount"] < 0 and t.get("category") == "Software & SaaS"
    )
    # Pre-canned 5 prior months + live current; scale off current
    base = current_saas or 6000.0
    months = [
        {"label": "Nov", "amount": round(base * 0.72, 2)},
        {"label": "Dec", "amount": round(base * 0.78, 2)},
        {"label": "Jan", "amount": round(base * 0.84, 2)},
        {"label": "Feb", "amount": round(base * 0.91, 2)},
        {"label": "Mar", "amount": round(base * 0.95, 2)},
        {"label": "Apr", "amount": round(current_saas, 2)},
    ]
    prev = months[-2]["amount"] or 1.0
    mom_pct = round((months[-1]["amount"] - prev) / prev * 100, 1)
    summary = f"6 vendors · {len(months)} mo · +1 new this Q"
    return {"months": months, "mom_pct": mom_pct, "summary": summary}


def cash_movement_30d(repo: AccountingRepo) -> dict[str, Any]:
    cm = repo.cash_movement_30d()
    inflow = cm.get("inflow", [])
    outflow = cm.get("outflow", [])
    in_30d = sum(inflow)
    out_30d = sum(outflow)
    return {
        "inflow": inflow,
        "outflow": outflow,
        "net_30d": round(in_30d - out_30d, 2),
        "in_30d": round(in_30d, 2),
        "out_30d": round(out_30d, 2),
        "axis_labels": cm.get("axis_labels", ["", "", ""]),
    }
