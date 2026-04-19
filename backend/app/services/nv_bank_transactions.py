"""Bank/card transaction ledger service for the Accounting Command Desk.

Amounts are stored as signed cents (negative = outflow). Match state tracks
reconciliation against receipts and invoices. Split children point at their
parent via parent_txn_id.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from app.db import get_cursor


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@dataclass
class TxnFilters:
    state: str | None = None
    q: str | None = None


def _fmt_datetime(dt: datetime | None) -> str:
    if dt is None:
        return "—"
    return f"{MONTHS[dt.month - 1]} {dt.day:02d} · {dt.strftime('%H:%M')}"


def _row_to_dict(r: dict[str, Any]) -> dict[str, Any]:
    amount = float((r.get("amount_cents") or 0) / 100)
    hint = r.get("match_hint") or ""
    match_state = r.get("match_state") or "unreviewed"
    if match_state == "reconciled":
        match_label = "reconciled ✓"
    elif r.get("match_receipt_id"):
        match_label = "receipt ✓"
    elif r.get("match_invoice_id"):
        match_label = "invoice ✓"
    elif match_state == "split":
        match_label = "split"
    elif hint:
        match_label = hint
    else:
        match_label = "unmatched"
    return {
        "id": str(r["id"]),
        "external_id": r.get("external_id"),
        "date": _fmt_datetime(r.get("posted_at")),
        "posted_at": r["posted_at"].isoformat() if r.get("posted_at") else None,
        "account": r.get("account_label"),
        "desc": r.get("description"),
        "amount": amount,
        "category": r.get("category"),
        "match": match_label,
        "match_receipt_id": str(r["match_receipt_id"]) if r.get("match_receipt_id") else None,
        "match_invoice_id": str(r["match_invoice_id"]) if r.get("match_invoice_id") else None,
        "state": match_state,
    }


def list_transactions(
    *, env_id: str, business_id: str, filters: TxnFilters | None = None,
) -> list[dict[str, Any]]:
    filters = filters or TxnFilters()
    conditions = ["env_id = %s", "business_id = %s::uuid", "parent_txn_id IS NULL"]
    params: list[Any] = [env_id, business_id]
    if filters.state:
        conditions.append("match_state = %s")
        params.append(filters.state)
    if filters.q:
        conditions.append("(description ILIKE %s OR account_label ILIKE %s)")
        needle = f"%{filters.q}%"
        params.extend([needle, needle])
    where = " AND ".join(conditions)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT id, external_id, posted_at, account_label, description,
                   amount_cents, currency, category,
                   match_state, match_receipt_id, match_invoice_id, match_hint
              FROM nv_bank_transaction
             WHERE {where}
             ORDER BY posted_at DESC
             LIMIT 500
            """,
            params,
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def get_transaction(*, env_id: str, business_id: str, txn_id: str) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, external_id, posted_at, account_label, description,
                   amount_cents, currency, category,
                   match_state, match_receipt_id, match_invoice_id, match_hint,
                   parent_txn_id, split_memo
              FROM nv_bank_transaction
             WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
            """,
            (env_id, business_id, txn_id),
        )
        r = cur.fetchone()
    return _row_to_dict(r) if r else None


def update_match(
    *,
    env_id: str,
    business_id: str,
    txn_id: str,
    receipt_id: str | None = None,
    invoice_id: str | None = None,
) -> dict[str, Any] | None:
    sets = ["updated_at = now()", "match_state = 'reconciled'"]
    params: list[Any] = []
    if receipt_id is not None:
        sets.append("match_receipt_id = %s::uuid")
        params.append(receipt_id)
    if invoice_id is not None:
        sets.append("match_invoice_id = %s::uuid")
        params.append(invoice_id)
    if len(sets) == 2:  # just the two fixed sets
        raise ValueError("update_match requires receipt_id or invoice_id")
    params.extend([env_id, business_id, txn_id])
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE nv_bank_transaction
               SET {', '.join(sets)}
             WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
         RETURNING id, external_id, posted_at, account_label, description,
                   amount_cents, currency, category,
                   match_state, match_receipt_id, match_invoice_id, match_hint
            """,
            params,
        )
        r = cur.fetchone()
    return _row_to_dict(r) if r else None


def split_transaction(
    *,
    env_id: str,
    business_id: str,
    txn_id: str,
    parts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Split one transaction into N children. Parent stays but is flagged 'split'.

    parts: list of {amount: float (abs), category?: str, memo?: str}
    """
    if not parts:
        raise ValueError("split requires at least one part")
    parent = get_transaction(env_id=env_id, business_id=business_id, txn_id=txn_id)
    if parent is None:
        raise LookupError(f"transaction {txn_id} not found")
    sign = -1 if parent["amount"] < 0 else 1
    new_rows: list[dict[str, Any]] = []
    with get_cursor() as cur:
        for i, part in enumerate(parts, start=1):
            amt_cents = int(round(abs(float(part["amount"])) * 100)) * sign
            category = part.get("category")
            memo = part.get("memo")
            ext = f"{parent['external_id']}-S{i}" if parent["external_id"] else None
            cur.execute(
                """
                INSERT INTO nv_bank_transaction
                  (env_id, business_id, external_id, posted_at, account_label,
                   description, amount_cents, currency, category,
                   match_state, parent_txn_id, split_memo)
                VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, %s,
                        'categorized', %s::uuid, %s)
             RETURNING id, external_id, posted_at, account_label, description,
                       amount_cents, currency, category,
                       match_state, match_receipt_id, match_invoice_id, match_hint
                """,
                (env_id, business_id, ext, parent["posted_at"], parent["account"],
                 (memo or parent["desc"]), amt_cents, "USD", category,
                 txn_id, memo),
            )
            new_rows.append(_row_to_dict(cur.fetchone()))
        cur.execute(
            """
            UPDATE nv_bank_transaction
               SET match_state = 'split',
                   match_hint = 'split',
                   updated_at = now()
             WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
            """,
            (env_id, business_id, txn_id),
        )
    return new_rows


def insert_raw(
    *,
    env_id: str,
    business_id: str,
    external_id: str,
    posted_at: datetime,
    account_label: str,
    description: str,
    amount_cents: int,
    category: str | None = None,
    currency: str = "USD",
    match_state: str = "unreviewed",
    match_hint: str | None = None,
) -> str:
    """Seed helper — insert a single raw transaction. Returns id."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_bank_transaction
              (env_id, business_id, external_id, posted_at, account_label,
               description, amount_cents, currency, category,
               match_state, match_hint)
            VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, business_id, external_id) DO UPDATE
              SET posted_at = EXCLUDED.posted_at,
                  description = EXCLUDED.description,
                  amount_cents = EXCLUDED.amount_cents,
                  updated_at = now()
            RETURNING id
            """,
            (env_id, business_id, external_id, posted_at, account_label,
             description, amount_cents, currency, category, match_state, match_hint),
        )
        return str(cur.fetchone()["id"])
