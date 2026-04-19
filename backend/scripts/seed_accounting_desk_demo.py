"""Seed invoices + bank transactions for the Accounting Command Desk demo.

Companion to ``seed_receipt_intake_demo.py`` — that script populates the
receipt/subscription side; this one populates invoices and bank transactions
so the Command Desk's Invoices view, Transactions view, KPI tiles, AR rail,
and bottom-band trends have data to render.

Usage:
    python backend/scripts/seed_accounting_desk_demo.py \\
        --env-id <env_uuid> --business-id <biz_uuid>

Safe to re-run: invoices dedupe on (env_id, business_id, invoice_number);
transactions dedupe on (env_id, business_id, external_id).
"""
from __future__ import annotations

import argparse
import pathlib
import sys
from datetime import date, datetime, timedelta, timezone

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db import get_cursor  # noqa: E402
from app.services import nv_bank_transactions, nv_invoices  # noqa: E402


def _today() -> date:
    return date.today()


def _seed_invoices(env_id: str, business_id: str) -> int:
    today = _today()

    def d(days: int) -> date:
        return today + timedelta(days=days)

    specs: list[dict] = [
        # Paid
        {"num": "INV-2041", "client": "Acme Corp",         "issued": d(-12), "due": d(18),  "amount_cents": 1_840_000, "paid_cents": 1_840_000, "state": "paid"},
        {"num": "INV-2040", "client": "Globex Ltd",        "issued": d(-18), "due": d(12),  "amount_cents": 1_200_000, "paid_cents": 1_200_000, "state": "paid"},
        # Overdue
        {"num": "INV-2039", "client": "Initech",           "issued": d(-17), "due": d(-2),  "amount_cents": 420_000,   "paid_cents": 0,        "state": "overdue"},
        {"num": "INV-2038", "client": "Northwind Trading", "issued": d(-40), "due": d(-9),  "amount_cents": 3_240_000, "paid_cents": 0,        "state": "overdue"},
        {"num": "INV-2037", "client": "Globex Ltd",        "issued": d(-30), "due": d(-16), "amount_cents": 1_820_000, "paid_cents": 0,        "state": "overdue"},
        # Sent (future due)
        {"num": "INV-2036", "client": "Acme Corp",         "issued": d(-9),  "due": d(22),  "amount_cents": 2_400_000, "paid_cents": 0,        "state": "sent"},
        {"num": "INV-2035", "client": "Umbrella Co",       "issued": d(-7),  "due": d(25),  "amount_cents": 920_000,   "paid_cents": 0,        "state": "sent"},
        # Draft
        {"num": "INV-2034", "client": "Stark Industries",  "issued": d(-4),  "due": d(28),  "amount_cents": 4_200_000, "paid_cents": 0,        "state": "draft"},
    ]
    count = 0
    with get_cursor() as cur:
        for s in specs:
            cur.execute(
                """
                INSERT INTO nv_invoice
                  (env_id, business_id, invoice_number, client,
                   issued_date, due_date, amount_cents, paid_cents, currency, state,
                   updated_at)
                VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, 'USD', %s,
                        CASE WHEN %s = 'paid' THEN now() ELSE now() END)
                ON CONFLICT (env_id, business_id, invoice_number) DO UPDATE
                  SET client = EXCLUDED.client,
                      issued_date = EXCLUDED.issued_date,
                      due_date = EXCLUDED.due_date,
                      amount_cents = EXCLUDED.amount_cents,
                      paid_cents = EXCLUDED.paid_cents,
                      state = EXCLUDED.state,
                      updated_at = now()
                """,
                (env_id, business_id, s["num"], s["client"],
                 s["issued"], s["due"], s["amount_cents"], s["paid_cents"], s["state"],
                 s["state"]),
            )
            count += 1
    return count


