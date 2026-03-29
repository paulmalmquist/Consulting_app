"""Auth context — unified identity container for all auth providers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AuthContext:
    """Unified auth context populated by whatever provider is active.

    Every request handler receives this via ``request.state.auth``.
    The shape is the same regardless of whether the backend is using
    MCP tokens, Okta OIDC, or Azure AD — downstream code never
    branches on provider type.
    """

    actor: str
    authenticated: bool = False
    roles: list[str] = field(default_factory=list)
    permissions: list[str] = field(default_factory=list)
    user_id: str | None = None
    tenant_id: str | None = None
    business_id: str | None = None
    env_id: str | None = None
    env_slug: str | None = None
    membership_role: str | None = None
    scopes: dict[str, Any] = field(default_factory=dict)
    provider: str = "anonymous"  # mcp | okta | azure_ad | platform-session
    raw_claims: dict[str, Any] = field(default_factory=dict)
