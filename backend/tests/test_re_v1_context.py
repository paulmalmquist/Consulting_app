"""Tests for GET /api/re/v1/context — canonical RE workspace context endpoint.

This test file covers the production regression pattern:
  - 405 Method Not Allowed on context endpoint
  - Infinite spinner (context hanging, not returning structured error)

Every failure class that has caused a production outage must have a regression
test here so that CI catches regressions before deploy.
"""
from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

import pytest

import app.routes.re_v1_context as re_v1_ctx_routes
from tests.conftest import FakeCursor


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_resolution(env_id: str, biz_id: str):
    from app.services.repe_context import RepeContextResolution

    return RepeContextResolution(
        env_id=env_id,
        business_id=biz_id,
        created=False,
        source="binding:param",
        diagnostics={"binding_found": True, "business_found": True, "env_found": True},
    )


def _mock_resolver(env_id: str, biz_id: str):
    res = _make_resolution(env_id, biz_id)
    return lambda **_: res


def _make_cursor(*result_rows) -> FakeCursor:
    """Build a FakeCursor pre-loaded with results for get_re_context DB calls.

    The route makes fetchone() calls in this order:
      1. check app.environments table exists
      2. SELECT industry FROM app.environments
      3. check repe_fund table exists
      4. SELECT count(*) FROM repe_fund
      5. check re_scenario table exists
      6. SELECT count(*) FROM re_scenario

    Each argument is a list of rows for one fetchone() call.
    """
    cur = FakeCursor()
    for rows in result_rows:
        cur.push_result(rows)
    return cur


def _patch_get_cursor(monkeypatch, cur: FakeCursor) -> None:
    """Patch get_cursor in the re_v1_context route module."""

    @contextmanager
    def mock_cursor():
        yield cur

    monkeypatch.setattr(re_v1_ctx_routes, "get_cursor", mock_cursor)


# ---------------------------------------------------------------------------
# GET /api/re/v1/context
# ---------------------------------------------------------------------------


def test_get_context_bootstrapped_returns_200(client, monkeypatch):
    """GET context with bootstrapped workspace → 200 with full deterministic payload."""
    env_id = str(uuid4())
    biz_id = str(uuid4())

    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "resolve_repe_business_context",
        _mock_resolver(env_id, biz_id),
    )

    cur = _make_cursor(
        [{"1": 1}],                          # app.environments table exists
        [{"industry": "real_estate"}],        # industry row
        [{"1": 1}],                          # repe_fund table exists
        [{"cnt": 2}],                        # funds_count = 2
        [{"1": 1}],                          # re_scenario table exists
        [{"cnt": 3}],                        # scenarios_count = 3
    )
    _patch_get_cursor(monkeypatch, cur)

    resp = client.get(f"/api/re/v1/context?env_id={env_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["env_id"] == env_id
    assert data["business_id"] == biz_id
    assert data["industry"] == "real_estate"
    assert data["is_bootstrapped"] is True
    assert data["funds_count"] == 2
    assert data["scenarios_count"] == 3


def test_get_context_not_bootstrapped_returns_422(client, monkeypatch):
    """GET context when workspace has no funds → 422 RE_NOT_BOOTSTRAPPED.

    This structured error tells the frontend to call POST /context/bootstrap.
    Never a silent 200 with empty data — that would cause an ambiguous empty state.
    """
    env_id = str(uuid4())
    biz_id = str(uuid4())

    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "resolve_repe_business_context",
        _mock_resolver(env_id, biz_id),
    )

    cur = _make_cursor(
        [{"1": 1}],                          # app.environments table exists
        [{"industry": "real_estate"}],        # industry row
        [{"1": 1}],                          # repe_fund table exists
        [{"cnt": 0}],                        # funds_count = 0 → not bootstrapped
        # re_scenario NOT checked — raise happens before that
    )
    _patch_get_cursor(monkeypatch, cur)

    resp = client.get(f"/api/re/v1/context?env_id={env_id}")
    assert resp.status_code == 422
    data = resp.json()
    assert data["detail"]["error_code"] == "RE_NOT_BOOTSTRAPPED"
    assert "bootstrap" in data["detail"]["message"].lower()
    assert data["detail"]["detail"]["env_id"] == env_id
    assert data["detail"]["detail"]["funds_count"] == 0
    assert "bootstrap_endpoint" in data["detail"]["detail"]


def test_get_context_wrong_industry_returns_400(client, monkeypatch):
    """GET context when env industry != real_estate → 400 WRONG_INDUSTRY.

    Prevents loading RE workspace in a non-RE environment.
    """
    env_id = str(uuid4())
    biz_id = str(uuid4())

    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "resolve_repe_business_context",
        _mock_resolver(env_id, biz_id),
    )

    cur = _make_cursor(
        [{"1": 1}],              # app.environments table exists
        [{"industry": "legal"}], # wrong industry
        # route raises 400 — no further DB calls
    )
    _patch_get_cursor(monkeypatch, cur)

    resp = client.get(f"/api/re/v1/context?env_id={env_id}")
    assert resp.status_code == 400
    data = resp.json()
    assert data["detail"]["error_code"] == "WRONG_INDUSTRY"
    assert data["detail"]["detail"]["actual_industry"] == "legal"
    assert data["detail"]["detail"]["required_industry"] == "real_estate"


