"""Route contract tests — services mocked, validates schemas + error mapping."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from app.services.podcast_ingest import IngestResult, RssIngestResult


def test_ingest_transcript_happy_path(client):
    result = IngestResult(
        episode_id=uuid.uuid4(),
        source_id=uuid.uuid4(),
        title="Test",
        transcription_status="completed",
        transcription_model="manual_transcript",
    )
    with patch(
        "app.routes.podcast_intelligence.ingest_transcript", return_value=result
    ):
        resp = client.post(
            "/api/v1/podcast/ingest/transcript",
            json={"title": "Test", "text": "body", "source_name": "X"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["transcription_status"] == "completed"
    assert body["transcription_model"] == "manual_transcript"
    assert body["title"] == "Test"


def test_ingest_transcript_rejects_empty_text(client):
    resp = client.post(
        "/api/v1/podcast/ingest/transcript",
        json={"title": "Test", "text": "", "source_name": "X"},
    )
    # Pydantic min_length=1 → 422
    assert resp.status_code == 422


def test_ingest_youtube_surfaces_missing_dep_as_503(client):
    with patch(
        "app.routes.podcast_intelligence.ingest_youtube",
        side_effect=RuntimeError("yt-dlp is not installed"),
    ):
        resp = client.post(
            "/api/v1/podcast/ingest/youtube",
            json={"url": "https://youtube.com/watch?v=abc"},
        )
    assert resp.status_code == 503
    assert "yt-dlp" in resp.json()["detail"]


def test_ingest_rss_returns_episode_list(client):
    result = RssIngestResult(
        source_id=uuid.uuid4(),
        episodes_found=3,
        episode_ids=[uuid.uuid4() for _ in range(3)],
    )
    with patch("app.routes.podcast_intelligence.ingest_rss", return_value=result):
        resp = client.post(
            "/api/v1/podcast/ingest/rss",
            json={"feed_url": "https://example.com/feed.xml", "limit": 25},
        )
    assert resp.status_code == 200
    assert resp.json()["episodes_found"] == 3
    assert len(resp.json()["episode_ids"]) == 3


def test_list_episodes_uses_filters(client):
    calls = []

    class FakeCursor:
        def execute(self, sql, params=()):
            calls.append((sql, params))
            self._pending = None

        def fetchone(self):
            return {"c": 0}

        def fetchall(self):
            return []

    @contextmanager
    def fake_get_cursor():
        yield FakeCursor()

    with patch("app.routes.podcast_intelligence.get_cursor", fake_get_cursor):
        resp = client.get(
            "/api/v1/podcast/episodes?extraction_status=completed&limit=10"
        )
    assert resp.status_code == 200
    assert resp.json() == {"episodes": [], "total": 0}
    # At least one query should have filtered on extraction_status.
    assert any("extraction_status = %s" in c[0] for c in calls)


def test_extract_trigger_404_when_missing(client):
    class FakeCursor:
        def execute(self, sql, params=()):
            self._pending = None
        def fetchone(self):
            return None

    @contextmanager
    def fake_get_cursor():
        yield FakeCursor()

    with patch("app.routes.podcast_intelligence.get_cursor", fake_get_cursor):
        resp = client.post(f"/api/v1/podcast/episodes/{uuid.uuid4()}/extract")
    assert resp.status_code == 404


def test_extract_trigger_409_when_transcription_pending(client):
    class FakeCursor:
        def execute(self, sql, params=()):
            pass
        def fetchone(self):
            return {"transcription_status": "pending", "extraction_status": "pending"}

    @contextmanager
    def fake_get_cursor():
        yield FakeCursor()

    with patch("app.routes.podcast_intelligence.get_cursor", fake_get_cursor):
        resp = client.post(f"/api/v1/podcast/episodes/{uuid.uuid4()}/extract")
    assert resp.status_code == 409
    assert "pending" in resp.json()["detail"]


def test_extract_trigger_queued_when_ready(client):
    class FakeCursor:
        def execute(self, sql, params=()):
            pass
        def fetchone(self):
            return {"transcription_status": "completed", "extraction_status": "pending"}

    @contextmanager
    def fake_get_cursor():
        yield FakeCursor()

    with patch("app.routes.podcast_intelligence.get_cursor", fake_get_cursor):
        resp = client.post(f"/api/v1/podcast/episodes/{uuid.uuid4()}/extract")
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued"
