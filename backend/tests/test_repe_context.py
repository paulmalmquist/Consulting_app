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
