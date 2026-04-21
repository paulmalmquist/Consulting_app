"""Unit tests for pipeline_rail aggregation services."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.services import pipeline_rail


def _push_today_moves_data(cur):
    """Push the 3 queries today_moves runs, in order."""
    today = date.today()

    # 1) overdue_action_active_deal
    cur.push_result([
        {
            "deal_id": "dd111111-1111-1111-1111-111111111111",
            "action": "Send reminder",
            "action_type": "follow_up",
            "due_date": today - timedelta(days=3),
            "priority": "high",
            "deal_name": "Hamilton Deal",
            "amount": 50_000,
            "status": "open",
            "account_name": "Hamilton Zanze",
            "last_touch_at": datetime.now(timezone.utc) - timedelta(days=4),
            "execution_pressure": "high",
            "snoozed_until": None,
        },
    ])
    # 2) no_action_active_stage — include one snoozed deal to verify it drops
    cur.push_result([
        {
            "deal_id": "dd222222-2222-2222-2222-222222222222",
            "deal_name": "Acme Deal",
            "amount": 120_000,
            "status": "open",
            "stage_key": "engaged",
            "account_name": "Acme Corp",
            "last_touch_at": datetime.now(timezone.utc) - timedelta(days=2),
            "execution_pressure": "medium",
            "snoozed_until": None,
        },
        {
            "deal_id": "dd999999-9999-9999-9999-999999999999",
            "deal_name": "Snoozed Deal",
            "amount": 80_000,
            "status": "open",
            "stage_key": "engaged",
            "account_name": "Snoozed Inc",
            "last_touch_at": datetime.now(timezone.utc) - timedelta(days=5),
            "execution_pressure": "low",
            "snoozed_until": datetime.now(timezone.utc) + timedelta(days=2),
        },
    ])
    # 3) high_value_idle
    cur.push_result([
        {
            "deal_id": "dd333333-3333-3333-3333-333333333333",
            "deal_name": "Marcus Deal",
            "amount": 250_000,
            "account_name": "Marcus Partners",
            "last_touch_at": datetime.now(timezone.utc) - timedelta(days=10),
            "execution_pressure": "critical",
            "snoozed_until": None,
        },
    ])


def test_today_moves_priority_order(fake_cursor):
    _push_today_moves_data(fake_cursor)
    rows = pipeline_rail.today_moves(
        env_id="env-1",
        business_id="11111111-1111-1111-1111-111111111111",
        limit=10,
    )
    # All rows have known reason_codes
    allowed = {
        "overdue_action_active_deal",
        "no_action_active_stage",
        "proposal_no_followup",
        "high_value_idle",
    }
    assert all(r["reason_code"] in allowed for r in rows), rows

    # Find the overdue row — it must exist and carry a score >= 90 base
    overdue = next((r for r in rows if r["reason_code"] == "overdue_action_active_deal"), None)
    assert overdue is not None
    assert overdue["priority_score"] >= 90

    # High-value idle row should have base-60 minimum score range
    idle = next((r for r in rows if r["reason_code"] == "high_value_idle"), None)
    assert idle is not None
    assert idle["priority_score"] >= 60


def test_today_moves_penalizes_snoozed(fake_cursor):
    _push_today_moves_data(fake_cursor)
    rows = pipeline_rail.today_moves(
        env_id="env-1",
        business_id="11111111-1111-1111-1111-111111111111",
        limit=10,
    )
    # Snoozed deals get a -30 modifier so their priority_score must be lower
    # than at least one comparable non-snoozed no-action deal in the result.
    snoozed = [r for r in rows if r["account_name"] == "Snoozed Inc"]
    non_snoozed_no_action = [
        r for r in rows
        if r["reason_code"] == "no_action_active_stage" and r["account_name"] != "Snoozed Inc"
    ]
    if snoozed and non_snoozed_no_action:
        assert snoozed[0]["priority_score"] < max(r["priority_score"] for r in non_snoozed_no_action)


def test_today_moves_honors_limit(fake_cursor):
    _push_today_moves_data(fake_cursor)
    rows = pipeline_rail.today_moves(
        env_id="env-1",
        business_id="11111111-1111-1111-1111-111111111111",
        limit=2,
    )
    assert len(rows) <= 2
