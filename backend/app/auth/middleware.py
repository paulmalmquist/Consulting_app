"""Auth middleware — populates request.state.auth with an AuthContext.

Runs after RequestLoggingMiddleware so request_id is already set.
The provider is selected by AUTH_PROVIDER env var (default: mcp).
"""

from __future__ import annotations

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.auth.context import AuthContext
from app.auth.provider import get_auth_provider


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            provider = get_auth_provider()
            auth_context = await provider.authenticate(request)
        except Exception:
            auth_context = AuthContext(actor="anonymous", authenticated=False, provider="error")

        request.state.auth = auth_context
        response = await call_next(request)
        return response
