"""Azure AD auth provider — stub for client deployments using Azure AD / Entra ID.

To activate: set AUTH_PROVIDER=azure_ad and configure:
  - AZURE_AD_TENANT_ID
  - AZURE_AD_CLIENT_ID
  - AZURE_AD_AUDIENCE (optional)
"""

from __future__ import annotations

from fastapi import Request

from app.auth.context import AuthContext
from app.auth.provider import AuthProvider


class AzureAdAuthProvider(AuthProvider):
    """Validates Azure AD JWTs and maps groups to roles.

    Implementation outline (activate when deploying to an Azure AD client):
    1. Fetch JWKS from https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys
    2. Validate JWT signature, exp, iss, aud
    3. Extract claims: sub, preferred_username, groups
    4. Map Azure AD groups → platform roles
    """

    async def authenticate(self, request: Request) -> AuthContext:
        auth_header = request.headers.get("authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()

        if not token:
            return AuthContext(actor="anonymous", authenticated=False, provider="azure_ad")

        return AuthContext(
            actor="azure_user",
            authenticated=bool(token),
            roles=["viewer"],
            permissions=["read"],
            provider="azure_ad",
            raw_claims={"token_present": bool(token)},
        )

    async def authorize(self, context: AuthContext, permission: str) -> bool:
        return permission in context.permissions
