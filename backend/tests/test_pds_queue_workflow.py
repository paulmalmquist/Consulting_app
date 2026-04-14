"""Tests for Sub-Phase 1B — intervention queue workflow + close-the-loop."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.services.pds_executive import queue as queue_svc


ENV = uuid4()
BIZ = uuid4()


def _stub_row(**overrides):
    now = datetime.now(tz=timezone.utc)
    base = {
        "queue_item_id": uuid4(),
        "env_id": ENV,
        "business_id": BIZ,
        "decision_code": "X1",
        "title": "Fix overrun",
        "summary": "",
        "priority": "high",
        "status": "open",
        "project_id": None,
        "signal_event_id": None,
        "recommended_action": "",
        "recommended_owner": "SysPick",
        "assigned_owner": None,
        "due_at": now + timedelta(days=10),
        "risk_score": 0.5,
        "variance": -100000,
        "starting_variance": -120000,
        "recovery_value": 0,
        "resolved_at": None,
        "context_json": {},
        "ai_analysis_json": {},
        "input_snapshot_json": {},
        "outcome_json": {},
        "created_by": "test",
        "updated_by": "test",
        "created_at": now - timedelta(days=2),
        "updated_at": now,
    }
    base.update(overrides)
    return base


def test_priority_score_formula():
    now = datetime(2026, 4, 14, tzinfo=timezone.utc)
    row = _stub_row(
        variance=-50000,
        due_at=now + timedelta(days=5),
    )
    score = queue_svc.compute_priority_score(row, now=now)
    # ABS(-50000) / max(5, 1) = 10000
    assert score == pytest.approx(10000.0)


def test_priority_score_no_due_date_returns_raw_variance():
    row = _stub_row(variance=-25000, due_at=None)
    score = queue_svc.compute_priority_score(row)
    assert score == 25000.0


def test_priority_score_past_due_clamps_to_one_day():
    now = datetime(2026, 4, 14, tzinfo=timezone.utc)
    row = _stub_row(variance=-100000, due_at=now - timedelta(days=30))
    score = queue_svc.compute_priority_score(row, now=now)
    # Negative days clamp to 1 → score == abs(variance)
    assert score == 100000.0


def test_list_queue_items_sorts_by_priority_score(fake_cursor):
    low = _stub_row(variance=-1000, due_at=datetime.now(tz=timezone.utc) + timedelta(days=30))
    high = _stub_row(variance=-100000, due_at=datetime.now(tz=timezone.utc) + timedelta(days=1))
    fake_cursor.push_result([low, high])

    rows = queue_svc.list_queue_items(env_id=ENV, business_id=BIZ)
    assert rows[0]["variance"] == -100000
    assert rows[0]["priority_score"] > rows[1]["priority_score"]


def test_update_queue_item_rejects_non_editable_fields():
    with pytest.raises(ValueError, match="No editable fields"):
        queue_svc.update_queue_item(
            env_id=ENV,
            business_id=BIZ,
            queue_item_id=uuid4(),
            patch={"title": "not allowed"},
        )


def test_update_queue_item_rejects_unknown_status():
    with pytest.raises(ValueError, match="Unsupported status"):
        queue_svc.update_queue_item(
            env_id=ENV,
            business_id=BIZ,
            queue_item_id=uuid4(),
            patch={"status": "bogus"},
        )


def test_update_queue_item_persists_owner_and_variance(fake_cursor):
    patched = _stub_row(assigned_owner="Paul", variance=-80000)
    fake_cursor.push_result([patched])

    result = queue_svc.update_queue_item(
        env_id=ENV,
        business_id=BIZ,
        queue_item_id=patched["queue_item_id"],
        patch={"assigned_owner": "Paul", "variance": -80000},
        actor="tester",
    )
    assert result["assigned_owner"] == "Paul"
    assert result["variance"] == -80000
    assert "priority_score" in result
    # Recommended owner survives the PATCH alongside assigned_owner
    assert result["recommended_owner"] == "SysPick"


def test_close_transition_computes_delta_and_time_to_resolution(fake_cursor):
    now = datetime.now(tz=timezone.utc)
    resolved = _stub_row(
        status="closed",
        starting_variance=-120000,
        variance=-20000,
        recovery_value=100000,
        resolved_at=now,
        created_at=now - timedelta(hours=72),
    )
    # update + close-loop second UPDATE both return rows
    fake_cursor.push_result([resolved])
    fake_cursor.push_result([resolved])

    result = queue_svc.update_queue_item(
        env_id=ENV,
        business_id=BIZ,
        queue_item_id=resolved["queue_item_id"],
        patch={"status": "closed", "recovery_value": 100000},
        actor="tester",
    )
    assert result["status"] == "closed"
    assert result["resolved_at"] is not None
    # Inspect the close_loop payload written via the second UPDATE.
    written_calls = [
        q for q in fake_cursor.queries if "close_loop" in q[0]
    ]
    assert written_calls, "close_loop outcome block must be written on resolution"
    import json
    payload = json.loads(written_calls[0][1][0])
    assert payload["delta"] == pytest.approx(-120000 - -20000)  # -100000
    assert payload["time_to_resolution_hours"] == pytest.approx(72, rel=0.01)
    assert payload["recovery_value"] == 100000


def test_get_queue_metrics_produces_summary_and_top_five(fake_cursor):
    now = datetime.now(tz=timezone.utc)
    rows = [
        _stub_row(status="open", variance=-50000, due_at=now + timedelta(days=5)),
        _stub_row(status="open", variance=-200000, due_at=now + timedelta(days=2)),
        _stub_row(status="open", variance=-10000, due_at=now + timedelta(days=60)),
        _stub_row(
            status="closed",
            variance=-1000,
            starting_variance=-40000,
            recovery_value=39000,
            created_at=now - timedelta(hours=48),
            resolved_at=now,
        ),
    ]
    fake_cursor.push_result(rows)

    summary = queue_svc.get_queue_metrics(env_id=ENV, business_id=BIZ)
    assert summary["total_recovered_value"] == 39000
    assert summary["open_variance_exposure"] == 50000 + 200000 + 10000
    assert summary["median_time_to_fix_hours"] == pytest.approx(48, abs=0.5)
    assert len(summary["top_five_actions"]) == 3  # only 3 open rows
    assert summary["top_five_actions"][0]["variance"] == -200000
