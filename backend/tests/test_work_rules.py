"""Tests for work system business rules."""

import os
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

import pytest
from uuid import uuid4
from contextlib import contextmanager
from unittest.mock import patch

from tests.conftest import FakeCursor


def _make_fake_cursor(cur):
    @contextmanager
    def _mock():
        yield cur
    return _mock


def test_update_status_requires_rationale_for_blocked():
    from app.services.work import update_status

    cur = FakeCursor()
    cur.push_result([{"tenant_id": uuid4(), "status": "open"}])

    with patch("app.services.work.get_cursor", _make_fake_cursor(cur)):
        with pytest.raises(ValueError, match="Rationale is required"):
            update_status(uuid4(), "blocked", "actor")


def test_update_status_requires_rationale_for_waiting():
    from app.services.work import update_status

    cur = FakeCursor()
    cur.push_result([{"tenant_id": uuid4(), "status": "open"}])

    with patch("app.services.work.get_cursor", _make_fake_cursor(cur)):
        with pytest.raises(ValueError, match="Rationale is required"):
            update_status(uuid4(), "waiting", "actor")


def test_update_status_requires_rationale_for_resolved():
    from app.services.work import update_status

    cur = FakeCursor()
    cur.push_result([{"tenant_id": uuid4(), "status": "open"}])

    with patch("app.services.work.get_cursor", _make_fake_cursor(cur)):
        with pytest.raises(ValueError, match="Rationale is required"):
            update_status(uuid4(), "resolved", "actor")


def test_update_status_requires_rationale_for_closed():
    from app.services.work import update_status

    cur = FakeCursor()
    cur.push_result([{"tenant_id": uuid4(), "status": "open"}])

    with patch("app.services.work.get_cursor", _make_fake_cursor(cur)):
        with pytest.raises(ValueError, match="Rationale is required"):
            update_status(uuid4(), "closed", "actor")


def test_update_status_allows_open_without_rationale():
    from app.services.work import update_status

    cur = FakeCursor()
    # fetchone for SELECT tenant_id, status
    cur.push_result([{"tenant_id": uuid4(), "status": "in_progress"}])
    # INSERT comment RETURNING (UPDATE doesn't consume a result via fetchone)
    cur.push_result([{"comment_id": uuid4(), "created_at": "2026-01-01T00:00:00Z"}])

    with patch("app.services.work.get_cursor", _make_fake_cursor(cur)):
        result = update_status(uuid4(), "open", "actor")
        assert result["new_status"] == "open"


def test_resolve_item_requires_summary():
    from app.services.work import resolve_item

    cur = FakeCursor()
    cur.push_result([{"tenant_id": uuid4(), "status": "open"}])

    with patch("app.services.work.get_cursor", _make_fake_cursor(cur)):
        # resolve_item always requires summary — empty string is valid
        # but calling with None would fail at DB level
        result_cur = FakeCursor()
        result_cur.push_result([{"tenant_id": uuid4(), "status": "open"}])
        result_cur.push_result([{"resolution_id": uuid4(), "created_at": "2026-01-01T00:00:00Z"}])
        result_cur.push_result([])  # UPDATE work_items
        result_cur.push_result([])  # INSERT comment

        with patch("app.services.work.get_cursor", _make_fake_cursor(result_cur)):
            result = resolve_item(uuid4(), "Fixed the issue", "solved", "actor")
            assert "resolution_id" in result


def test_resolve_closed_item_fails():
    from app.services.work import resolve_item

    cur = FakeCursor()
    cur.push_result([{"tenant_id": uuid4(), "status": "closed"}])

    with patch("app.services.work.get_cursor", _make_fake_cursor(cur)):
        with pytest.raises(ValueError, match="Cannot resolve a closed work item"):
            resolve_item(uuid4(), "summary", "solved", "actor")
