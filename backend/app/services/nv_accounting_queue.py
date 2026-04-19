"""Unified Needs-Attention queue for the Accounting Command Desk.

Joins items from four sources:
- nv_receipt_review_item (status='open') — review queue from the receipt stack
- nv_bank_transaction (unreviewed / needs categorize or match)
- nv_invoice (overdue)
- nv_expense_draft (reimbursable, status='draft', not yet linked)

Applies filters (entity/range/assignee/unresolved/kpi_filter/q), scores
priority, sorts. Counts are computed pre-filter so the view-switcher badges
don't move when a KPI filter toggles on.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from app.db import get_cursor


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@dataclass
class QueueFilters:
    unresolved: bool = True
    kpi_filter: str | None = None
    q: str | None = None


def _fmt_md(d: date | None) -> str:
    if d is None:
        return "—"
    return f"{MONTHS[d.month - 1]} {d.day:02d}"


def _age_from(d: date | datetime | None, today: date) -> str:
    if d is None:
        return "—"
    if isinstance(d, datetime):
        d = d.date()
    delta = (today - d).days
    if delta <= 0:
        return "today"
    if delta < 60 / 1440:
        return f"{int(delta * 1440)}m"
    if delta < 1:
        return f"{int(delta * 24)}h"
    return f"{delta}d"


def _extract_party(desc: str) -> str:
    return (desc or "").split(" · ")[0].split("  ")[0].strip().title() or "—"


def _collect_review_items(env_id: str, business_id: str, today: date) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ri.id, ri.intake_id, ri.reason, ri.next_action, ri.created_at,
                   p.merchant_raw, p.vendor_normalized, p.service_name_guess,
                   p.total, p.currency, p.transaction_date,
                   p.confidence_overall,
                   i.original_filename
              FROM nv_receipt_review_item ri
              JOIN nv_receipt_intake i ON i.id = ri.intake_id
         LEFT JOIN LATERAL (
                   SELECT merchant_raw, vendor_normalized, service_name_guess,
                          total, currency, transaction_date, confidence_overall
                     FROM nv_receipt_parse_result
                    WHERE intake_id = ri.intake_id
                    ORDER BY created_at DESC LIMIT 1
                ) p ON true
             WHERE ri.env_id = %s AND ri.business_id = %s::uuid
               AND ri.status = 'open'
             ORDER BY ri.created_at DESC
             LIMIT 200
            """,
            (env_id, business_id),
        )
        for r in cur.fetchall():
            reason = r["reason"]
            conf = float(r.get("confidence_overall") or 0)
            vendor = r.get("vendor_normalized") or r.get("service_name_guess") or r.get("merchant_raw") or "Unknown"
            total = float(r.get("total") or 0)
            txn_date = r.get("transaction_date")
            age = _age_from(txn_date, today)
            # Map review reason → queue item type
            if reason == "apple_ambiguous":
                qtype = "review-receipt"
                state = "Apple ambiguous"
                state_tone = "warn"
                action = r.get("next_action") or "Confirm underlying vendor"
                priority = 2
            elif reason == "low_confidence":
                qtype = "review-receipt"
                state = f"OCR {int(conf * 100)}%" if conf else "Low confidence"
                state_tone = "warn"
                action = r.get("next_action") or "Review parsed receipt"
                priority = 2
            elif reason == "uncategorized":
                qtype = "categorize"
                state = "Uncategorized"
                state_tone = "warn"
                action = r.get("next_action") or "Categorize charge"
                priority = 3
            elif reason in ("price_increased", "cadence_changed"):
                qtype = "review-receipt"
                state = reason.replace("_", " ")
                state_tone = "warn"
                action = r.get("next_action") or "Review subscription change"
                priority = 2
            elif reason == "unmatched":
                qtype = "match-receipt"
                state = "Needs match"
                state_tone = "warn"
                action = r.get("next_action") or "Match receipt → txn"
                priority = 2
            else:
                qtype = "review-receipt"
                state = reason.replace("_", " ")
                state_tone = "info"
                action = r.get("next_action") or "Review"
                priority = 3
            items.append({
                "id": f"RI-{r['id']}",
                "type": qtype,
                "date": _fmt_md(txn_date),
                "time": "—",
                "amount": abs(total),
                "party": vendor,
                "client": "Internal",
                "state": state,
                "state_tone": state_tone,
                "age": age,
                "action": action,
                "priority": priority,
                "glow": False,
                "source_intake_id": str(r["intake_id"]) if r.get("intake_id") else None,
                "source_review_item_id": str(r["id"]),
                "source_txn_id": None,
                "source_invoice_id": None,
                "source_expense_draft_id": None,
            })
    return items


