from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, Request

from app.auth.context import AuthContext


def get_request_auth(request: Request) -> AuthContext:
    auth = getattr(request.state, "auth", None)
    if isinstance(auth, AuthContext):
        return auth
    return AuthContext(actor="anonymous", authenticated=False)


def require_authenticated_request(request: Request) -> AuthContext:
    auth = get_request_auth(request)
    if not auth.authenticated:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth


def require_environment_access(
    request: Request,
    *,
    env_id: str | UUID | None = None,
    env_slug: str | None = None,
    allowed_roles: set[str] | None = None,
) -> AuthContext:
    auth = require_authenticated_request(request)

    # Internal MCP callers still pass through the shared auth provider. Keep
    # them functional, but enforce explicit environment matching whenever the
    # request originated from the platform-session boundary.
    if auth.provider == "platform-session":
        if env_id and auth.env_id and str(env_id) != str(auth.env_id):
            raise HTTPException(status_code=403, detail="Environment access denied")
        if env_slug and auth.env_slug and env_slug != auth.env_slug:
            raise HTTPException(status_code=403, detail="Environment access denied")

    if allowed_roles and auth.membership_role not in allowed_roles and "admin" not in auth.roles:
        raise HTTPException(status_code=403, detail="Environment role does not permit this action")

    return auth
