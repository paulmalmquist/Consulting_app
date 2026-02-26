"""Tests for RE context resolution and structured error handling.

Verifies that the REPE context endpoint returns structured errors
and that the context resolver properly auto-creates businesses.
"""
from __future__ import annotations

from uuid import uuid4

import app.routes.repe as repe_routes


def test_context_returns_structured_error_on_missing_env(client, monkeypatch):
    """Context endpoint should return structured error when env_id is missing."""
    from app.services.repe_context import RepeContextError

    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: (_ for _ in ()).throw(
            RepeContextError("No environment context found. Provide env_id or X-Env-Id.")
        ),
    )
    resp = client.get("/api/repe/context")
    assert resp.status_code == 400
    data = resp.json()
    assert data["detail"]["error_code"] == "CONTEXT_ERROR"


def test_context_returns_structured_error_on_missing_table(client, monkeypatch):
    """Context endpoint should return 503 with SCHEMA_NOT_MIGRATED."""
    from app.services.repe_context import RepeContextError

    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: (_ for _ in ()).throw(
            RepeContextError("Binding table is missing (app.env_business_bindings). Run migration 266.")
        ),
    )
    resp = client.get("/api/repe/context?env_id=test-id")
    assert resp.status_code == 503
    data = resp.json()
    assert data["detail"]["error_code"] == "SCHEMA_NOT_MIGRATED"


def test_context_returns_business_id_on_success(client, monkeypatch):
    """Successful context resolution returns env_id and business_id."""
    from app.services.repe_context import RepeContextResolution

    env_id = str(uuid4())
    biz_id = str(uuid4())

    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: RepeContextResolution(
            env_id=env_id,
            business_id=biz_id,
            created=False,
            source="binding:param",
            diagnostics={"binding_found": True, "business_found": True, "env_found": True},
        ),
    )
    resp = client.get(f"/api/repe/context?env_id={env_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["business_id"] == biz_id
    assert data["env_id"] == env_id


def test_re_v2_investment_not_found_returns_structured_error(client, monkeypatch):
    """RE v2 404 should return structured error with error_code."""
    import app.routes.re_v2 as re_v2_routes

    inv_id = str(uuid4())
    monkeypatch.setattr(
        re_v2_routes.re_investment,
        "get_investment",
        lambda **_: (_ for _ in ()).throw(LookupError(f"Investment {inv_id} not found")),
    )
    resp = client.get(f"/api/re/v2/investments/{inv_id}")
    assert resp.status_code == 404
    data = resp.json()
    assert data["detail"]["error_code"] == "NOT_FOUND"
    assert inv_id in data["detail"]["message"]


def test_context_init_creates_business(client, monkeypatch):
    """POST /api/repe/context/init should trigger auto-create."""
    from app.services.repe_context import RepeContextResolution

    env_id = str(uuid4())
    biz_id = str(uuid4())

    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: RepeContextResolution(
            env_id=env_id,
            business_id=biz_id,
            created=True,
            source="auto_create:param",
            diagnostics={"binding_found": False, "business_found": True, "env_found": True},
        ),
    )
    resp = client.post(
        "/api/repe/context/init",
        json={"env_id": env_id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] is True
    assert data["business_id"] == biz_id
