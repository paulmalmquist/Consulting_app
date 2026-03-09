from __future__ import annotations


import app.routes.repe as repe_routes
from app.services import repe_context


def _regclass_row(name: str | None):
    return [{"tbl": name}]


def test_context_resolver_creates_binding_when_missing(fake_cursor, monkeypatch):
    # table exists checks: app.environments, app.businesses, app.env_business_bindings
    fake_cursor.push_result(_regclass_row("app.environments"))
    fake_cursor.push_result(_regclass_row("app.businesses"))
    fake_cursor.push_result(_regclass_row("app.env_business_bindings"))
    # environment exists
    fake_cursor.push_result([{"env_id": "f0790a88-5d05-4991-8d0e-243ab4f9af27", "client_name": "New PE RE"}])
    # no binding
    fake_cursor.push_result([])

    monkeypatch.setattr(
        repe_context.business_svc,
        "create_business",
        lambda *_args, **_kwargs: {"business_id": "58fcfb0d-827a-472e-98a5-46326b5d080d", "slug": "repe-f0790a88"},
    )

    out = repe_context.resolve_repe_business_context(
        env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",
        allow_create=True,
    )
    assert out.business_id == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert out.created is True
    assert out.diagnostics["binding_found"] is False


def test_context_resolver_returns_existing_binding(fake_cursor):
    fake_cursor.push_result(_regclass_row("app.environments"))
    fake_cursor.push_result(_regclass_row("app.businesses"))
    fake_cursor.push_result(_regclass_row("app.env_business_bindings"))
    fake_cursor.push_result([{"env_id": "f0790a88-5d05-4991-8d0e-243ab4f9af27", "client_name": "New PE RE"}])
    fake_cursor.push_result([{"business_id": "58fcfb0d-827a-472e-98a5-46326b5d080d", "name": "Workspace"}])

    out = repe_context.resolve_repe_business_context(
        env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",
        allow_create=True,
    )
    assert out.business_id == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert out.created is False
    assert out.diagnostics["binding_found"] is True


def test_repe_funds_list_returns_empty_when_no_funds(client, monkeypatch):
    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: repe_context.RepeContextResolution(
            env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",
            business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",
            created=False,
            source="test",
            diagnostics={"binding_found": True, "business_found": True, "env_found": True},
        ),
    )
    monkeypatch.setattr(repe_routes.repe, "list_funds", lambda **_: [])

    resp = client.get("/api/repe/funds?env_id=f0790a88-5d05-4991-8d0e-243ab4f9af27")
    assert resp.status_code == 200
    assert resp.json() == []


def test_repe_context_route_returns_context(client, monkeypatch):
    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: repe_context.RepeContextResolution(
            env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",
            business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",
            created=True,
            source="auto_create:query",
            diagnostics={"binding_found": False, "business_found": True, "env_found": True},
        ),
    )

    resp = client.get("/api/repe/context?env_id=f0790a88-5d05-4991-8d0e-243ab4f9af27")
    assert resp.status_code == 200
    body = resp.json()
    assert body["business_id"] == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert body["created"] is True


def test_repe_context_health_works_without_repe_tables(client, monkeypatch):
    monkeypatch.setattr(
        repe_routes.repe_context,
        "repe_health",
        lambda: {
            "ok": False,
            "migrations_present": ["app.environments", "app.businesses"],
            "missing_tables": ["repe_fund", "repe_deal", "repe_asset"],
            "db_ok": True,
        },
    )

    resp = client.get("/api/repe/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "repe_fund" in body["missing_tables"]


def test_context_resolver_accepts_explicit_business_id_without_env_id():
    """Regression test: explicit business_id should work without env_id extraction.

    Issue: binding_found logic was too strict - it required env_id extraction.
    Now explicit business_id is accepted even when env_id is None.
    """
    out = repe_context.resolve_repe_business_context(
        request=None,  # No request = no env_id extraction
        env_id=None,   # No env_id parameter
        business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",
        allow_create=False,
    )

    assert out.business_id == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert out.env_id == ""
    assert out.diagnostics["binding_found"] is False
    assert out.diagnostics["business_found"] is True
    assert out.diagnostics["env_found"] is False
    assert out.source == "explicit_business_id"
    assert out.created is False


def test_context_resolver_creates_binding_when_explicit_business_with_env_id(fake_cursor):
    """Test that binding is created when both business_id and env_id are provided."""
    out = repe_context.resolve_repe_business_context(
        request=None,
        env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",  # Explicit env_id
        business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",  # Explicit business_id
        allow_create=False,
    )

    assert out.business_id == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert out.env_id == "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    assert out.diagnostics["binding_found"] is False
    assert out.diagnostics["business_found"] is True
    assert out.diagnostics["env_found"] is True
    assert out.source == "explicit_business_id"


def test_repe_context_route_with_explicit_business_id(client, monkeypatch):
    """Integration test: /api/repe/context with explicit business_id parameter."""
    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **kwargs: repe_context.RepeContextResolution(
            env_id="",
            business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",
            created=False,
            source="explicit_business_id",
            diagnostics={
                "binding_found": False,
                "business_found": True,
                "env_found": False,
            },
        ),
    )

    resp = client.get("/api/repe/context?business_id=58fcfb0d-827a-472e-98a5-46326b5d080d")

    assert resp.status_code == 200
    body = resp.json()
    assert body["business_id"] == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert "env_id" in body
    assert body["diagnostics"]["binding_found"] is False
    assert body["diagnostics"]["business_found"] is True
    assert body["diagnostics"]["env_found"] is False
