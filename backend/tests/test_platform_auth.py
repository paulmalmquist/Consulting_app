import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth.context import AuthContext
from app.auth.mcp_provider import McpAuthProvider
from app.auth.platform import require_authenticated_request, require_environment_access


def _request(headers: dict[str, str] | None = None) -> Request:
    raw_headers = [
        (key.lower().encode("utf-8"), value.encode("utf-8"))
        for key, value in (headers or {}).items()
    ]
    return Request({"type": "http", "headers": raw_headers})


def test_platform_session_headers_resolve_to_authenticated_context():
    request = _request(
        {
            "x-bm-auth-provider": "platform-session",
            "x-bm-user-id": "user-123",
            "x-bm-actor": "user:playwright",
            "x-bm-env-id": "env-trading",
            "x-bm-env-slug": "trading",
            "x-bm-membership-role": "member",
            "x-bm-business-id": "biz-trading",
            "x-tenant-id": "tenant-trading",
        }
    )

    context = asyncio.run(McpAuthProvider().authenticate(request))

    assert context.authenticated is True
    assert context.provider == "platform-session"
    assert context.user_id == "user-123"
    assert context.env_id == "env-trading"
    assert context.env_slug == "trading"
    assert context.business_id == "biz-trading"
    assert context.tenant_id == "tenant-trading"
    assert context.membership_role == "member"
    assert context.permissions == ["read", "write"]


def test_require_environment_access_enforces_platform_session_scope():
    request = _request()
    request.state.auth = AuthContext(
        actor="user:123",
        authenticated=True,
        provider="platform-session",
        env_id="env-novendor",
        env_slug="novendor",
        membership_role="member",
        roles=["member"],
        permissions=["read", "write"],
    )

    with pytest.raises(HTTPException) as exc:
        require_environment_access(request, env_slug="trading")

    assert exc.value.status_code == 403
    assert exc.value.detail == "Environment access denied"


def test_require_environment_access_checks_role_boundaries():
    request = _request()
    request.state.auth = AuthContext(
        actor="user:123",
        authenticated=True,
        provider="platform-session",
        env_id="env-resume",
        env_slug="resume",
        membership_role="viewer",
        roles=["viewer"],
        permissions=["read"],
    )

    with pytest.raises(HTTPException) as exc:
        require_environment_access(request, env_slug="resume", allowed_roles={"owner", "admin"})

    assert exc.value.status_code == 403
    assert exc.value.detail == "Environment role does not permit this action"


def test_require_authenticated_request_rejects_missing_identity():
    request = _request()

    with pytest.raises(HTTPException) as exc:
        require_authenticated_request(request)

    assert exc.value.status_code == 401
    assert exc.value.detail == "Authentication required"
