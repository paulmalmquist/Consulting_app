"""
Regression test for REPE context bootstrap issue.

Tests the scenario where:
- Environment exists
- No explicit binding row exists
- Heuristic slug matching fails (no matching business found)
- Auto-create is enabled
- Expected: business is auto-created, binding is created, and binding_found is True

This test verifies the fix for the binding_found logic being too strict.
"""

from __future__ import annotations

import pytest
from app.services import repe_context


def _regclass_row(name: str | None):
    """Helper to return a mock result for table existence check."""
    return [{"tbl": name}]


def test_context_resolver_auto_creates_and_sets_binding_found_true(fake_cursor, monkeypatch):
    """
    Regression test: When env exists but no binding and heuristic fails,
    auto-create should succeed and binding_found should be True (after binding is inserted).

    This tests the exact scenario where binding_found logic was too strict:
    - Environment exists
    - No explicit binding row in app.env_business_bindings
    - Heuristic slug matching returns no candidate (empty result)
    - allow_create=True (default in endpoint)
    - Expected: Auto-create business, insert binding, return binding_found: True
    """
    env_id = "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    expected_business_id = "58fcfb0d-827a-472e-98a5-46326b5d080d"

    # Step 1: Table existence checks (app.environments, app.businesses, app.env_business_bindings)
    fake_cursor.push_result(_regclass_row("app.environments"))
    fake_cursor.push_result(_regclass_row("app.businesses"))
    fake_cursor.push_result(_regclass_row("app.env_business_bindings"))

    # Step 2: Environment lookup - environment EXISTS
    fake_cursor.push_result([{"env_id": env_id, "client_name": "Test Environment"}])

    # Step 3: Binding lookup - NO binding row exists
    fake_cursor.push_result([])

    # Step 4: Heuristic slug matching - NO candidate found (empty result)
    # This is the key scenario: the heuristic search finds nothing
    fake_cursor.push_result([])

    # Step 5: Mock business_svc.create_business to simulate business creation
    monkeypatch.setattr(
        repe_context.business_svc,
        "create_business",
        lambda *args, **kwargs: {
            "business_id": expected_business_id,
            "slug": f"repe-{env_id[:8]}",
        },
    )

    # Step 6: Execute the resolver with allow_create=True (default)
    out = repe_context.resolve_repe_business_context(
        env_id=env_id,
        allow_create=True,
    )

    # Assertions: Verify the fix works correctly
    assert out.business_id == expected_business_id, "Business ID should be auto-created business"
    assert out.created is True, "created flag should indicate auto-creation"
    assert out.env_found is True, "Environment should be found"
    assert out.diagnostics["business_found"] is True, "business_found should be True"

    # KEY FIX: binding_found should now be True (after binding is inserted)
    # Previously it was False, which caused client confusion
    assert out.diagnostics["binding_found"] is True, (
        "REGRESSION FIX: binding_found should be True after binding is inserted. "
        "Previously this was False, causing null return for some environments."
    )

    assert out.source == f"auto_create:param", "Source should indicate auto-created via param"


def test_context_resolver_heuristic_sets_binding_found_true(fake_cursor):
    """
    Test: When heuristic slug matching succeeds, binding_found should be True after binding is inserted.

    Scenario:
    - Environment exists
    - No explicit binding row
    - Heuristic slug matching SUCCEEDS (finds a candidate business)
    - Expected: binding is created, binding_found is True
    """
    env_id = "prod-12345678-abcd-efgh-ijkl-mnopqrstuvwx"
    existing_business_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    # Table existence checks
    fake_cursor.push_result(_regclass_row("app.environments"))
    fake_cursor.push_result(_regclass_row("app.businesses"))
    fake_cursor.push_result(_regclass_row("app.env_business_bindings"))

    # Environment exists
    fake_cursor.push_result([{"env_id": env_id, "client_name": "Production"}])

    # No binding row yet
    fake_cursor.push_result([])

    # Heuristic slug matching SUCCEEDS - found a business with "prod" in slug
    fake_cursor.push_result([{"business_id": existing_business_id}])

    out = repe_context.resolve_repe_business_context(
        env_id=env_id,
        allow_create=True,
    )

    assert out.business_id == existing_business_id, "Should return the matched business"
    assert out.created is False, "created flag should be False (existing business)"
    assert out.diagnostics["business_found"] is True, "business_found should be True"
    assert out.diagnostics["binding_found"] is True, (
        "FIX: binding_found should be True after binding is inserted (heuristic path)"
    )
    assert out.source == "heuristic_slug:param", "Source should indicate heuristic"


def test_context_resolver_explicit_binding_is_still_true(fake_cursor):
    """
    Test: Explicit binding lookup still works (regression test for existing behavior).

    When an explicit binding row exists, binding_found should be True.
    This should remain unchanged by the fix.
    """
    env_id = "f0790a88-5d05-4991-8d0e-243ab4f9af27"
    business_id = "58fcfb0d-827a-472e-98a5-46326b5d080d"

    fake_cursor.push_result(_regclass_row("app.environments"))
    fake_cursor.push_result(_regclass_row("app.businesses"))
    fake_cursor.push_result(_regclass_row("app.env_business_bindings"))

    # Environment exists
    fake_cursor.push_result([{"env_id": env_id, "client_name": "Test"}])

    # Binding row EXISTS - found immediately
    fake_cursor.push_result([{"business_id": business_id, "name": "Test Business"}])

    out = repe_context.resolve_repe_business_context(
        env_id=env_id,
        allow_create=True,
    )

    assert out.business_id == business_id
    assert out.created is False
    assert out.diagnostics["binding_found"] is True, "Explicit binding should have binding_found: True"
    assert out.diagnostics["business_found"] is True
    assert out.source == "binding:param"


def test_context_resolver_explicit_business_id_sets_binding_correctly(fake_cursor):
    """
    Test: When explicit business_id is provided, binding should be created and binding_found set correctly.
    """
    env_id = "test-env-id"
    business_id = "test-business-id"

    # Table existence check for binding table
    fake_cursor.push_result(_regclass_row("app.env_business_bindings"))

    out = repe_context.resolve_repe_business_context(
        env_id=env_id,
        business_id=business_id,
        allow_create=True,
    )

    assert out.business_id == business_id
    assert out.env_id == env_id
    assert out.diagnostics["business_found"] is True
    # When explicit business_id is provided with env_id, binding is created, so binding_found: True
    assert out.diagnostics["binding_found"] is True, (
        "FIX: When both env_id and business_id provided, binding is created, so binding_found should be True"
    )


if __name__ == "__main__":
    # Run with: pytest proposed_test.py -v
    pytest.main([__file__, "-v"])
