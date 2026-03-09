"""
Regression test for REPE context binding_found fix.

This test covers the case where:
- env_id exists in app.environments
- NO explicit binding row exists in app.env_business_bindings
- Heuristic slug matching fails to find a candidate business
- allow_create=True, so we auto-create business and binding

Expected behavior (before fix): binding_found=False, created=True
Expected behavior (after fix): binding_found=True, created=True

The fix ensures that binding_found reflects whether a valid binding exists NOW,
not whether we found a pre-existing row in the SELECT query.
"""

from app.services import repe_context


def test_context_resolver_auto_creates_binding_with_binding_found_true(fake_cursor, monkeypatch):
    """
    Regression test: env_id exists, no binding, heuristic fails, auto-create succeeds.

    This simulates an environment in production where:
    1. Environment record exists in app.environments
    2. No env_business_bindings row exists yet
    3. Heuristic slug search finds no candidate business
    4. System auto-creates a new business and binding

    After the fix, binding_found should be True because the binding now exists.
    """
    # Setup: table existence checks (3 separate SELECT queries)
    fake_cursor.push_result([{"tbl": "app.environments"}])
    fake_cursor.push_result([{"tbl": "app.businesses"}])
    fake_cursor.push_result([{"tbl": "app.env_business_bindings"}])

    # Environment exists
    env_id = "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    fake_cursor.push_result([{"env_id": env_id, "client_name": "New PE RE"}])

    # No explicit binding found (JOIN returns empty)
    fake_cursor.push_result([])

    # Heuristic slug search finds no candidate
    fake_cursor.push_result([])

    # Mock business creation (called by business_svc.create_business)
    created_business_id = "58fcfb0d-827a-472e-98a5-46326b5d080d"
    monkeypatch.setattr(
        repe_context.business_svc,
        "create_business",
        lambda *_args, **_kwargs: {
            "business_id": created_business_id,
            "slug": f"repe-f0790a88",
        },
    )

    # Call resolve with env_id only (no explicit business_id)
    out = repe_context.resolve_repe_business_context(
        env_id=env_id,
        allow_create=True,
    )

    # Assertions
    assert out.env_id == env_id, f"Expected env_id={env_id}, got {out.env_id}"
    assert out.business_id == created_business_id, f"Expected business_id={created_business_id}, got {out.business_id}"
    assert out.created is True, "Expected created=True (business was auto-created)"
    assert out.source.startswith("auto_create:"), f"Expected source to start with 'auto_create:', got {out.source}"

    # KEY FIX: binding_found should be True because binding now exists (we just created it)
    assert out.diagnostics["binding_found"] is True, (
        "REGRESSION: binding_found should be True after auto-create. "
        "The binding was just inserted, so it exists now. "
        "Downstream code relies on binding_found to determine binding validity."
    )
    assert out.diagnostics["business_found"] is True, "Expected business_found=True"
    assert out.diagnostics["env_found"] is True, "Expected env_found=True"


def test_context_resolver_explicit_binding_has_binding_found_true(fake_cursor):
    """
    Verify that pre-existing bindings are still reported correctly.

    This test ensures our fix doesn't break the case where a binding already existed.
    """
    # Setup: table existence checks
    fake_cursor.push_result([{"tbl": "app.environments"}])
    fake_cursor.push_result([{"tbl": "app.businesses"}])
    fake_cursor.push_result([{"tbl": "app.env_business_bindings"}])

    # Environment exists
    env_id = "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    fake_cursor.push_result([{"env_id": env_id, "client_name": "PE RE"}])

    # Explicit binding found (JOIN returns row)
    business_id = "58fcfb0d-827a-472e-98a5-46326b5d080d"
    fake_cursor.push_result([{"business_id": business_id, "name": "Workspace"}])

    out = repe_context.resolve_repe_business_context(
        env_id=env_id,
        allow_create=True,
    )

    assert out.env_id == env_id
    assert out.business_id == business_id
    assert out.created is False, "Expected created=False (binding already existed)"
    assert out.diagnostics["binding_found"] is True, (
        "Expected binding_found=True when an explicit binding row is found"
    )


