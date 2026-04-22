"""Runner tests — verify background task error handling and DB status writes."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from app.services.podcast_extraction import ExtractionResult
from app.services.podcast_runner import run_extraction_in_background


class _FakeCursor:
    def __init__(self, state: dict):
        self.state = state

    def execute(self, sql, params=()):
        s = " ".join(sql.split()).lower()
        if "update public.podcast_episodes" in s:
            self.state["last_update_sql"] = s
            self.state["last_update_params"] = params


@pytest.fixture
def fake_db():
    state: dict = {}

    @contextmanager
    def fake_cursor():
        yield _FakeCursor(state)

    with patch("app.services.podcast_runner.get_cursor", fake_cursor):
        yield state


def test_runner_returns_result_on_success(fake_db):
    eid = uuid.uuid4()
    success = ExtractionResult(episode_id=eid, tenant_id=None, macro_views_written=3)
    with patch(
        "app.services.podcast_runner.extract_episode", return_value=success
    ):
        result = run_extraction_in_background(eid)
    assert result is not None
    assert result.macro_views_written == 3
    # No failure status write.
    assert "last_update_sql" not in fake_db


def test_runner_catches_value_error_and_marks_failed(fake_db):
    eid = uuid.uuid4()
    with patch(
        "app.services.podcast_runner.extract_episode",
        side_effect=ValueError("empty transcript"),
    ):
        result = run_extraction_in_background(eid)
    assert result is None
    assert "failed" in fake_db["last_update_sql"]
    # The metadata JSON blob should contain the error reason.
    payload = fake_db["last_update_params"][0]
    assert "empty transcript" in payload


def test_runner_catches_unexpected_exception(fake_db):
    eid = uuid.uuid4()
    with patch(
        "app.services.podcast_runner.extract_episode",
        side_effect=RuntimeError("LLM API down"),
    ):
        result = run_extraction_in_background(eid)
    assert result is None
    payload = fake_db["last_update_params"][0]
    assert "RuntimeError" in payload
    assert "LLM API down" in payload
