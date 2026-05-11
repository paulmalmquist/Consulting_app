"""App-role gate behavior + audit on denial.

Exercises ``gate_app_role`` and the refactored ``require_environment_access``
directly. Uses an injected AuthContext to avoid needing a full request
pipeline.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth.app_role_gate import gate_app_role
from app.auth.context import AuthContext
from app.auth.platform import require_environment_access


def _request(headers: dict[str, str] | None = None) -> Request:
    raw_headers = [
        (key.lower().encode("utf-8"), value.encode("utf-8"))
        for key, value in (headers or {}).items()
    ]
    return Request({"type": "http", "headers": raw_headers})


def _attach_auth(request: Request, **kwargs) -> Request:
    defaults = {
        "actor": "user:test",
        "authenticated": True,
        "provider": "platform-session",
        "env_id": "env-1",
        "env_slug": "env-1",
        "roles": [],
        "permissions": ["read"],
    }
    defaults.update(kwargs)
    request.state.auth = AuthContext(**defaults)
    return request


def test_app_role_gate_allows_finance_admin():
    req = _attach_auth(_request(), app_role="finance_admin", membership_role="admin")
    ctx = require_environment_access(req, allowed_app_roles={"finance_admin", "admin"})
    assert ctx.app_role == "finance_admin"


def test_app_role_gate_denies_viewer_for_finance_action():
    req = _attach_auth(_request(), app_role="viewer", membership_role="viewer")
    with pytest.raises(HTTPException) as exc:
        require_environment_access(req, allowed_app_roles={"finance_admin", "admin"})
    assert exc.value.status_code == 403


def test_legacy_allowed_roles_routed_into_membership_family():
    req = _attach_auth(_request(), membership_role="member", app_role=None)
    # Legacy callers passing the old vocabulary still work.
    ctx = require_environment_access(req, allowed_roles={"owner", "admin", "member"})
    assert ctx.membership_role == "member"


def test_either_family_grants_when_both_configured():
    # User has the legacy membership but no app_role yet (mid-migration).
    req = _attach_auth(_request(), membership_role="admin", app_role=None)
    ctx = require_environment_access(
        req,
        allowed_membership_roles={"owner", "admin"},
        allowed_app_roles={"finance_admin", "admin"},
    )
    assert ctx is req.state.auth


def test_strict_requires_both_families():
    req = _attach_auth(_request(), membership_role="admin", app_role=None)
    with pytest.raises(HTTPException) as exc:
        require_environment_access(
            req,
            allowed_membership_roles={"owner", "admin"},
            allowed_app_roles={"finance_admin", "admin"},
            strict=True,
        )
    assert exc.value.status_code == 403


def test_gate_app_role_emits_audit_on_denial(monkeypatch):
    captured: list[dict] = []

    def _record_event(**kwargs):
        captured.append(kwargs)

    monkeypatch.setattr(
        "app.auth.app_role_gate.record_event",
        _record_event,
    )

    req = _attach_auth(_request(), app_role="viewer", membership_role="viewer")
    with pytest.raises(HTTPException):
        gate_app_role(
            req,
            allowed_app_roles={"finance_admin", "admin"},
            action_attempted="fin.distribution_event.create",
            permission_checked="finance.mutate",
        )

    assert len(captured) == 1
    event = captured[0]
    assert event["action"] == "permission.denied"
    assert event["tool_name"] == "auth.oidc"
    assert event["success"] is False
    assert event["input_data"]["action_attempted"] == "fin.distribution_event.create"
    assert event["input_data"]["user_app_role"] == "viewer"


def test_platform_admin_escape_hatch_still_works():
    req = _attach_auth(
        _request(),
        membership_role="viewer",
        app_role="viewer",
        roles=["admin"],  # platform admin override
    )
    ctx = require_environment_access(req, allowed_app_roles={"finance_admin"})
    assert ctx.roles == ["admin"]
