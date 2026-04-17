"""Closeout board: readiness packages + cash-at-risk roll-up."""

from __future__ import annotations

from uuid import UUID

from app.services.operator import _load_fixture, list_closeout_packages


ENV_ID = UUID("11111111-1111-4111-8111-111111111111")


def _reset_cache() -> None:
    _load_fixture.cache_clear()


def test_closeout_packages_sorted_by_days_to_close():
    _reset_cache()
    result = list_closeout_packages(env_id=ENV_ID)
    rows = result["packages"]
    assert rows, "expected at least one package"
    days = [r["days_to_close"] or 9999 for r in rows]
    assert days == sorted(days), (
        "packages must be sorted so the earliest closeout gets attention first"
    )


def test_totals_roll_up_matches_rows():
    _reset_cache()
    result = list_closeout_packages(env_id=ENV_ID)
    totals = result["totals"]
    assert totals["package_count"] == len(result["packages"])
    blocking_total = sum(r["blocking_count"] for r in result["packages"])
    missing_total = sum(r["missing_count"] for r in result["packages"])
    assert totals["blocking_missing_count"] == blocking_total
    assert totals["missing_item_count"] == missing_total


def test_blocking_items_carry_impact_and_if_ignored():
    _reset_cache()
    result = list_closeout_packages(env_id=ENV_ID)
    seen = 0
    for pkg in result["packages"]:
        for item in pkg["missing_items"]:
            if not item.get("blocking"):
                continue
            impact = item.get("impact")
            assert impact is not None, (
                f"blocking item {item['id']} must carry an impact block"
            )
            assert impact.get("if_ignored", {}).get("in_30_days") is not None, (
                f"blocking item {item['id']} must model 30-day consequence"
            )
            seen += 1
    assert seen >= 3, "demo needs several blocking items with consequence modeling"


def test_hrefs_reference_env_id_for_every_row():
    _reset_cache()
    result = list_closeout_packages(env_id=ENV_ID)
    for row in result["packages"]:
        assert str(ENV_ID) in (row.get("href") or "")


def test_earliest_due_date_matches_minimum_across_items():
    _reset_cache()
    result = list_closeout_packages(env_id=ENV_ID)
    earliest = None
    for pkg in result["packages"]:
        for item in pkg["missing_items"]:
            due = item.get("due_date")
            if due and (earliest is None or due < earliest):
                earliest = due
    assert result["totals"]["earliest_due_date"] == earliest


def test_cash_at_risk_block_travels_with_response():
    _reset_cache()
    result = list_closeout_packages(env_id=ENV_ID)
    cash = result["cash_at_risk"]
    assert cash is not None
    assert cash["total_amount_usd"] > 0
    assert result["totals"]["cash_at_risk_usd"] == cash["total_amount_usd"]