def test_get_context_missing_env_id_returns_400(client, monkeypatch):
    """GET context without env_id → 400 CONTEXT_ERROR with structured envelope.

    Must never return 500 or hang silently.
    """
    from app.services.repe_context import RepeContextError

    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: (_ for _ in ()).throw(
            RepeContextError("No environment context found. Provide env_id or X-Env-Id.")
        ),
    )
    resp = client.get("/api/re/v1/context")
    assert resp.status_code == 400
    data = resp.json()
    assert data["detail"]["error_code"] == "CONTEXT_ERROR"
    assert "env_id" in data["detail"]["message"]


def test_get_context_schema_not_migrated_returns_503(client, monkeypatch):
    """GET context when migration missing → 503 SCHEMA_NOT_MIGRATED.

    Must never 405 or 500. Structured error lets the operator know the fix.
    """
    from app.services.repe_context import RepeContextError

    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: (_ for _ in ()).throw(
            RepeContextError("Binding table is missing (app.env_business_bindings). Run migration 266.")
        ),
    )
    resp = client.get("/api/re/v1/context?env_id=some-env")
    assert resp.status_code == 503
    data = resp.json()
    assert data["detail"]["error_code"] == "SCHEMA_NOT_MIGRATED"


def test_get_context_never_returns_405(client, monkeypatch):
    """GET /api/re/v1/context must NEVER return 405 Method Not Allowed.

    405 in production is an architecture violation per RULES.MD.
    """
    from app.services.repe_context import RepeContextError

    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: (_ for _ in ()).throw(
            RepeContextError("No environment context found. Provide env_id or X-Env-Id.")
        ),
    )

    resp = client.get("/api/re/v1/context")
    assert resp.status_code != 405, (
        "GET /api/re/v1/context returned 405 — architecture violation. "
        "Route is not registered as GET or is missing from main.py."
    )


def test_post_to_context_returns_405(client):
    """POST to GET-only context endpoint must return 405.

    If POST returns anything other than 405, the method contract is wrong.
    The frontend must use GET for context — never POST.
    """
    resp = client.post("/api/re/v1/context?env_id=any")
    assert resp.status_code == 405, (
        "POST /api/re/v1/context should return 405 — only GET is allowed. "
        "Unexpected status indicates route method contract is violated."
    )


# ---------------------------------------------------------------------------
# OPTIONS /api/re/v1/context
# ---------------------------------------------------------------------------


def test_options_context_returns_200(client):
    """OPTIONS /api/re/v1/context must return 200 with Allow header containing GET.

    All RE route files must support OPTIONS per RULES.MD.
    This prevents CORS preflight failures in production.
    """
    resp = client.options("/api/re/v1/context")
    assert resp.status_code == 200
    allow = resp.headers.get("allow", "").upper()
    assert "GET" in allow, f"OPTIONS Allow header missing GET: got '{allow}'"


# ---------------------------------------------------------------------------
# POST /api/re/v1/context/bootstrap
# ---------------------------------------------------------------------------


def test_bootstrap_post_returns_200(client, monkeypatch):
    """POST /context/bootstrap seeds workspace and returns bootstrapped context payload."""
    env_id = str(uuid4())
    biz_id = str(uuid4())

    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "resolve_repe_business_context",
        _mock_resolver(env_id, biz_id),
    )
    monkeypatch.setattr(
        re_v1_ctx_routes.repe_context,
        "seed_repe_workspace",
        lambda business_id, env_id: None,  # seed is a no-op in test
    )

    cur = _make_cursor(
        [{"1": 1}],      # repe_fund table exists
        [{"cnt": 1}],    # funds_count after seeding = 1
        [{"1": 1}],      # re_scenario table exists
        [{"cnt": 1}],    # scenarios_count = 1
    )
    _patch_get_cursor(monkeypatch, cur)

    resp = client.post(f"/api/re/v1/context/bootstrap?env_id={env_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["env_id"] == env_id
    assert data["business_id"] == biz_id
    assert data["is_bootstrapped"] is True
    assert data["industry"] == "real_estate"
    assert data["funds_count"] == 1


def test_options_bootstrap_returns_200(client):
    """OPTIONS /api/re/v1/context/bootstrap must return 200."""
    resp = client.options("/api/re/v1/context/bootstrap")
    assert resp.status_code == 200


def test_get_to_bootstrap_returns_405(client):
    """GET to POST-only bootstrap endpoint returns 405.

    Bootstrap is a state-mutating operation and must only accept POST.
    """
    resp = client.get("/api/re/v1/context/bootstrap?env_id=any")
    assert resp.status_code == 405


# ---------------------------------------------------------------------------
# Structural: route registration introspection
# ---------------------------------------------------------------------------


def test_context_route_registered_as_get_in_main():
    """Introspect route handler — GET /api/re/v1/context must be registered.

    If this fails: add re_v1_context.router to app.include_router() in main.py.
    A missing registration causes 404 or 405 in production on every page load.
    """
    from app.main import app

    get_routes = [
        r
        for r in app.routes
        if getattr(r, "path", None) == "/api/re/v1/context"
        and "GET" in getattr(r, "methods", set())
    ]
    assert len(get_routes) >= 1, (
        "GET /api/re/v1/context is not registered in app.routes. "
        "This causes 405 in production. Ensure re_v1_context.router is included in main.py."
    )


def test_bootstrap_route_registered_as_post_in_main():
    """Introspect route handler — POST /api/re/v1/context/bootstrap must be registered."""
    from app.main import app

    post_routes = [
        r
        for r in app.routes
        if getattr(r, "path", None) == "/api/re/v1/context/bootstrap"
        and "POST" in getattr(r, "methods", set())
    ]
    assert len(post_routes) >= 1, (
        "POST /api/re/v1/context/bootstrap is not registered. "
        "Bootstrap auto-retry will fail with 404/405 on first RE page load."
    )
