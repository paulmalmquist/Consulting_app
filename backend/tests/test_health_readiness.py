"""Tests for /health/live, /health/ready, and /health endpoints."""

from unittest.mock import patch

import app.observability.deploy_state as ds_mod
from app.observability.deploy_state import DeployState


def _make_state(**overrides) -> DeployState:
    defaults = dict(
        booted_at="2026-04-05T12:00:00Z",
        git_sha="abc1234",
        db_fingerprint="host:5432/testdb",
        schema_contract_ok=True,
        schema_issues=[],
        db_connected=True,
        migration_head_in_code="999_seed.sql",
        startup_duration_ms=42,
        assistant_boot_enabled=True,
    )
    defaults.update(overrides)
    return DeployState(**defaults)


class TestHealthLive:
    def test_always_returns_200(self, client):
        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json() == {"status": "alive"}


class TestHealthReady:
    def setup_method(self):
        self._original = ds_mod._state

    def teardown_method(self):
        ds_mod._state = self._original

    def test_503_when_state_is_none(self, client):
        ds_mod._state = None
        resp = client.get("/health/ready")
        assert resp.status_code == 503
        body = resp.json()
        assert body["ready"] is False
        assert body["reason"] == "startup_in_progress"

    def test_200_when_ready(self, client):
        ds_mod._state = _make_state()
        resp = client.get("/health/ready")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ready"] is True
        assert body["git_sha"] == "abc1234"
        assert body["db_connected"] is True
        assert body["schema_contract_ok"] is True

    def test_503_when_schema_failed(self, client):
        ds_mod._state = _make_state(
            schema_contract_ok=False,
            schema_issues=["ai_conversations missing column: thread_kind"],
        )
        resp = client.get("/health/ready")
        assert resp.status_code == 503
        body = resp.json()
        assert body["ready"] is False
        assert "thread_kind" in body["schema_issues"][0]

    def test_503_when_db_not_connected(self, client):
        ds_mod._state = _make_state(db_connected=False)
        resp = client.get("/health/ready")
        assert resp.status_code == 503
        body = resp.json()
        assert body["ready"] is False


class TestHealthLegacy:
    def test_always_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
