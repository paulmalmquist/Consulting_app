"""App-role authorization gate with audit on denial.

Single helper to call at the top of any route that should be gated by
internal app_role (viewer / operator / finance_admin / admin). On denial
it records an audit row before raising 403 so the audit receipt
requirements are satisfied at every gate.

Accepts both ``allowed_app_roles`` (the new family) and
``allowed_membership_roles`` (legacy) so a single call site can grant
access via either family during migration.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.auth.context import AuthContext
from app.auth.platform import require_environment_access
from app.services.audit import record_event

_TOOL_NAME = "auth.oidc"


def gate_app_role(
    request: Request,
    *,
    allowed_app_roles: set[str],
    action_attempted: str,
    allowed_membership_roles: set[str] | None = None,
    permission_checked: str | None = None,
    env_id: str | None = None,
    env_slug: str | None = None,
    strict: bool = False,
) -> AuthContext:
    try:
        return require_environment_access(
            request,
            env_id=env_id,
            env_slug=env_slug,
            allowed_app_roles=allowed_app_roles,
            allowed_membership_roles=allowed_membership_roles,
            strict=strict,
        )
    except HTTPException as exc:
        if exc.status_code == 403:
            auth = getattr(request.state, "auth", None)
            actor = getattr(auth, "actor", "anonymous") if auth else "anonymous"
            record_event(
                actor=actor,
                action="permission.denied",
                tool_name=_TOOL_NAME,
                success=False,
                latency_ms=0,
                input_data={
                    "permission_checked": permission_checked or ",".join(sorted(allowed_app_roles)),
                    "action_attempted": action_attempted,
                    "user_app_role": getattr(auth, "app_role", None) if auth else None,
                    "user_membership_role": getattr(auth, "membership_role", None) if auth else None,
                    "env_id": env_id,
                    "env_slug": env_slug,
                },
                error_message="app_role insufficient",
            )
        raise
