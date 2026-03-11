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