def _collect_transactions(env_id: str, business_id: str, today: date) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, posted_at, description, amount_cents, category,
                   match_state, match_hint
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid
               AND parent_txn_id IS NULL
               AND match_state = 'unreviewed'
             ORDER BY posted_at DESC
             LIMIT 100
            """,
            (env_id, business_id),
        )
        for r in cur.fetchall():
            amount = abs(float(r["amount_cents"] / 100))
            posted = r["posted_at"]
            date_label = _fmt_md(posted.date() if posted else None)
            time_label = posted.strftime("%H:%M") if posted else "—"
            age = _age_from(posted, today)
            hint = r.get("match_hint") or ""
            uncat = r.get("category") is None
            if hint == "split?":
                items.append({
                    "id": f"T-{r['id']}",
                    "type": "categorize",
                    "date": date_label,
                    "time": time_label,
                    "amount": amount,
                    "party": _extract_party(r["description"]),
                    "client": "Internal",
                    "state": "Split needed",
                    "state_tone": "warn",
                    "age": age,
                    "action": "Split & categorize",
                    "priority": 2,
                    "glow": False,
                    "source_intake_id": None,
                    "source_review_item_id": None,
                    "source_txn_id": str(r["id"]),
                    "source_invoice_id": None,
                    "source_expense_draft_id": None,
                })
                continue
            if uncat:
                items.append({
                    "id": f"T-{r['id']}",
                    "type": "categorize",
                    "date": date_label,
                    "time": time_label,
                    "amount": amount,
                    "party": _extract_party(r["description"]),
                    "client": "Internal",
                    "state": "Uncategorized",
                    "state_tone": "warn",
                    "age": age,
                    "action": "Categorize charge",
                    "priority": 3,
                    "glow": False,
                    "source_intake_id": None,
                    "source_review_item_id": None,
                    "source_txn_id": str(r["id"]),
                    "source_invoice_id": None,
                    "source_expense_draft_id": None,
                })
            else:
                items.append({
                    "id": f"T-{r['id']}",
                    "type": "match-receipt",
                    "date": date_label,
                    "time": time_label,
                    "amount": amount,
                    "party": _extract_party(r["description"]),
                    "client": "Internal",
                    "state": hint or "Needs match",
                    "state_tone": "warn",
                    "age": age,
                    "action": "Match receipt → txn",
                    "priority": 2,
                    "glow": False,
                    "source_intake_id": None,
                    "source_review_item_id": None,
                    "source_txn_id": str(r["id"]),
                    "source_invoice_id": None,
                    "source_expense_draft_id": None,
                })
    return items


def _collect_invoices(env_id: str, business_id: str, today: date) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, invoice_number, client, issued_date, due_date,
                   amount_cents, paid_cents
              FROM nv_invoice
             WHERE env_id = %s AND business_id = %s::uuid
               AND state = 'overdue'
             ORDER BY due_date ASC
             LIMIT 50
            """,
            (env_id, business_id),
        )
        for r in cur.fetchall():
            outstanding = float((int(r["amount_cents"]) - int(r["paid_cents"] or 0)) / 100)
            if outstanding <= 0:
                continue
            days = (today - r["due_date"]).days if r["due_date"] else 0
            action = "Follow up overdue" if days < 10 else "Escalate collections"
            items.append({
                "id": f"INV-{r['id']}",
                "type": "overdue-invoice",
                "date": _fmt_md(r["issued_date"]),
                "time": "—",
                "amount": outstanding,
                "party": r["client"],
                "client": r["client"],
                "state": f"Overdue {days}d" if days > 0 else "Due today",
                "state_tone": "error" if days > 0 else "warn",
                "age": f"{days}d",
                "action": action,
                "priority": 1,
                "glow": days > 0,
                "source_intake_id": None,
                "source_review_item_id": None,
                "source_txn_id": None,
                "source_invoice_id": str(r["id"]),
                "source_expense_draft_id": None,
            })
    return items


