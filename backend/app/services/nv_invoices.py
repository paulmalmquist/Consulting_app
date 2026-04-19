"""Invoice service — backs the Accounting Command Desk Invoices view + AR rail.

Storage: nv_invoice (603_nv_accounting_core.sql). Amounts stored as cents
(bigint) for exact arithmetic; converted to dollars at the service edge.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from app.db import get_cursor


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@dataclass
class InvoiceFilters:
    state: str | None = None
    q: str | None = None
    range_days: int | None = None


def _fmt_md(d: date | None) -> str:
    if d is None:
        return "—"
    return f"{MONTHS[d.month - 1]} {d.day:02d}"


def _age_label(invoice: dict[str, Any], today: date) -> str:
    due = invoice.get("due_date")
    state = invoice.get("state")
    paid = int(invoice.get("paid_cents") or 0)
    amount = int(invoice.get("amount_cents") or 0)
    if state == "paid":
        return f"paid · {_fmt_md(due)}"
    if state == "draft":
        return "—"
    if not due:
        return "—"
    delta = (today - due).days
    if delta > 0:
        return f"{delta}d"
    if delta == 0:
        return "due today"
    if paid > 0 and paid < amount:
        return f"partial · due {abs(delta)}d"
    return f"due {abs(delta)}d"


def _row_to_dict(r: dict[str, Any], today: date) -> dict[str, Any]:
    due = r.get("due_date")
    amount = float((r.get("amount_cents") or 0) / 100)
    paid = float((r.get("paid_cents") or 0) / 100)
    state = r.get("state") or "draft"
    glow = bool(
        state == "overdue" and due is not None and (today - due).days > 0
    )
    return {
        "id": str(r["id"]),
        "invoice_number": r.get("invoice_number"),
        "client": r.get("client"),
        "engagement_id": r.get("engagement_id"),
        "issued": _fmt_md(r.get("issued_date")),
        "due": _fmt_md(due),
        "amount": amount,
        "paid": paid,
        "state": state,
        "age_label": _age_label(r, today),
        "glow": glow,
    }


def list_invoices(
    *,
    env_id: str,
    business_id: str,
    filters: InvoiceFilters | None = None,
) -> list[dict[str, Any]]:
    filters = filters or InvoiceFilters()
    today = date.today()
    conditions = ["env_id = %s", "business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]
    if filters.state:
        conditions.append("state = %s")
        params.append(filters.state)
    if filters.q:
        conditions.append("(client ILIKE %s OR invoice_number ILIKE %s)")
        needle = f"%{filters.q}%"
        params.extend([needle, needle])
    if filters.range_days:
        conditions.append("issued_date >= %s")
        params.append(today.replace(day=1))  # month-to-date bucket for simplicity
    where = " AND ".join(conditions)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT id, invoice_number, client, engagement_id,
                   issued_date, due_date,
                   amount_cents, paid_cents, currency,
                   state, last_reminded_at, last_reminded_channel
              FROM nv_invoice
             WHERE {where}
             ORDER BY state = 'overdue' DESC, due_date ASC NULLS LAST, issued_date DESC
             LIMIT 500
            """,
            params,
        )
        rows = [_row_to_dict(r, today) for r in cur.fetchall()]
    return rows


def get_invoice(*, env_id: str, business_id: str, invoice_id: str) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, invoice_number, client, engagement_id,
                   issued_date, due_date,
                   amount_cents, paid_cents, currency,
                   state, last_reminded_at, last_reminded_channel, notes
              FROM nv_invoice
             WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
            """,
            (env_id, business_id, invoice_id),
        )
        r = cur.fetchone()
    return _row_to_dict(r, date.today()) if r else None


def create_invoice(
    *,
    env_id: str,
    business_id: str,
    client: str,
    issued: date,
    due: date,
    amount_cents: int,
    engagement_id: str | None = None,
    currency: str = "USD",
    invoice_number: str | None = None,
) -> dict[str, Any]:
    if invoice_number is None:
        invoice_number = f"INV-{int(datetime.now(timezone.utc).timestamp())}"
    state = "sent" if issued <= date.today() else "draft"
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_invoice
              (env_id, business_id, invoice_number, client, engagement_id,
               issued_date, due_date, amount_cents, paid_cents, currency, state)
            VALUES
              (%s, %s::uuid, %s, %s, %s, %s, %s, %s, 0, %s, %s)
            RETURNING id, invoice_number, client, engagement_id, issued_date, due_date,
                      amount_cents, paid_cents, currency, state,
                      last_reminded_at, last_reminded_channel
            """,
            (env_id, business_id, invoice_number, client, engagement_id,
             issued, due, amount_cents, currency, state),
        )
        row = cur.fetchone()
    return _row_to_dict(row, date.today())


def remind_invoice(
    *,
    env_id: str,
    business_id: str,
    invoice_id: str,
    channel: str,
) -> dict[str, Any] | None:
    if channel not in ("email", "sms"):
        raise ValueError(f"invalid channel: {channel}")
    now = datetime.now(timezone.utc)
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_invoice
               SET last_reminded_at = %s,
                   last_reminded_channel = %s,
                   updated_at = now()
             WHERE env_id = %s AND business_id = %s::uuid AND id = %s::uuid
         RETURNING id, invoice_number, client, last_reminded_at, last_reminded_channel
            """,
            (now, channel, env_id, business_id, invoice_id),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "invoice_id": str(row["id"]),
        "channel": channel,
        "sent_at": now.isoformat(),
    }


def sync_overdue_state(*, env_id: str, business_id: str) -> int:
    """Move `sent` invoices past `due_date` into `overdue`. Returns row count."""
    today = date.today()
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_invoice
               SET state = 'overdue', updated_at = now()
             WHERE env_id = %s AND business_id = %s::uuid
               AND state = 'sent' AND due_date < %s
            """,
            (env_id, business_id, today),
        )
        return cur.rowcount or 0