def test_context_resolver_heuristic_match_has_binding_found_false(fake_cursor):
    """
    Verify that heuristic matches report binding_found=False.

    Heuristic matching is NOT finding a pre-existing binding;
    it's finding a business via slug heuristic and creating a NEW binding.
    So binding_found should be False.
    """
    # Setup: table existence checks
    fake_cursor.push_result([{"tbl": "app.environments"}])
    fake_cursor.push_result([{"tbl": "app.businesses"}])
    fake_cursor.push_result([{"tbl": "app.env_business_bindings"}])

    # Environment exists
    env_id = "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    fake_cursor.push_result([{"env_id": env_id, "client_name": "PE RE"}])

    # No explicit binding
    fake_cursor.push_result([])

    # Heuristic slug match finds a candidate
    business_id = "99999999-827a-472e-98a5-46326b5d080d"
    fake_cursor.push_result([{"business_id": business_id}])

    out = repe_context.resolve_repe_business_context(
        env_id=env_id,
        allow_create=True,
    )

    assert out.env_id == env_id
    assert out.business_id == business_id
    assert out.created is False, "Expected created=False (matched via slug, didn't create business)"
    assert out.diagnostics["binding_found"] is False, (
        "Expected binding_found=False for heuristic match "
        "(we found a business, not a pre-existing binding row)"
    )


def test_context_resolver_raises_error_when_no_create_allowed(fake_cursor):
    """
    Verify that when allow_create=False and no binding exists, we raise an error.
    """
    # Setup: table existence checks
    fake_cursor.push_result([{"tbl": "app.environments"}])
    fake_cursor.push_result([{"tbl": "app.businesses"}])
    fake_cursor.push_result([{"tbl": "app.env_business_bindings"}])

    # Environment exists
    env_id = "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    fake_cursor.push_result([{"env_id": env_id, "client_name": "PE RE"}])

    # No explicit binding
    fake_cursor.push_result([])

    # No heuristic match
    fake_cursor.push_result([])

    # When allow_create=False, should raise error
    try:
        repe_context.resolve_repe_business_context(
            env_id=env_id,
            allow_create=False,  # <-- Key: disallow auto-create
        )
        assert False, "Expected RepeContextError to be raised"
    except repe_context.RepeContextError as e:
        assert "No business binding found" in str(e)


# INTEGRATION TEST: Verify the endpoint returns proper response
# (This uses monkeypatch to mock resolve_repe_business_context for clean testing)

def test_repe_context_endpoint_returns_successful_response_on_auto_create(client, monkeypatch):
    """
    End-to-end test: /api/repe/context endpoint returns valid response on auto-create.
    """
    import app.routes.repe as repe_routes

    # Mock the resolver to return auto-created context
    monkeypatch.setattr(
        repe_routes.repe_context,
        "resolve_repe_business_context",
        lambda **_: repe_context.RepeContextResolution(
            env_id="f0790a88-5d05-4991-8d0e-243ab4f9af27",
            business_id="58fcfb0d-827a-472e-98a5-46326b5d080d",
            created=True,  # Auto-created
            source="auto_create:query",
            diagnostics={
                "binding_found": True,  # FIX: Should be True because binding was created
                "business_found": True,
                "env_found": True,
            },
        ),
    )

    resp = client.get("/api/repe/context?env_id=f0790a88-5d05-4991-8d0e-243ab4f9af27")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    body = resp.json()

    # Verify response structure
    assert "env_id" in body, "Response missing env_id"
    assert "business_id" in body, "Response missing business_id"
    assert "created" in body, "Response missing created"
    assert "source" in body, "Response missing source"
    assert "diagnostics" in body, "Response missing diagnostics"

    # Verify values
    assert body["env_id"] == "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    assert body["business_id"] == "58fcfb0d-827a-472e-98a5-46326b5d080d"
    assert body["created"] is True
    assert body["diagnostics"]["binding_found"] is True
    assert body["diagnostics"]["business_found"] is True
    assert body["diagnostics"]["env_found"] is True


if __name__ == "__main__":
    print("Run with: pytest backend/tests/test_repe_context.py::test_context_resolver_auto_creates_binding_with_binding_found_true -v")
