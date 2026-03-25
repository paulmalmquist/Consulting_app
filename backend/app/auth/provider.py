"""Auth provider ABC + factory.

AUTH_PROVIDER env var selects the active implementation:
  - mcp   (default) — current MCP token + actor header
  - okta  — Okta OIDC JWT validation (stub, ready for client integration)
  - azure_ad — Azure AD (stub)

Each provider implements authenticate() and authorize() so downstream
code never branches on provider type.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod

from fastapi import Request

from app.auth.context import AuthContext

_AUTH_PROVIDER_KEY = os.getenv("AUTH_PROVIDER", "mcp")
_provider_instance: AuthProvider | None = None


class AuthProvider(ABC):
    """Abstract base for pluggable auth providers."""

    @abstractmethod
    async def authenticate(self, request: Request) -> AuthContext:
        """Extract identity from the request and return an AuthContext."""
        ...

    @abstractmethod
    async def authorize(self, context: AuthContext, permission: str) -> bool:
        """Check whether *context* has the given *permission*."""
        ...


def get_auth_provider() -> AuthProvider:
    """Return the singleton provider instance (lazy-init)."""
    global _provider_instance
    if _provider_instance is not None:
        return _provider_instance

    if _AUTH_PROVIDER_KEY == "okta":
        from app.auth.okta_provider import OktaAuthProvider
        _provider_instance = OktaAuthProvider()
    elif _AUTH_PROVIDER_KEY == "azure_ad":
        from app.auth.azure_ad_provider import AzureAdAuthProvider
        _provider_instance = AzureAdAuthProvider()
    else:
        from app.auth.mcp_provider import McpAuthProvider
        _provider_instance = McpAuthProvider()

    return _provider_instance
