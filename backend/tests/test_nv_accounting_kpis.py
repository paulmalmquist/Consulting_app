"""Unit tests for the Accounting Command Desk KPI computer.

Mocks the DB cursor and asserts the 6 tiles come back with expected keys,
formatted values, and sparkline length == 14.
"""
from __future__ import annotations

from app.services import nv_accounting_kpis


def _push_kpi_data(cur):
    # 1) cash in/out 30-day aggregate
    cur.push_result([{
        "in_30": 3_064_000,       # $30.64K
        "out_30": 5_692_000,      # $56.92K
        "in_prev": 2_100_000,
        "out_prev": 4_800_000,
    }])
    # 2) invoices: unpaid + overdue count
    cur.push_result([{"unpaid_cents": 5_906_000, "overdue_n": 3}])
    # 3) open review items
    cur.push_result([{"n": 4}])
    # 4) unreconciled txns
    cur.push_result([{"n": 5}])
    # 5) reimbursable drafts
    cur.push_result([{"total": 412.00, "n": 1}])
    # 6) cash-in spark buckets (14 rows)
    cur.push_result([])
    # 7) cash-out spark buckets
    cur.push_result([])
    # 8) receipts spark (count by created_at::date)
    cur.push_result([])
    # 9) unrecon spark
    cur.push_result([])
    # 10) reimburse spark
    cur.push_result([])


def test_compute_kpis_returns_six_tiles(fake_cursor):
    _push_kpi_data(fake_cursor)
    result = nv_accounting_kpis.compute_kpis(
        env_id="env-1",
        business_id="11111111-1111-1111-1111-111111111111",
    )
    keys = [t["key"] for t in result["tiles"]]
    assert keys == ["cash-in", "cash-out", "unpaid", "receipts", "unrecon", "reimburse"]
    # All sparklines must be 14 points (zeros for empty buckets, but still present)
    for tile in result["tiles"]:
        assert len(tile["sparkline"]) == 14, f"{tile['key']} expected 14 spark points"
    # Cash-in formatted as K-style
    cash_in = next(t for t in result["tiles"] if t["key"] == "cash-in")
    assert cash_in["value"].startswith("$")
    # Unpaid tile carries the overdue-count delta
    unpaid = next(t for t in result["tiles"] if t["key"] == "unpaid")
    assert "overdue" in (unpaid["delta"] or "")
    # as_of is ISO date
    assert result["as_of"].count("-") == 2
