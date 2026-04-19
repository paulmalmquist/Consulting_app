"""Match-candidate surface for the Accounting Command Desk drawer.

Reuses receipt_matching.py's scoring weights (0.55 amount / 0.25 date / 0.20
merchant) but exposes the **reverse** direction: given a transaction, find
likely receipts. Used by the drawer's "AI Suggested" panel for match-receipt
queue items.

The intake → receipt direction remains owned by receipt_matching.py.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from app.db import get_cursor


@dataclass(frozen=True)
class ReceiptCandidate:
    intake_id: str
    parse_id: str | None
    vendor: str | None
    amount: Decimal | None
    received_at: date | None


def _load_receipt_candidates(
    cur, env_id: str, business_id: str, parsed_date: date | None
) -> list[ReceiptCandidate]:
    if not parsed_date:
        return []
    lo = parsed_date - timedelta(days=7)
    hi = parsed_date + timedelta(days=7)
    cur.execute(
        """
        SELECT i.id AS intake_id, p.id AS parse_id, p.total, p.vendor_normalized,
               p.merchant_raw, p.transaction_date
          FROM nv_receipt_intake i
     LEFT JOIN LATERAL (
               SELECT id, total, vendor_normalized, merchant_raw, transaction_date
                 FROM nv_receipt_parse_result
                WHERE intake_id = i.id
                ORDER BY created_at DESC LIMIT 1
            ) p ON true
         WHERE i.env_id = %s AND i.business_id = %s::uuid
           AND p.transaction_date BETWEEN %s AND %s
         LIMIT 50
        """,
        (env_id, business_id, lo, hi),
    )
    out: list[ReceiptCandidate] = []
    for r in cur.fetchall():
        total = r.get("total")
        vendor = r.get("vendor_normalized") or r.get("merchant_raw")
        out.append(
            ReceiptCandidate(
                intake_id=str(r["intake_id"]),
                parse_id=str(r["parse_id"]) if r.get("parse_id") else None,
                vendor=vendor,
                amount=Decimal(str(total)) if total is not None else None,
                received_at=r.get("transaction_date"),
            )
        )
    return out


def _score(
    candidate: ReceiptCandidate,
    *,
    txn_amount_abs: Decimal,
    txn_date: date,
    txn_desc: str,
) -> tuple[int, dict[str, Any]]:
    reason: dict[str, Any] = {}
    amount_score = 0.0
    if candidate.amount is not None:
        delta = abs(candidate.amount - txn_amount_abs)
        denom = max(txn_amount_abs, Decimal("0.01"))
        pct = float(delta / denom)
        amount_score = max(0.0, 1.0 - min(pct, 1.0))
        reason["amount_delta"] = float(delta)
    date_score = 0.0
    if candidate.received_at:
        days = abs((candidate.received_at - txn_date).days)
        date_score = max(0.0, 1.0 - days / 7.0)
        reason["date_delta_days"] = days
    merchant_score = 0.0
    if candidate.vendor and txn_desc:
        a = candidate.vendor.lower()
        b = txn_desc.lower()
        if a == b or a in b or b in a:
            merchant_score = 1.0
            reason["merchant_match"] = "substring"
        else:
            a_tokens = set(a.split())
            b_tokens = set(b.split())
            overlap = len(a_tokens & b_tokens)
            if overlap:
                merchant_score = min(1.0, overlap / max(len(a_tokens), 1))
                reason["merchant_match"] = "token-overlap"
    score = int(round((amount_score * 0.55 + date_score * 0.25 + merchant_score * 0.20) * 100))
    return score, reason


def candidates_for_transaction(
    *, env_id: str, business_id: str, txn_id: str
) -> list[dict[str, Any]]:
    """Return up to 5 ranked receipt candidates for a given transaction."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, posted_at, amount_cents, description
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
            """,
            (env_id, business_id, txn_id),
        )
        row = cur.fetchone()
        if not row:
            return []
        txn_date = row["posted_at"].date() if row.get("posted_at") else None
        txn_amount_abs = (Decimal(row["amount_cents"]) / Decimal(100)).copy_abs()
        txn_desc = row.get("description") or ""
        if not txn_date:
            return []
        receipts = _load_receipt_candidates(cur, env_id, business_id, txn_date)

    ranked: list[dict[str, Any]] = []
    for c in receipts:
        score, reason = _score(c, txn_amount_abs=txn_amount_abs, txn_date=txn_date, txn_desc=txn_desc)
        if score <= 0:
            continue
        ranked.append(
            {
                "intake_id": c.intake_id,
                "parse_id": c.parse_id,
                "label": c.vendor or "Receipt",
                "amount": float(c.amount) if c.amount is not None else None,
                "date": c.received_at.isoformat() if c.received_at else None,
                "confidence": score,
                "reason": reason,
            }
        )
    ranked.sort(key=lambda x: x["confidence"], reverse=True)
    return ranked[:5]
