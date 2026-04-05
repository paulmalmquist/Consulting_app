"""Tests for the deploy state singleton."""

from app.observability.deploy_state import (
    DeployState,
    get_deploy_state,
    is_ready,
    set_deploy_state,
    resolve_db_fingerprint,
    resolve_git_sha,
)
import app.observability.deploy_state as ds_mod


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


class TestDeployStateSingleton:
    def setup_method(self):
        ds_mod._state = None

    def teardown_method(self):
        ds_mod._state = None

    def test_get_returns_none_before_set(self):
        assert get_deploy_state() is None

    def test_set_and_get_roundtrip(self):
        state = _make_state()
        set_deploy_state(state)
        assert get_deploy_state() is state

    def test_is_ready_false_when_state_is_none(self):
        assert is_ready() is False

    def test_is_ready_true_when_db_connected_and_schema_ok(self):
        set_deploy_state(_make_state(db_connected=True, schema_contract_ok=True))
        assert is_ready() is True

    def test_is_ready_false_when_db_not_connected(self):
        set_deploy_state(_make_state(db_connected=False, schema_contract_ok=True))
        assert is_ready() is False

    def test_is_ready_false_when_schema_not_ok(self):
        set_deploy_state(_make_state(db_connected=True, schema_contract_ok=False))
        assert is_ready() is False

    def test_to_dict_includes_ready_field(self):
        state = _make_state()
        set_deploy_state(state)
        d = state.to_dict()
        assert d["ready"] is True
        assert d["git_sha"] == "abc1234"
        assert d["db_fingerprint"] == "host:5432/testdb"

    def test_to_dict_ready_false_when_not_ready(self):
        state = _make_state(schema_contract_ok=False, schema_issues=["missing column"])
        d = state.to_dict()
        assert d["ready"] is False
        assert d["schema_issues"] == ["missing column"]


class TestResolvers:
    def test_resolve_git_sha_from_env(self, monkeypatch):
        monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "deadbeef123")
        assert resolve_git_sha() == "deadbeef123"

    def test_resolve_git_sha_none_when_not_set(self, monkeypatch):
        monkeypatch.delenv("RAILWAY_GIT_COMMIT_SHA", raising=False)
        assert resolve_git_sha() is None

    def test_resolve_db_fingerprint(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@db.example.com:6543/mydb")
        fp = resolve_db_fingerprint()
        assert fp == "db.example.com:6543/mydb"
        assert "pass" not in fp

    def test_resolve_db_fingerprint_empty(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "")
        assert resolve_db_fingerprint() is None
