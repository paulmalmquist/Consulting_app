"""Okta OIDC auth provider.

Activated by ``AUTH_PROVIDER=okta``. Bearer-token requests are validated
against the ``okta`` row in ``app.identity_providers`` using the shared
``validate_oidc_token`` helper. Group→role mapping is applied at the
``/api/auth/oidc/exchange`` callback; this provider is the request-time
read path that maps a verified token into an ``AuthContext``.
"""

from __future__ import annotations

from fastapi import Request

from app.auth.context import AuthContext
from app.auth.oidc_token import OidcValidationError, validate_oidc_token
from app.auth.provider import AuthProvider
from app.services import identity_providers as ip_service


class OktaAuthProvider(AuthProvider):
    async def authenticate(self, request: Request) -> AuthContext:
        auth_header = request.headers.get("authorization", "")
        token = auth_header.removeprefix("Bearer ").strip()
        if not token:
            return AuthContext(actor="anonymous", authenticated=False, provider="okta")

        provider = ip_service.get_provider_by_name("okta")
        if not provider or not provider.get("enabled"):
            return AuthContext(actor="anonymous", authenticated=False, provider="okta")

        try:
            claims = validate_oidc_token(token, provider)
        except OidcValidationError:
            return AuthContext(actor="anonymous", authenticated=False, provider="okta")

        actor = f"okta:{claims.sub}"
        roles = ["admin"] if claims.sanitized.get("roles") == "admin" else []
        return AuthContext(
            actor=actor,
            authenticated=True,
            roles=roles,
            permissions=["read"],
            user_id=claims.sub,
            provider="okta",
            raw_claims=claims.sanitized,
        )

    async def authorize(self, context: AuthContext, permission: str) -> bool:
        return permission in context.permissions or "admin" in context.roles
