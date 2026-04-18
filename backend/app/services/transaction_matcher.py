"""Fixture-pure matching between transactions and receipts/invoices.

Not a replacement for `invoice_matcher.py` (SQL-bound, REPE draws) — that
remains canonical for invoice↔draw workflows. This module powers the
reconciliation panel in the Accounting Command Desk.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any


AUTO_MATCH_THRESHOLD = 90
HIGH_MATCH_THRESHOLD = 75


def _parse(iso: str) -> datetime | None:
    try:
        if " " in iso:
            return datetime.fromisoformat(iso.replace(" ", "T"))
        return datetime.fromisoformat(iso)
    except (TypeError, ValueError):
        return None


def _vendor_tokens(s: str) -> set[str]:
    return {tok.lower().strip(".,#") for tok in s.replace("/", " ").split() if len(tok) > 2}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _amount_score(a: float, b: float) -> float:
    if a == 0 or b == 0:
        return 0.0
    delta = abs(abs(a) - abs(b)) / max(abs(a), abs(b))
    if delta < 0.001:
        return 1.0
    if delta < 0.01:
        return 0.9
    if delta < 0.05:
        return 0.7
    if delta < 0.15:
        return 0.4
    return 0.0


def _date_score(a: str, b: str) -> float:
    da = _parse(a)
    db = _parse(b)
    if not da or not db:
        return 0.0
    days = abs((da - db).days)
    if days == 0:
        return 1.0
    if days <= 2:
        return 0.8
    if days <= 7:
        return 0.5
    if days <= 30:
        return 0.2
    return 0.0


def _combine(amount: float, vendor: float, date: float) -> int:
    return int(round((0.55 * amount + 0.30 * vendor + 0.15 * date) * 100))


def match_receipt_to_transactions(
    receipt: dict[str, Any], transactions: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    r_tokens = _vendor_tokens(receipt.get("vendor", ""))
    r_amt = float(receipt.get("amount") or 0)
    r_date = receipt.get("received_at", "")
    scored: list[dict[str, Any]] = []
    for t in transactions:
        t_amt = float(t.get("amount") or 0)
        if (t_amt < 0 and r_amt <= 0) or (t_amt > 0 and r_amt > 0):
            # receipt amounts are positive; match against outflow txns
            continue
        vendor_score = _jaccard(r_tokens, _vendor_tokens(t.get("desc", "")))
        score = _combine(
            _amount_score(r_amt, t_amt),
            vendor_score,
            _date_score(r_date, t.get("date", "")),
        )
        if score <= 0:
            continue
        scored.append(
            {
                "txn_id": t["id"],
                "receipt_id": receipt["id"],
                "label": t["desc"],
                "amount": abs(t_amt),
                "date": t.get("date", ""),
                "confidence": score,
                "reason": "amount+vendor+date",
            }
        )
    scored.sort(key=lambda c: c["confidence"], reverse=True)
    return scored[:5]


def match_transaction_to_receipts(
    txn: dict[str, Any], receipts: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    t_tokens = _vendor_tokens(txn.get("desc", ""))
    t_amt = float(txn.get("amount") or 0)
    t_date = txn.get("date", "")
    scored: list[dict[str, Any]] = []
    for r in receipts:
        r_amt = float(r.get("amount") or 0)
        score = _combine(
            _amount_score(t_amt, r_amt),
            _jaccard(t_tokens, _vendor_tokens(r.get("vendor", ""))),
            _date_score(t_date, r.get("received_at", "")),
        )
        if score <= 0:
            continue
        scored.append(
            {
                "txn_id": txn["id"],
                "receipt_id": r["id"],
                "label": f"{r['vendor']} receipt",
                "amount": r_amt,
                "date": r.get("received_at", ""),
                "confidence": score,
                "reason": "amount+vendor+date",
            }
        )
    scored.sort(key=lambda c: c["confidence"], reverse=True)
    return scored[:5]
