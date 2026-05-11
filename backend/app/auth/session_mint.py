"""Mint the ``bm_session`` token consumed by Next.js.

The token format matches ``signPlatformSession`` in
``repo-b/src/lib/server/sessionAuth.ts``:

    base64url(JSON_payload) "." base64url(HMAC_SHA256(payload, secret))

This is intentionally not a standards JWT — the frontend implements its own
HMAC scheme so the cookie can be verified inside Next.js middleware via
``crypto.subtle`` without pulling in a JWT library. Keeping that scheme
means our OIDC callback can mint a session the frontend already knows how
to parse and middleware stays untouched.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any
from uuid import uuid4

_SESSION_VERSION = 1
_DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7  # 7d


def _session_secret() -> str:
    for key in ("BM_SESSION_SECRET", "AUTH_SESSION_SECRET", "NEXTAUTH_SECRET"):
        value = (os.getenv(key) or "").strip()
        if value:
            return value
    raise RuntimeError("BM_SESSION_SECRET (or AUTH_SESSION_SECRET) must be configured")


def _ttl_seconds() -> int:
    configured = os.getenv("BM_SESSION_TTL_SECONDS")
    if configured:
        try:
            parsed = int(configured)
            if parsed > 0:
                return parsed
        except ValueError:
            pass
    return _DEFAULT_TTL_SECONDS


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign_platform_session(claims: dict[str, Any]) -> str:
    """Sign a session claims dict and return the cookie string."""
    secret = _session_secret()
    normalized = dict(claims)
    normalized["v"] = _SESSION_VERSION
    payload_bytes = json.dumps(normalized, separators=(",", ":"), sort_keys=False).encode("utf-8")
    payload_b64 = _b64url(payload_bytes)
    signature = hmac.new(secret.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url(signature)}"


def build_session_claims(
    *,
    platform_user_id: str,
    email: str,
    display_name: str | None,
    memberships: list[dict[str, Any]],
    active_env_id: str | None,
    active_env_slug: str | None,
    active_role: str | None,
    platform_admin: bool,
    session_id: str | None = None,
    supabase_user_id: str | None = None,
) -> dict[str, Any]:
    now = int(time.time())
    return {
        "v": _SESSION_VERSION,
        "session_id": session_id or str(uuid4()),
        "platform_user_id": platform_user_id,
        "supabase_user_id": supabase_user_id,
        "email": email,
        "display_name": display_name,
        "issued_at": now,
        "expires_at": now + _ttl_seconds(),
        "platform_admin": platform_admin,
        "active_env_id": active_env_id,
        "active_env_slug": active_env_slug,
        "active_role": active_role,
        "memberships": memberships,
    }
