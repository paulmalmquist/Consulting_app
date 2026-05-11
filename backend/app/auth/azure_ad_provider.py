"""Microsoft Entra ID (Azure AD) OIDC auth provider.

Activated by ``AUTH_PROVIDER=azure_ad``. Bearer tokens are validated
against the ``entra`` (or ``azure_ad``) row in ``app.identity_providers``
using the shared ``validate_oidc_token`` helper.
"""

from __future__ import annotations

from fastapi import Request

from app.auth.context import AuthContext
from app.auth.oidc_token import OidcValidationError, validate_oidc_token
from app.auth.provider import AuthProvider
from app.services import identity_providers as ip_service


def _load_entra_provider() -> dict | None:
    for name in ("entra", "azure_ad", "microsoft"):
        row = ip_service.get_provider_by_name(name)
        if row and row.get("enabled"):
            return row
    return None


class AzureAdAuthProvider(AuthProvider):
    async def authenticate(self, request: Request) -> AuthContext:
        auth_header = request.headers.get("authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()
        if not token:
            return AuthContext(actor="anonymous", authenticated=False, provider="azure_ad")

        provider = _load_entra_provider()
        if not provider:
            return AuthContext(actor="anonymous", authenticated=False, provider="azure_ad")

        try:
            claims = validate_oidc_token(token, provider)
        except OidcValidationError:
            return AuthContext(actor="anonymous", authenticated=False, provider="azure_ad")

        return AuthContext(
            actor=f"entra:{claims.sub}",
            authenticated=True,
            roles=[],
            permissions=["read"],
            user_id=claims.sub,
            tenant_id=claims.tenant_id,
            provider="azure_ad",
            raw_claims=claims.sanitized,
        )

    async def authorize(self, context: AuthContext, permission: str) -> bool:
        return permission in context.permissions or "admin" in context.roles
