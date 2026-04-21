"""Unit tests for the canonical action-view bucketer."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.services.pipeline_buckets import bucket_for_action_view


def _card(**over):
    base = {
        "risk_flags": [],
        "momentum_status": "flat",
        "next_action_due": None,
        "next_action_description": "Send intro email",
        "snoozed_until": None,
    }
    base.update(over)
    return base


def test_snoozed_future_is_blocked():
    future = datetime.now(timezone.utc) + timedelta(hours=2)
    assert bucket_for_action_view(_card(snoozed_until=future)) == "blocked"


def test_snoozed_flag_is_blocked():
    assert bucket_for_action_view(_card(risk_flags=["snoozed"])) == "blocked"


def test_declining_momentum_is_waiting():
    assert bucket_for_action_view(_card(momentum_status="declining")) == "waiting"


def test_waiting_reply_flag_is_waiting():
    assert bucket_for_action_view(_card(risk_flags=["waiting_reply"])) == "waiting"


def test_no_action_missing_is_overdue():
    assert bucket_for_action_view(
        _card(next_action_due=None, next_action_description=None, risk_flags=["no_next_action"])
    ) == "overdue"


def test_no_due_but_has_action_is_this_week():
    assert bucket_for_action_view(_card(next_action_due=None)) == "this_week"


def test_past_due_is_overdue():
    yesterday = date.today() - timedelta(days=1)
    assert bucket_for_action_view(_card(next_action_due=yesterday.isoformat())) == "overdue"


def test_today_is_today():
    today = date.today()
    assert bucket_for_action_view(_card(next_action_due=today.isoformat())) == "today"


def test_within_week_is_this_week():
    five_days = date.today() + timedelta(days=5)
    assert bucket_for_action_view(_card(next_action_due=five_days.isoformat())) == "this_week"


def test_far_future_still_this_week():
    far = date.today() + timedelta(days=30)
    # Plan spec: rule 7 defaults to this_week for anything beyond 7d
    assert bucket_for_action_view(_card(next_action_due=far.isoformat())) == "this_week"


def test_snoozed_wins_over_other_signals():
    """A snoozed deal with both a declining momentum and an overdue date still
    lands in blocked — rule 1 takes precedence."""
    yesterday = date.today() - timedelta(days=3)
    future = datetime.now(timezone.utc) + timedelta(days=1)
    assert bucket_for_action_view(
        _card(
            snoozed_until=future,
            momentum_status="declining",
            next_action_due=yesterday.isoformat(),
            risk_flags=["waiting_reply", "snoozed"],
        )
    ) == "blocked"
