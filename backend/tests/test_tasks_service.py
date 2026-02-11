"""Tests for tasks service behavior and required regression scenarios."""

import os
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

from tests.conftest import FakeCursor


def _make_fake_cursor(cur):
    @contextmanager
    def _mock():
        yield cur

    return _mock


def _issue_row(
    *,
    issue_id,
    project_id,
    status_id,
    issue_key,
    status_key,
    backlog_rank,
):
    now = datetime.now(timezone.utc)
    return {
        "id": issue_id,
        "project_id": project_id,
        "project_key": "WIN",
        "issue_key": issue_key,
        "type": "task",
        "title": f"Title {issue_key}",
        "description_md": "",
        "status_id": status_id,
        "status_key": status_key,
        "status_name": status_key.replace("_", " ").title(),
        "status_category": "doing" if status_key != "done" else "done",
        "priority": "medium",
        "assignee": None,
        "reporter": "pm",
        "labels": ["seed"],
        "estimate_points": None,
        "due_date": None,
        "sprint_id": None,
        "sprint_name": None,
        "backlog_rank": backlog_rank,
        "created_at": now,
        "updated_at": now,
    }


def test_issue_key_generation():
    from app.services.tasks import create_issue

    project_id = uuid4()
    status_id = uuid4()
    issue_id_1 = uuid4()
    issue_id_2 = uuid4()

    cur = FakeCursor()
    # Create #1
    cur.push_result([{"id": project_id, "key": "WIN"}])  # project FOR UPDATE
    cur.push_result([{"id": status_id}])  # resolve default status
    cur.push_result([{"next_rank": 1}])  # next rank
    cur.push_result([{"next_seq": 1}])  # next issue sequence
    cur.push_result([{"id": issue_id_1}])  # insert issue returning id
    cur.push_result(
        [
            _issue_row(
                issue_id=issue_id_1,
                project_id=project_id,
                status_id=status_id,
                issue_key="WIN-1",
                status_key="todo",
                backlog_rank=1,
            )
        ]
    )  # fetch inserted issue
    # Create #2
    cur.push_result([{"id": project_id, "key": "WIN"}])
    cur.push_result([{"id": status_id}])
    cur.push_result([{"next_rank": 2}])
    cur.push_result([{"next_seq": 2}])
    cur.push_result([{"id": issue_id_2}])
    cur.push_result(
        [
            _issue_row(
                issue_id=issue_id_2,
                project_id=project_id,
                status_id=status_id,
                issue_key="WIN-2",
                status_key="todo",
                backlog_rank=2,
            )
        ]
    )

    with patch("app.services.tasks.get_cursor", _make_fake_cursor(cur)):
        first = create_issue(
            project_id,
            issue_type="task",
            title="First issue",
            description_md="",
            status_id=None,
            priority="medium",
            assignee=None,
            reporter="pm",
            labels=[],
            estimate_points=None,
            due_date=None,
            sprint_id=None,
            backlog_rank=None,
        )
        second = create_issue(
            project_id,
            issue_type="task",
            title="Second issue",
            description_md="",
            status_id=None,
            priority="medium",
            assignee=None,
            reporter="pm",
            labels=[],
            estimate_points=None,
            due_date=None,
            sprint_id=None,
            backlog_rank=None,
        )

    assert first["issue_key"] == "WIN-1"
    assert second["issue_key"] == "WIN-2"


def test_move_issue_changes_status_and_logs_activity():
    from app.services.tasks import move_issue

    issue_id = uuid4()
    project_id = uuid4()
    old_status = uuid4()
    new_status = uuid4()

    cur = FakeCursor()
    cur.push_result(
        [
            _issue_row(
                issue_id=issue_id,
                project_id=project_id,
                status_id=old_status,
                issue_key="WIN-33",
                status_key="todo",
                backlog_rank=1,
            )
        ]
    )  # current
    cur.push_result([{"id": new_status}])  # status validation
    cur.push_result(
        [
            _issue_row(
                issue_id=issue_id,
                project_id=project_id,
                status_id=new_status,
                issue_key="WIN-33",
                status_key="in_progress",
                backlog_rank=3,
            )
        ]
    )  # updated

    with patch("app.services.tasks.get_cursor", _make_fake_cursor(cur)):
        out = move_issue(
            issue_id,
            status_id=new_status,
            status_specified=True,
            sprint_id=None,
            sprint_specified=False,
            backlog_rank=3,
            backlog_rank_specified=True,
            actor="pm",
        )

    assert out["status_id"] == new_status
    activity_inserts = [
        (sql, params)
        for sql, params in cur.queries
        if "INSERT INTO app.task_activity" in sql
    ]
    assert activity_inserts
    assert activity_inserts[0][1][2] == "status_changed"


def test_backlog_rank_ordering():
    from app.services.tasks import move_issue

    issue_id = uuid4()
    project_id = uuid4()
    status_id = uuid4()

    cur = FakeCursor()
    cur.push_result(
        [
            _issue_row(
                issue_id=issue_id,
                project_id=project_id,
                status_id=status_id,
                issue_key="WIN-44",
                status_key="todo",
                backlog_rank=1,
            )
        ]
    )  # current
    cur.push_result(
        [
            _issue_row(
                issue_id=issue_id,
                project_id=project_id,
                status_id=status_id,
                issue_key="WIN-44",
                status_key="todo",
                backlog_rank=8,
            )
        ]
    )  # updated

    with patch("app.services.tasks.get_cursor", _make_fake_cursor(cur)):
        out = move_issue(
            issue_id,
            status_id=None,
            status_specified=False,
            sprint_id=None,
            sprint_specified=False,
            backlog_rank=8,
            backlog_rank_specified=True,
            actor="pm",
        )

    assert out["backlog_rank"] == 8
    activity_inserts = [
        (sql, params)
        for sql, params in cur.queries
        if "INSERT INTO app.task_activity" in sql
    ]
    assert activity_inserts
    assert activity_inserts[0][1][2] == "rank_changed"


def test_seed_endpoint_creates_project_and_issues(client):
    payload = {
        "project_id": str(uuid4()),
        "project_key": "WIN",
        "created_project": True,
        "created_issues": 12,
        "total_issues": 12,
    }
    with patch("app.routes.tasks.tasks_svc.seed_novendor_winston_build", return_value=payload):
        resp = client.post("/api/tasks/seed/novendor_winston_build")
    assert resp.status_code == 200
    body = resp.json()
    assert body["project_key"] == "WIN"
    assert body["created_issues"] >= 1