def _seed_transactions(env_id: str, business_id: str) -> int:
    today = _today()

    def dt(days_ago: int, hour: int = 12, minute: int = 0) -> datetime:
        return datetime(
            today.year, today.month, today.day, hour, minute, tzinfo=timezone.utc
        ) - timedelta(days=days_ago)

    # Amounts in signed cents: negative = outflow.
    specs: list[dict] = [
        # Revenue in
        {"ext": "T-88227", "dt": dt(0, 11, 2),  "acct": "Stripe",      "desc": "ACME CORP · INV-2041",    "cents": 1_840_000,  "cat": "Revenue",         "state": "reconciled"},
        {"ext": "T-88217", "dt": dt(1, 8, 12),  "acct": "Stripe",      "desc": "GLOBEX LTD · INV-2040",   "cents": 1_200_000,  "cat": "Revenue",         "state": "reconciled"},
        {"ext": "T-88200", "dt": dt(7, 8, 0),   "acct": "Stripe",      "desc": "INITECH · INV-2039",      "cents":   420_000,  "cat": "Revenue",         "state": "categorized"},
        # Outflows — categorized
        {"ext": "T-88231", "dt": dt(0, 14, 12), "acct": "Chase •4481", "desc": "FIGMA.COM · SF CA",       "cents":   -14_280,  "cat": "Software & SaaS", "state": "categorized"},
        {"ext": "T-88221", "dt": dt(1, 18, 44), "acct": "Amex •1007",  "desc": "UBER   TRIP 4821",        "cents":    -6_210,  "cat": "Travel",          "state": "categorized"},
        {"ext": "T-88213", "dt": dt(3, 10, 0),  "acct": "Chase •4481", "desc": "GUSTO PAYROLL",           "cents": -4_821_000, "cat": "Payroll",         "state": "categorized", "hint": "auto"},
        {"ext": "T-88208", "dt": dt(4, 9, 22),  "acct": "Chase •4481", "desc": "NOTION LABS",             "cents":    -9_600,  "cat": "Productivity",    "state": "categorized"},
        {"ext": "T-88205", "dt": dt(6, 10, 0),  "acct": "Chase •4481", "desc": "WEWORK",                  "cents":  -120_000,  "cat": "Rent",            "state": "categorized"},
        # Outflows — unreviewed / needs match
        {"ext": "T-88229", "dt": dt(0, 13, 48), "acct": "Chase •4481", "desc": "AWS US EAST",             "cents":  -124_800,  "cat": None,              "state": "unreviewed"},
        {"ext": "T-88224", "dt": dt(0, 9, 30),  "acct": "Chase •4481", "desc": "LEGALZOOM.COM",           "cents":  -420_000,  "cat": None,              "state": "unreviewed"},
        {"ext": "T-88219", "dt": dt(1, 12, 20), "acct": "Chase •4481", "desc": "DATADOG INC",             "cents":  -298_000,  "cat": None,              "state": "unreviewed", "hint": "3 likely"},
        {"ext": "T-88215", "dt": dt(2, 16, 51), "acct": "Amex •1007",  "desc": "BEST BUY #0214",          "cents":   -89_420,  "cat": None,              "state": "unreviewed", "hint": "split?"},
        {"ext": "T-88210", "dt": dt(3, 19, 40), "acct": "Chase •4481", "desc": "RAMP.COM",                "cents":  -742_000,  "cat": None,              "state": "unreviewed"},
        {"ext": "T-88207", "dt": dt(4, 8, 1),   "acct": "Chase •4481", "desc": "ANTHROPIC API",           "cents":   -23_844,  "cat": None,              "state": "unreviewed"},
        {"ext": "T-88206", "dt": dt(5, 11, 0),  "acct": "Chase •4481", "desc": "OPENAI API",              "cents":   -41_218,  "cat": None,              "state": "unreviewed"},
        # Apple IAP card-charge lines (will eventually match subscription occurrences)
        {"ext": "T-88209", "dt": dt(3, 12, 0),  "acct": "Amex •1007",  "desc": "APPLE.COM/BILL",          "cents":    -1_999,  "cat": None,              "state": "unreviewed"},
        {"ext": "T-88204", "dt": dt(7, 10, 0),  "acct": "Chase •4481", "desc": "APPLE.COM/BILL",          "cents":    -1_999,  "cat": None,              "state": "unreviewed"},
    ]
    count = 0
    for s in specs:
        nv_bank_transactions.insert_raw(
            env_id=env_id,
            business_id=business_id,
            external_id=s["ext"],
            posted_at=s["dt"],
            account_label=s["acct"],
            description=s["desc"],
            amount_cents=s["cents"],
            category=s.get("cat"),
            match_state=s["state"],
            match_hint=s.get("hint"),
        )
        count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed Accounting Command Desk demo data.")
    parser.add_argument("--env-id", required=True)
    parser.add_argument("--business-id", required=True)
    args = parser.parse_args()

    inv_n = _seed_invoices(args.env_id, args.business_id)
    txn_n = _seed_transactions(args.env_id, args.business_id)
    # Lazy overdue sync so the demo lands with correct state labels.
    nv_invoices.sync_overdue_state(env_id=args.env_id, business_id=args.business_id)

    print(f"seeded {inv_n} invoices, {txn_n} transactions.")
    print("run seed_receipt_intake_demo.py separately for receipts + subscriptions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
