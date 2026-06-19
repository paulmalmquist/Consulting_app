from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, Request

from app.auth.context import AuthContext

_LEGACY_ROLES = {"owner", "admin", "member", "viewer"}
_APP_ROLES = {"viewer", "operator", "finance_admin", "admin"}


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


def require_tenant_context(request: Request) -> AuthContext:
    """Authenticated **and** tenant-scoped.

    For cost-bearing / tenant-writing routes (e.g. AI dispatch ``/run``) that must
    never execute for a tenantless caller. ``require_authenticated_request`` alone is
    not enough: the MCP dev-bypass (``MCP_API_TOKEN`` unset) authenticates any request
    as an admin with **no** ``business_id``. Without a tenant, a dispatch cannot be
    scoped or have its receipt written — so we fail closed (403) before any provider
    call rather than executing and degrading the receipt.
    """
    auth = require_authenticated_request(request)
    if not auth.business_id:
        raise HTTPException(
            status_code=403,
            detail="Tenant context required: this request carries no business_id",
        )
    return auth


def _split_legacy_allowed_roles(allowed_roles: set[str] | None) -> tuple[set[str] | None, set[str] | None]:
    """Route a legacy ``allowed_roles`` value into the new two-family API.

    Callers that mixed the two vocabularies (operator + admin, etc.) get the
    union routed to whichever family each name belongs to, so behavior under
    the old API is preserved.
    """
    if not allowed_roles:
        return None, None
    membership = {r for r in allowed_roles if r in _LEGACY_ROLES}
    app = {r for r in allowed_roles if r in _APP_ROLES}
    return (membership or None, app or None)


def require_environment_access(
    request: Request,
    *,
    env_id: str | UUID | None = None,
    env_slug: str | None = None,
    allowed_roles: set[str] | None = None,
    allowed_membership_roles: set[str] | None = None,
    allowed_app_roles: set[str] | None = None,
    strict: bool = False,
) -> AuthContext:
    """Authorize a request against environment + role.

    Two role vocabularies are supported and kept independent:

    - ``allowed_membership_roles`` checks the legacy ``role`` column
      (``owner | admin | member | viewer``).
    - ``allowed_app_roles`` checks the new ``app_role`` column
      (``viewer | operator | finance_admin | admin``).

    Default (``strict=False``): the user is allowed if **either** configured
    family grants access. This is the safe behavior during migration when
    some users may not yet have ``app_role`` set.

    ``strict=True``: both families, when configured, must grant access.

    ``allowed_roles`` is kept for backward compatibility. Names are routed
    into the matching family automatically.
    """
    auth = require_authenticated_request(request)

    # Internal MCP callers still pass through the shared auth provider. Keep
    # them functional, but enforce explicit environment matching whenever the
    # request originated from the platform-session boundary.
    if auth.provider == "platform-session":
        if env_id and auth.env_id and str(env_id) != str(auth.env_id):
            raise HTTPException(status_code=403, detail="Environment access denied")
        if env_slug and auth.env_slug and env_slug != auth.env_slug:
            raise HTTPException(status_code=403, detail="Environment access denied")

    # Back-compat: split legacy allowed_roles into the two families and merge.
    if allowed_roles:
        legacy_split, app_split = _split_legacy_allowed_roles(allowed_roles)
        if legacy_split:
            allowed_membership_roles = (allowed_membership_roles or set()) | legacy_split
        if app_split:
            allowed_app_roles = (allowed_app_roles or set()) | app_split

    # Platform admin escape hatch — preserve existing behavior.
    if "admin" in auth.roles:
        return auth

    membership_ok = (
        allowed_membership_roles is None
        or auth.membership_role in allowed_membership_roles
    )
    app_ok = (
        allowed_app_roles is None
        or (auth.app_role is not None and auth.app_role in allowed_app_roles)
    )

    if strict:
        granted = membership_ok and app_ok
    else:
        # If only one family was configured, that family decides.
        if allowed_membership_roles and allowed_app_roles:
            granted = membership_ok or app_ok
        elif allowed_membership_roles:
            granted = membership_ok
        elif allowed_app_roles:
            granted = app_ok
        else:
            granted = True

    if not granted:
        raise HTTPException(status_code=403, detail="Environment role does not permit this action")

    return auth
