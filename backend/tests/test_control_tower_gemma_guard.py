"""Gemma lifecycle safety guard — warm/teardown fail closed without the right role/flag/token (no GPU).

The guard runs before any DB or Vertex call, so these tests never touch the cloud."""
from __future__ import annotations

import pytest

from app.services.control_tower import gemma_tier
from app.services.control_tower.gemma_tier import LifecyclePermissionError

ENV = "env-test"
BIZ = "00000000-0000-0000-0000-000000000000"


def _warm(**kw):
    base = dict(env_id=ENV, business_id=BIZ, requested_by="op", is_operator=True,
                confirm=gemma_tier.WARM_CONFIRM)
    base.update(kw)
    return gemma_tier.request_warm(**base)


def test_non_operator_blocked(monkeypatch):
    monkeypatch.setenv("CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED", "true")
    with pytest.raises(LifecyclePermissionError, match="operator role"):
        _warm(is_operator=False)


def test_disabled_flag_blocks(monkeypatch):
    monkeypatch.delenv("CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED", raising=False)
    with pytest.raises(LifecyclePermissionError, match="disabled"):
        _warm()


def test_wrong_confirm_token_blocks(monkeypatch):
    monkeypatch.setenv("CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED", "true")
    with pytest.raises(LifecyclePermissionError, match="confirmation token"):
        _warm(confirm="nope")


def test_prod_requires_allow_prod(monkeypatch):
    monkeypatch.setenv("CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED", "true")
    monkeypatch.setenv("CONTROL_TOWER_IS_PROD", "true")
    monkeypatch.delenv("CONTROL_TOWER_GEMMA_LIFECYCLE_ALLOW_PROD", raising=False)
    with pytest.raises(LifecyclePermissionError, match="production"):
        _warm()


def test_run_job_fails_closed_when_disabled(fake_cursor, monkeypatch):
    monkeypatch.delenv("CONTROL_TOWER_GEMMA_LIFECYCLE_ENABLED", raising=False)
    fake_cursor.push_result([{  # SELECT job
        "id": "job-1", "env_id": ENV, "business_id": BIZ, "action": "warm", "status": "queued",
    }])
    out = gemma_tier.run_job("job-1")
    assert out["status"] == "failed"
    assert "disabled" in out["error"]
