"""Routes: provider listing, dry-run routing, auth gates, and the flag gate."""
from __future__ import annotations

from fastapi import HTTPException

from app.auth.context import AuthContext


def _deny_auth(request):
    # Mirror what require_authenticated_request raises for an anonymous caller in prod.
    raise HTTPException(status_code=401, detail="Authentication required")


def _fake_auth(business_id="biz1", env_id="env1"):
    def _dep(request):
        return AuthContext(
            actor="tester",
            authenticated=True,
            business_id=business_id,
            env_id=env_id,
        )

    return _dep


def test_providers_listed(client):
    resp = client.get("/api/ai/dispatch/providers")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()["providers"]}
    assert names == {"openai", "anthropic", "gemma_gcp"}


def test_provider_detail_and_404(client):
    ok = client.get("/api/ai/dispatch/providers/gemma_gcp")
    assert ok.status_code == 200
    assert ok.json()["available"] is False
    assert client.get("/api/ai/dispatch/providers/bogus").status_code == 404


def test_route_dry_run_forced_gemma_blocked(client):
    body = {"task": "x", "mode": "code", "risk_level": "high", "forced_provider": "gemma_gcp"}
    resp = client.post("/api/ai/dispatch/route", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "blocked"
    assert data["null_reason"] == "risk_tier_forbidden"


def test_runs_rejects_unauthenticated(client, monkeypatch):
    # The harness dev-auth bypass authenticates by default, so assert the gate
    # directly: an anonymous caller (401 from the auth dependency) is rejected.
    monkeypatch.setattr("app.routes.ai_dispatch.require_authenticated_request", _deny_auth)
    assert client.get("/api/ai/dispatch/runs").status_code == 401


def test_run_rejects_unauthenticated(client, monkeypatch):
    monkeypatch.setattr("app.routes.ai_dispatch.require_authenticated_request", _deny_auth)
    body = {"task": "x", "mode": "summarization", "risk_level": "low"}
    assert client.post("/api/ai/dispatch/run", json=body).status_code == 401


def test_runs_authed_returns_scoped_payload(client, monkeypatch):
    monkeypatch.setattr("app.routes.ai_dispatch.require_authenticated_request", _fake_auth())
    resp = client.get("/api/ai/dispatch/runs")
    assert resp.status_code == 200
    assert "runs" in resp.json()


def test_run_disabled_returns_403(client, monkeypatch):
    monkeypatch.setattr("app.routes.ai_dispatch.require_authenticated_request", _fake_auth())
    monkeypatch.setattr("app.config.AI_DISPATCH_ENABLED", False)
    body = {"task": "x", "mode": "summarization", "risk_level": "low"}
    assert client.post("/api/ai/dispatch/run", json=body).status_code == 403


def test_run_enabled_gemma_unavailable(client, monkeypatch):
    monkeypatch.setattr("app.routes.ai_dispatch.require_authenticated_request", _fake_auth())
    monkeypatch.setattr("app.config.AI_DISPATCH_ENABLED", True)
    # Avoid any DB by short-circuiting the receipt write.
    monkeypatch.setattr("app.services.ai_dispatch.receipts.record_decision", lambda **kw: None)
    body = {"task": "summarize these logs", "mode": "summarization", "risk_level": "low"}
    resp = client.post("/api/ai/dispatch/run", json=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "unavailable"
    assert data["null_reason"] == "provider_not_configured"
