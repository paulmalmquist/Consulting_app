"""Okta OIDC auth provider — stub for client deployments using Okta.

To activate: set AUTH_PROVIDER=okta and configure:
  - OKTA_DOMAIN (e.g. dev-12345.okta.com)
  - OKTA_CLIENT_ID
  - OKTA_AUDIENCE (optional, defaults to 'api://default')
"""

from __future__ import annotations

import os

from fastapi import Request

from app.auth.context import AuthContext
from app.auth.provider import AuthProvider

OKTA_DOMAIN = os.getenv("OKTA_DOMAIN", "")
OKTA_CLIENT_ID = os.getenv("OKTA_CLIENT_ID", "")
OKTA_AUDIENCE = os.getenv("OKTA_AUDIENCE", "api://default")


class OktaAuthProvider(AuthProvider):
    """Validates Okta OIDC JWTs and maps groups to roles.

    Implementation outline (activate when deploying to an Okta client):
    1. Fetch JWKS from https://{OKTA_DOMAIN}/.well-known/openid-configuration
    2. Validate JWT signature, exp, iss, aud
    3. Extract claims: sub, email, groups
    4. Map Okta groups → platform roles
    """

    async def authenticate(self, request: Request) -> AuthContext:
        # Stub: extract Bearer token but skip full JWT validation
        auth_header = request.headers.get("authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()

        if not token:
            return AuthContext(actor="anonymous", authenticated=False, provider="okta")

        # TODO: implement full JWT validation with python-jose or PyJWT
        # For now, trust the token and extract basic claims
        return AuthContext(
            actor="okta_user",
            authenticated=bool(token),
            roles=["viewer"],
            permissions=["read"],
            provider="okta",
            raw_claims={"token_present": bool(token)},
        )

    async def authorize(self, context: AuthContext, permission: str) -> bool:
        return permission in context.permissions