def _collect_reimbursables(env_id: str, business_id: str, today: date) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, vendor_normalized, service_name, category, amount,
                   transaction_date, entity_linkage, status
              FROM nv_expense_draft
             WHERE env_id = %s AND business_id = %s::uuid
               AND status = 'draft'
               AND entity_linkage IN ('client_engagement','novendor_ops','winston','research','product','marketing')
             ORDER BY transaction_date DESC NULLS LAST, created_at DESC
             LIMIT 100
            """,
            (env_id, business_id),
        )
        for r in cur.fetchall():
            txn_date = r.get("transaction_date")
            items.append({
                "id": f"EXP-{r['id']}",
                "type": "reimbursable",
                "date": _fmt_md(txn_date),
                "time": "—",
                "amount": float(r.get("amount") or 0),
                "party": r.get("vendor_normalized") or r.get("service_name") or "Unknown",
                "client": (r.get("entity_linkage") or "internal").replace("_", " ").title(),
                "state": "Pending approval",
                "state_tone": "tag",
                "age": _age_from(txn_date, today),
                "action": "Mark reimbursable",
                "priority": 3,
                "glow": False,
                "source_intake_id": None,
                "source_review_item_id": None,
                "source_txn_id": None,
                "source_invoice_id": None,
                "source_expense_draft_id": str(r["id"]),
            })
    return items


def _passes_kpi_filter(item: dict[str, Any], kpi: str | None) -> bool:
    if not kpi or kpi in ("cash-in", "cash-out"):
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
    return any(needle in str(item.get(k, "")).lower() for k in ("party", "client", "action", "id"))


def _counts(env_id: str, business_id: str) -> dict[str, int]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM nv_bank_transaction
                 WHERE env_id = %s AND business_id = %s::uuid AND parent_txn_id IS NULL) AS txns,
              (SELECT COUNT(*) FROM nv_receipt_intake
                 WHERE env_id = %s AND business_id = %s::uuid) AS recs,
              (SELECT COUNT(*) FROM nv_invoice
                 WHERE env_id = %s AND business_id = %s::uuid) AS invs,
              (SELECT COUNT(*) FROM nv_subscription_ledger
                 WHERE env_id = %s AND business_id = %s::uuid AND is_active) AS subs
            """,
            (env_id, business_id, env_id, business_id, env_id, business_id, env_id, business_id),
        )
        row = cur.fetchone()
    return {
        "txns": int(row["txns"] or 0),
        "recs": int(row["recs"] or 0),
        "invs": int(row["invs"] or 0),
        "subs": int(row["subs"] or 0),
    }


def _age_sort_key(age: str) -> int:
    if not age or age == "—":
        return 0
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
    return 0


def build_queue(
    *,
    env_id: str,
    business_id: str,
    filters: QueueFilters | None = None,
) -> dict[str, Any]:
    filters = filters or QueueFilters()
    today = date.today()

    review = _collect_review_items(env_id, business_id, today)
    txns = _collect_transactions(env_id, business_id, today)
    invoices = _collect_invoices(env_id, business_id, today)
    reimbursables = _collect_reimbursables(env_id, business_id, today)

    all_items = [*review, *txns, *invoices, *reimbursables]

    counts = _counts(env_id, business_id)
    counts["needs"] = len(all_items)

    filtered = [
        it for it in all_items
        if _passes_kpi_filter(it, filters.kpi_filter) and _passes_query(it, filters.q)
    ]
    filtered.sort(key=lambda it: (it["priority"], -_age_sort_key(it.get("age", ""))))

    return {
        "items": filtered,
        "counts": {
            "needs": counts["needs"],
            "txns": counts["txns"],
            "recs": counts["recs"],
            "invs": counts["invs"],
            "subs": counts["subs"],
        },
    }
