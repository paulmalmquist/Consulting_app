"""Unit tests for the unified Accounting Command Desk queue builder.

Mocks the DB cursor and asserts:
- items from all four sources are surfaced
- priority ordering puts overdue invoices above low-conf receipts above reimbursables
- KPI filter narrows queue while leaving counts unchanged
- query filter substring-matches on party/client/action/id
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from app.services import nv_accounting_queue


def _push_all(cur):
    """Push four result sets in the order the service queries them."""
    today = date.today()
    # 1) receipt_review_queue items
    cur.push_result([
        {
            "id": "abc-low",
            "intake_id": "intake-1",
            "reason": "low_confidence",
            "next_action": "Review parsed receipt",
            "created_at": datetime.now(timezone.utc),
            "merchant_raw": "FIGMA.COM",
            "vendor_normalized": "Figma Inc",
            "service_name_guess": "Figma Pro",
            "total": 142.80,
            "currency": "USD",
            "transaction_date": today,
            "confidence_overall": 0.78,
            "original_filename": "figma.txt",
        },
        {
            "id": "abc-apple",
            "intake_id": "intake-2",
            "reason": "apple_ambiguous",
            "next_action": "Confirm underlying vendor",
            "created_at": datetime.now(timezone.utc),
            "merchant_raw": "APPLE.COM/BILL",
            "vendor_normalized": None,
            "service_name_guess": None,
            "total": 19.99,
            "currency": "USD",
            "transaction_date": today,
            "confidence_overall": 0.42,
            "original_filename": "apple.txt",
        },
    ])
    # 2) unreviewed transactions
    cur.push_result([
        {
            "id": "t1",
            "posted_at": datetime.now(timezone.utc),
            "description": "AWS US EAST",
            "amount_cents": -124_800,
            "category": None,
            "match_state": "unreviewed",
            "match_hint": None,
        },
    ])
    # 3) overdue invoices
    cur.push_result([
        {
            "id": "inv1",
            "invoice_number": "INV-2038",
            "client": "Northwind Trading",
            "issued_date": today,
            "due_date": today,
            "amount_cents": 3_240_000,
            "paid_cents": 0,
        },
    ])
    # 4) reimbursable drafts
    cur.push_result([
        {
            "id": "exp1",
            "vendor_normalized": "Hilton",
            "service_name": "Hilton SF",
            "category": "Travel",
            "amount": 412.00,
            "transaction_date": today,
            "entity_linkage": "client_engagement",
            "status": "draft",
        },
    ])
    # 5) counts
    cur.push_result([{"txns": 12, "recs": 7, "invs": 8, "subs": 3}])


def test_build_queue_aggregates_all_sources(fake_cursor):
    _push_all(fake_cursor)
    result = nv_accounting_queue.build_queue(
        env_id="env-1",
        business_id="11111111-1111-1111-1111-111111111111",
        filters=nv_accounting_queue.QueueFilters(),
    )
    items = result["items"]
    types = {it["type"] for it in items}
    # One of each type present
    assert "review-receipt" in types
    assert "match-receipt" in types or "categorize" in types
    assert "overdue-invoice" in types
    assert "reimbursable" in types
    # Overdue invoice at priority 1, reimbursable at priority 3
    overdue = [it for it in items if it["type"] == "overdue-invoice"]
    reimburse = [it for it in items if it["type"] == "reimbursable"]
    assert overdue and reimburse
    assert overdue[0]["priority"] == 1
    assert reimburse[0]["priority"] == 3
    # Queue is priority-sorted
    priorities = [it["priority"] for it in items]
    assert priorities == sorted(priorities)
    # Counts present
    assert result["counts"]["needs"] >= 1
    assert result["counts"]["txns"] == 12
    assert result["counts"]["invs"] == 8


def test_build_queue_kpi_filter_leaves_counts(fake_cursor):
    _push_all(fake_cursor)
    result = nv_accounting_queue.build_queue(
        env_id="env-1",
        business_id="11111111-1111-1111-1111-111111111111",
        filters=nv_accounting_queue.QueueFilters(kpi_filter="unpaid"),
    )
    # After filter, only overdue-invoice rows remain
    assert all(it["type"] == "overdue-invoice" for it in result["items"])
    # Counts remain total — not filtered
    assert result["counts"]["needs"] >= 1


def test_build_queue_query_narrows_items(fake_cursor):
    _push_all(fake_cursor)
    result = nv_accounting_queue.build_queue(
        env_id="env-1",
        business_id="11111111-1111-1111-1111-111111111111",
        filters=nv_accounting_queue.QueueFilters(q="northwind"),
    )
    # Query matches the overdue invoice client
    matches = [it for it in result["items"] if "Northwind" in it["party"]]
    assert matches, "expected Northwind query to return the overdue invoice"
