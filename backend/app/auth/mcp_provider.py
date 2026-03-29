"""MCP auth provider — wraps the existing MCP token + actor header pattern.

This is the default provider used by the Winston platform.
"""

from __future__ import annotations

from fastapi import Request

from app.auth.context import AuthContext
from app.auth.provider import AuthProvider
from app.config import MCP_API_TOKEN


class McpAuthProvider(AuthProvider):
    """Authenticates via x-bm-actor header and optional MCP_API_TOKEN."""

    async def authenticate(self, request: Request) -> AuthContext:
        platform_user_id = request.headers.get("x-bm-user-id")
        platform_provider = request.headers.get("x-bm-auth-provider")
        if platform_provider == "platform-session" or platform_user_id:
            membership_role = request.headers.get("x-bm-membership-role") or "viewer"
            roles = [membership_role]
            permissions = ["read"]
            if membership_role in {"owner", "admin"}:
                roles.append("admin")
                permissions = ["read", "write", "admin"]
            elif membership_role == "member":
                permissions = ["read", "write"]

            if request.headers.get("x-bm-platform-admin") == "true" and "admin" not in roles:
                roles.append("admin")
                permissions = ["read", "write", "admin"]

            return AuthContext(
                actor=request.headers.get("x-bm-actor") or f"user:{platform_user_id or 'unknown'}",
                authenticated=True,
                roles=roles,
                permissions=permissions,
                user_id=platform_user_id,
                tenant_id=request.headers.get("x-tenant-id"),
                business_id=request.headers.get("x-bm-business-id"),
                env_id=request.headers.get("x-bm-env-id"),
                env_slug=request.headers.get("x-bm-env-slug"),
                membership_role=membership_role,
                provider="platform-session",
                raw_claims={
                    "platform_admin": request.headers.get("x-bm-platform-admin"),
                },
            )

        actor = (
            request.headers.get("x-bm-actor")
            or request.headers.get("x-user")
            or "anonymous"
        )

        token = request.headers.get("x-mcp-token") or request.headers.get("authorization", "").removeprefix("Bearer ")
        authenticated = bool(token and token == MCP_API_TOKEN) if MCP_API_TOKEN else True

        return AuthContext(
            actor=actor,
            authenticated=authenticated,
            roles=["admin"] if authenticated else ["viewer"],
            permissions=["read", "write"] if authenticated else ["read"],
            tenant_id=request.headers.get("x-tenant-id"),
            provider="mcp",
        )

    async def authorize(self, context: AuthContext, permission: str) -> bool:
        return permission in context.permissions
