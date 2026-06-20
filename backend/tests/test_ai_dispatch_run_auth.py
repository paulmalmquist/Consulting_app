"""`POST /api/ai/dispatch/run` must fail closed before any provider call.

The endpoint requires an authenticated **and tenant-scoped** caller (a real
``business_id``). This guards the leak where the MCP dev-bypass (``MCP_API_TOKEN``
unset) authenticates a tenantless admin and a real provider call would execute,
then degrade the receipt for lack of a tenant.

These tests spy on ``run_dispatch`` so a blocked request proves **no** provider,
fallback, or receipt path was ever reached — no network, no model call, no cost.
"""
from __future__ import annotations

import pytest

from app.auth.context import AuthContext

BODY = {"task": "summarize the logs", "mode": "summarization", "risk_level": "low"}


class _FakeResult:
    def model_dump(self, mode: str = "json") -> dict:
        return {"status": "success", "provider": "openai", "model": "gpt-5-mini"}


@pytest.fixture
def spy_run(monkeypatch):
    """Replace the supervisor entrypoint with a spy. If it is never called, no
    provider / fallback / receipt could have run."""
    calls: list = []

    def _spy(scoped):
        calls.append(scoped)
        return _FakeResult()

    monkeypatch.setattr("app.routes.ai_dispatch.run_dispatch", _spy)
    return calls


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr("app.config.AI_DISPATCH_ENABLED", True, raising=False)
    yield


def _auth(monkeypatch, ctx: AuthContext):
    """Drive the real require_tenant_context logic by controlling the AuthContext."""
    monkeypatch.setattr("app.auth.platform.get_request_auth", lambda request: ctx)


# ── /run is blocked without auth + tenant (no provider call) ─────────


def test_anonymous_run_is_401_and_no_provider_call(client, spy_run, enabled, monkeypatch):
    _auth(monkeypatch, AuthContext(actor="anonymous", authenticated=False))
    r = client.post("/api/ai/dispatch/run", json=BODY)
    assert r.status_code == 401
    assert spy_run == []  # supervisor never reached → no provider call


def test_dev_bypass_admin_without_tenant_cannot_run(client, spy_run, enabled, monkeypatch):
    # The actual leak shape: authenticated admin, but NO business_id → 403, no call.
    _auth(
        monkeypatch,
        AuthContext(actor="mcp", authenticated=True, roles=["admin"], business_id=None, provider="mcp"),
    )
    r = client.post("/api/ai/dispatch/run", json=BODY)
    assert r.status_code == 403
    assert "tenant" in r.json()["detail"].lower()
    assert spy_run == []


def test_missing_tenant_returns_before_routing(client, spy_run, enabled, monkeypatch):
    _auth(monkeypatch, AuthContext(actor="user:x", authenticated=True, business_id=None))
    r = client.post("/api/ai/dispatch/run", json={"task": "x", "mode": "code", "risk_level": "high"})
    assert r.status_code == 403
    assert spy_run == []


def test_no_fallback_for_tenantless_request(client, spy_run, enabled, monkeypatch):
    # The gpt-5-mini fallback lives inside run_dispatch; if run_dispatch is never
    # called, no fallback (or any provider) can occur for a tenantless request.
    _auth(monkeypatch, AuthContext(actor="x", authenticated=True, business_id=None))
    r = client.post("/api/ai/dispatch/run", json=BODY)
    assert r.status_code == 403
    assert spy_run == []


def test_flag_disabled_blocks_even_with_tenant(client, spy_run, monkeypatch):
    monkeypatch.setattr("app.config.AI_DISPATCH_ENABLED", False, raising=False)
    _auth(monkeypatch, AuthContext(actor="x", authenticated=True, business_id="biz-1"))
    r = client.post("/api/ai/dispatch/run", json=BODY)
    assert r.status_code == 403
    assert spy_run == []


def test_real_middleware_headerless_request_is_blocked_no_call(client, spy_run, enabled):
    # End-to-end through the REAL auth middleware — the prod dev-bypass shape
    # (no headers). Whatever the MCP_API_TOKEN state, it must not execute a call.
    r = client.post("/api/ai/dispatch/run", json=BODY)
    assert r.status_code in (401, 403)
    assert spy_run == []


# ── /run executes for a real tenant, scoped to that tenant ──────────


def test_authenticated_with_tenant_executes_and_scopes_business_id(client, spy_run, enabled, monkeypatch):
    _auth(
        monkeypatch,
        AuthContext(actor="user:x", authenticated=True, business_id="biz-123", env_id="env-9"),
    )
    r = client.post("/api/ai/dispatch/run", json=BODY)
    assert r.status_code == 200
    assert len(spy_run) == 1
    # tenant injected from the auth context, never trusted from the client body.
    assert spy_run[0].business_id == "biz-123"


def test_client_supplied_business_id_is_overridden_by_auth(client, spy_run, enabled, monkeypatch):
    _auth(monkeypatch, AuthContext(actor="x", authenticated=True, business_id="real-biz"))
    r = client.post("/api/ai/dispatch/run", json={**BODY, "business_id": "spoofed-biz"})
    assert r.status_code == 200
    assert spy_run[0].business_id == "real-biz"


def test_forced_gemma_still_fails_closed_through_route(client, enabled, monkeypatch):
    # Real run_dispatch (no spy): forced Gemma with Gemma unconfigured fails closed —
    # no network, no fallback (forced requests are honored literally).
    for k in ("GEMMA_VERTEX_PROJECT_ID", "GEMMA_VERTEX_LOCATION", "GEMMA_VERTEX_ENDPOINT_ID"):
        monkeypatch.delenv(k, raising=False)
    _auth(monkeypatch, AuthContext(actor="x", authenticated=True, business_id="biz-1"))
    r = client.post(
        "/api/ai/dispatch/run",
        json={"task": "x", "mode": "summarization", "risk_level": "low", "forced_provider": "gemma_gcp"},
    )
    assert r.status_code == 200
    assert r.json()["status"] in ("unavailable", "blocked")  # never success


# ── Read-only + config boundaries unchanged ─────────────────────────


def test_config_post_still_requires_auth(client, monkeypatch):
    _auth(monkeypatch, AuthContext(actor="anonymous", authenticated=False))
    r = client.post("/api/ai/dispatch/config", json={"gemma_enabled": True})
    assert r.status_code == 401


def test_read_only_endpoints_open_without_tenant(client, monkeypatch):
    # providers / evals / config GET never required a tenant — still don't.
    _auth(monkeypatch, AuthContext(actor="anonymous", authenticated=False))
    assert client.get("/api/ai/dispatch/providers").status_code == 200
    assert client.get("/api/ai/dispatch/config").status_code == 200
    assert client.get("/api/ai/dispatch/evals").status_code == 200


def test_runs_still_requires_auth(client, monkeypatch):
    _auth(monkeypatch, AuthContext(actor="anonymous", authenticated=False))
    assert client.get("/api/ai/dispatch/runs").status_code == 401
