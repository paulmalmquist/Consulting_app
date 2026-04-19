"""Build the Needs-Attention queue for the Accounting Command Desk.

Pulls candidate items from receipts (low-conf/unmatched), transactions
(unmatched or uncategorized), invoices (overdue), and expenses (pending
reimbursable), maps them to the ``QueueItemOut`` shape, applies filters, and
scores priority. Counts are computed *before* filters so the view-switcher
badges don't move when a KPI filter toggles on.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from app.services.accounting_fixture_loader import AccountingRepo


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _fmt_date(iso: str) -> str:
    try:
        d = datetime.fromisoformat(iso).date() if " " not in iso else datetime.fromisoformat(iso.replace(" ", "T")).date()
    except ValueError:
        return iso
    return f"{MONTHS[d.month - 1]} {d.day:02d}"


def _age_label(iso: str, as_of: date) -> str:
    try:
        d = datetime.fromisoformat(iso).date() if " " not in iso else datetime.fromisoformat(iso.replace(" ", "T")).date()
    except ValueError:
        return "—"
    delta = (as_of - d).days
    if delta < 0:
        return "—"
    if delta == 0:
        return "today"
    if delta < 1:
        return f"{delta}m"
    if delta == 1:
        return "1d"
    return f"{delta}d"


@dataclass
class QueueFilters:
    entity: str | None = None
    range: str | None = None
    assignee: str | None = None
    unresolved: bool = True
    kpi_filter: str | None = None
    q: str | None = None


def _parse_iso_date(iso: str) -> date | None:
    try:
        return datetime.fromisoformat(iso).date()
    except (TypeError, ValueError):
        return None


def _build_candidates(repo: AccountingRepo, as_of: date) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    # Review receipts (low confidence) and unmatched receipts
    for r in repo.receipts():
        if r.get("state") == "review":
            conf = int(r.get("ocr_confidence") or 0)
            items.append(
                {
                    "id": r["id"],
                    "type": "review-receipt",
                    "date": _fmt_date(r["received_at"]),
                    "time": r["received_at"].split(" ")[1] if " " in r["received_at"] else "—",
                    "amount": float(r["amount"]),
                    "party": r["vendor"],
                    "client": "Internal" if r.get("txn_id") is None else "Matched txn",
                    "state": f"OCR {conf}%",
                    "state_tone": "info" if conf >= 80 else "warn",
                    "age": _age_label(r["received_at"], as_of),
                    "action": "Review parsed receipt",
                    "priority": 3 if conf >= 85 else 2,
                }
            )

    # Unmatched transactions (need match) or uncategorized (need categorize)
    for t in repo.transactions():
        if t.get("state") != "unreviewed":
            continue
        uncat = t.get("category") is None
        hint = t.get("match_hint") or ""
        # Split-needed shows up as categorize with split state
        if hint == "split?":
            items.append(
                {
                    "id": t["id"],
                    "type": "categorize",
                    "date": _fmt_date(t["date"]),
                    "time": t.get("time", "—"),
                    "amount": abs(float(t["amount"])),
                    "party": _extract_party(t["desc"]),
                    "client": "Internal",
                    "state": "Split needed",
                    "state_tone": "warn",
                    "age": _age_label(t["date"], as_of),
                    "action": "Split & categorize",
                    "priority": 2,
                }
            )
            continue
        if not t.get("match_receipt_id") and not t.get("match_invoice_id") and hint != "auto":
            state_label = hint if hint else "Needs match"
            items.append(
                {
                    "id": t["id"],
                    "type": "match-receipt",
                    "date": _fmt_date(t["date"]),
                    "time": t.get("time", "—"),
                    "amount": abs(float(t["amount"])),
                    "party": _extract_party(t["desc"]),
                    "client": "Internal",
                    "state": state_label,
                    "state_tone": "warn",
                    "age": _age_label(t["date"], as_of),
                    "action": "Match receipt → txn",
                    "priority": 2,
                }
            )
            continue
        if uncat:
            items.append(
                {
                    "id": t["id"],
                    "type": "categorize",
                    "date": _fmt_date(t["date"]),
                    "time": t.get("time", "—"),
                    "amount": abs(float(t["amount"])),
                    "party": _extract_party(t["desc"]),
                    "client": "Internal",
                    "state": "Uncategorized",
                    "state_tone": "warn",
                    "age": _age_label(t["date"], as_of),
                    "action": "Categorize charge",
                    "priority": 3,
                }
            )

    # Overdue invoices
    for inv in repo.invoices():
        if inv.get("state") != "overdue":
            continue
        due = _parse_iso_date(inv["due"])
        days_over = max(0, (as_of - due).days) if due else 0
        glow = days_over > 0
        items.append(
            {
                "id": inv["id"],
                "type": "overdue-invoice",
                "date": _fmt_date(inv["issued"]),
                "time": "—",
                "amount": float(inv["amount"]) - float(inv.get("paid") or 0),
                "party": inv["client"],
                "client": inv["client"],
                "state": f"Overdue {days_over}d" if days_over > 0 else "Due today",
                "state_tone": "error" if days_over > 0 else "warn",
                "age": f"{days_over}d",
                "action": "Follow up overdue" if days_over < 10 else "Escalate collections",
                "priority": 1,
                "glow": glow,
            }
        )

    # Pending reimbursable expenses
    for exp in repo.expenses():
        if exp.get("status") != "pending_approval" or not exp.get("reimbursable"):
            continue
        items.append(
            {
                "id": exp["id"],
                "type": "reimbursable",
                "date": _fmt_date(exp["date"]),
                "time": exp.get("time", "09:02"),
                "amount": float(exp["amount"]),
                "party": exp["employee"],
                "client": exp["vendor"],
                "state": "Pending approval",
                "state_tone": "tag",
                "age": _age_label(exp["date"], as_of),
                "action": "Mark reimbursable",
                "priority": 3,
            }
        )

    return items


def _extract_party(desc: str) -> str:
    return desc.split(" · ")[0].split("  ")[0].strip().title()


def _passes_kpi_filter(item: dict[str, Any], kpi: str | None) -> bool:
    if not kpi or kpi == "cash-in" or kpi == "cash-out":
        return True
    if kpi == "unpaid":
        return item["type"] == "overdue-invoice"
    if kpi == "receipts":
        return item["type"] == "review-receipt"
    if kpi == "unrecon":
        return item["type"] in ("match-receipt", "categorize")
    if kpi == "reimburse":
        return item["type"] == "reimbursable"
    return True


def _passes_query(item: dict[str, Any], q: str | None) -> bool:
    if not q:
        return True
    needle = q.lower()
    haystacks = [item.get("party", ""), item.get("client", ""), item.get("action", ""), item.get("id", "")]
    return any(needle in (h or "").lower() for h in haystacks)


def build_queue(repo: AccountingRepo, filters: QueueFilters) -> dict[str, Any]:
    as_of = _parse_iso_date(repo.as_of()) or date.today()
    overrides = repo.queue_overrides()
    all_items = _build_candidates(repo, as_of)
    # Drop items that have been accepted/rejected/deferred (deferred still shown unless unresolved-only)
    def _live(it: dict[str, Any]) -> bool:
        state = overrides.get(it["id"])
        if state in ("accepted", "rejected"):
            return False
        if state == "deferred" and filters.unresolved:
            return False
        return True

    live_items = [i for i in all_items if _live(i)]

    # Counts across ALL views — pre-filter for stability
    counts = {
        "needs": len(live_items),
        "txns": len(repo.transactions()),
        "recs": len(repo.receipts()),
        "invs": len(repo.invoices()),
    }

    # Apply KPI + q filters
    filtered = [i for i in live_items if _passes_kpi_filter(i, filters.kpi_filter) and _passes_query(i, filters.q)]
    filtered.sort(key=lambda i: (i["priority"], -_age_to_sort_key(i["age"])))

    return {"items": filtered, "counts": counts}


def _age_to_sort_key(age: str) -> int:
    if age.endswith("d"):
        try:
            return int(age[:-1]) * 1440
        except ValueError:
            return 0
    if age.endswith("h"):
        try:
            return int(age[:-1]) * 60
        except ValueError:
            return 0
    if age.endswith("m"):
        try:
            return int(age[:-1])
        except ValueError:
            return 0
    if age == "today":
        return 0
    return 0
