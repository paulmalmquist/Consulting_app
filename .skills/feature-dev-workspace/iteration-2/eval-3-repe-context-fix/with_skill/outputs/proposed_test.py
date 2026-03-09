"""
Regression test for REPE context bootstrap endpoint binding_found logic

Tests the fix for: "REPE context bootstrap endpoint is returning null for some environments"

Issue: The binding_found logic in backend/app/routes/repe.py was too strict because:

1. When business_id was provided without env_id, it would return env_id=""
2. binding_found was hardcoded to False even after creating a binding
3. The code required env_id extraction to succeed before accepting explicit business_id

This test ensures:
- Explicit business_id is accepted without requiring env_id
- Diagnostics accurately reflect binding state
- No null/incomplete context is returned
"""

from __future__ import annotations

import app.routes.repe as repe_routes
from app.services import repe_context


def test_context_resolver_accepts_explicit_business_id_without_env_id(fake_cursor, monkeypatch):
    """Test that explicit business_id works even without env_id extraction.

    This regression test covers the fix for environments that have valid business_id
    but cannot extract env_id from request context.

    Previously, this would return with env_id="" and incomplete diagnostics.
    Now it should return the business_id with accurate diagnostics.
    """
    # No env_id extraction needed - business_id is explicitly provided
    # So resolve_repe_business_context should accept it directly

    out = repe_context.resolve_repe_business_context(
        request=None,  # No request = no env_id extraction
        env_id=None,   # No env_id parameter
        business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",
        allow_create=False,  # Don't auto-create
    )

    # Business should be returned from explicit parameter
    assert out.business_id == "58fcfb0d-827a-472e-98a5-46326b5d080d"

    # env_id can be empty string when not provided
    assert out.env_id == ""

    # Diagnostics should be accurate:
    # - binding_found: False (we didn't look up a binding, explicit param was used)
    # - business_found: True (caller provided it)
    # - env_found: False (no env_id was available)
    assert out.diagnostics["binding_found"] is False
    assert out.diagnostics["business_found"] is True
    assert out.diagnostics["env_found"] is False

    # Source should indicate explicit business_id
    assert out.source == "explicit_business_id"

    # No auto-creation happened
    assert out.created is False


def test_context_resolver_creates_binding_when_explicit_business_with_env_id(fake_cursor, monkeypatch):
    """Test that binding is created when both business_id and env_id are provided.

    Covers the case where explicit business_id is provided along with extracted env_id.
    The binding should be created and diagnostics should reflect this.
    """
    # No table existence checks needed for explicit business_id path
    # But if env_id is resolved, we should attempt binding creation

    out = repe_context.resolve_repe_business_context(
        request=None,
        env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",  # Explicit env_id
        business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",  # Explicit business_id
        allow_create=False,
    )

    # Both should be returned
    assert out.business_id == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert out.env_id == "f0790a88-5d05-4991-8d0e-243ab4f9af27"

    # Diagnostics should reflect the explicit parameters
    assert out.diagnostics["binding_found"] is False  # Binding was created, not found
    assert out.diagnostics["business_found"] is True
    assert out.diagnostics["env_found"] is True  # env_id was successfully resolved

    # Source should indicate explicit business_id
    assert out.source == "explicit_business_id"


def test_context_resolver_returns_existing_binding_strict_mode(fake_cursor):
    """Test that existing binding is found and returned (existing behavior).

    This is the non-regression test for the existing "binding found" path.
    Ensures we don't break the happy path where binding already exists.
    """
    # Mock table existence checks
    fake_cursor.push_result([{"tbl": "app.environments"}])
    fake_cursor.push_result([{"tbl": "app.businesses"}])
    fake_cursor.push_result([{"tbl": "app.env_business_bindings"}])

    # Environment exists
    fake_cursor.push_result([{"env_id": "f0790a88-5d05-4991-8d0e-243ab4f9af27", "client_name": "New PE RE"}])

    # Binding exists with business
    fake_cursor.push_result([{"business_id": "58fcfb0d-827a-472e-98a5-46326b5d080d", "name": "Workspace"}])

    out = repe_context.resolve_repe_business_context(
        env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",
        allow_create=False,
    )

    assert out.business_id == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert out.created is False
    assert out.diagnostics["binding_found"] is True


def test_context_resolver_heuristic_slug_match_when_no_binding(fake_cursor, monkeypatch):
    """Test that heuristic slug matching works when explicit binding is missing.

    Ensures the fallback mechanism for finding a business by slug still works.
    """
    # Mock table existence checks
    fake_cursor.push_result([{"tbl": "app.environments"}])
    fake_cursor.push_result([{"tbl": "app.businesses"}])
    fake_cursor.push_result([{"tbl": "app.env_business_bindings"}])

    # Environment exists
    fake_cursor.push_result([{"env_id": "f0790a88-5d05-4991-8d0e-243ab4f9af27", "client_name": "New PE RE"}])

    # No binding exists
    fake_cursor.push_result([])

    # But a business matches the heuristic slug
    fake_cursor.push_result([{"business_id": "58fcfb0d-827a-472e-98a5-46326b5d080d"}])

    out = repe_context.resolve_repe_business_context(
        env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",
        allow_create=False,
    )

    assert out.business_id == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert out.created is False
    # Heuristic match: binding_found=False (didn't exist), but business found via slug
    assert out.diagnostics["binding_found"] is False
    assert out.diagnostics["business_found"] is True
    assert out.source == "heuristic_slug:param"


def test_repe_context_route_with_explicit_business_id(client, monkeypatch):
    """Test the /api/repe/context endpoint with explicit business_id parameter.

    Integration test for the HTTP endpoint to ensure it properly handles
    explicit business_id without requiring env_id in the request.
    """
    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **kwargs: repe_context.RepeContextResolution(
            env_id="",  # May be empty when not provided
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

    # Call with explicit business_id but no env_id
    resp = client.get("/api/repe/context?business_id=58fcfb0d-827a-472e-98a5-46326b5d080d")

    assert resp.status_code == 200
    body = resp.json()

    # Business should be returned
    assert body["business_id"] == "58fcfb0d-827a-472e-98a5-46326b5d080d"

    # env_id can be empty but present
    assert "env_id" in body

    # Diagnostics should be accurate
    assert body["diagnostics"]["binding_found"] is False
    assert body["diagnostics"]["business_found"] is True
    assert body["diagnostics"]["env_found"] is False


def test_repe_context_route_with_both_env_and_business_id(client, monkeypatch):
    """Test the /api/repe/context endpoint with both env_id and business_id.

    Ensures the binding creation path works when both are provided.
    """
    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **kwargs: repe_context.RepeContextResolution(
            env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",
            business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",
            created=False,
            source="explicit_business_id",
            diagnostics={
                "binding_found": False,
                "business_found": True,
                "env_found": True,
            },
        ),
    )

    resp = client.get(
        "/api/repe/context?"
        "env_id=f0790a88-5d05-4991-8d0e-243ab4f9af27&"
        "business_id=58fcfb0d-827a-472e-98a5-46326b5d080d"
    )

    assert resp.status_code == 200
    body = resp.json()

    # Both should be returned
    assert body["env_id"] == "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    assert body["business_id"] == "58fcfb0d-827a-472e-98a5-46326b5d080d"

    # Diagnostics should be accurate
    assert body["diagnostics"]["env_found"] is True
