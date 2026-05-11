"""Backend OIDC endpoints.

Three routes, all under ``/api/auth/oidc``:

- ``POST /exchange`` — internal. Called by the Next.js callback. Requires
  the shared ``OIDC_INTERNAL_EXCHANGE_SECRET`` header. Exchanges the
  authorization code with the IdP, validates the ID token, sanitizes
  claims, upserts identity rows, resolves ``app_role`` from the scoped
  group mapping, mints the ``bm_session`` token, and returns it.
- ``POST /test/{provider_id}`` — admin only. Re-fetches discovery + JWKS
  for a given provider and updates its health columns.
- ``GET /providers`` — admin only. Lists providers with ``client_id``
  masked. Powers the Identity admin UI.

Browser-facing redirect endpoints (``/start`` and ``/callback``) live in
Next.js. Backend never touches cookies.
"""

from __future__ import annotations

import hmac
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.auth.context import AuthContext
from app.auth.oidc_token import (
    OidcValidationError,
    resolve_app_role,
    validate_oidc_token,
)
from app.auth.platform import require_authenticated_request
from app.auth.session_mint import build_session_claims, sign_platform_session
from app.services import identity_providers as ip_service
from app.services.audit import record_event

router = APIRouter(prefix="/api/auth/oidc", tags=["auth-oidc"])

_INTERNAL_HEADER_NAME = "x-bm-internal-auth"
_TOOL_NAME = "auth.oidc"


def _internal_secret() -> str:
    return (os.getenv("OIDC_INTERNAL_EXCHANGE_SECRET") or "").strip()


def _require_internal(header_value: str | None) -> None:
    expected = _internal_secret()
    if not expected:
        raise HTTPException(status_code=503, detail="OIDC exchange not configured")
    if not header_value or not hmac.compare_digest(header_value.strip(), expected):
        raise HTTPException(status_code=401, detail="invalid internal auth")


def _require_admin(auth: AuthContext) -> None:
    if "admin" in auth.roles or auth.app_role == "admin" or auth.membership_role in {"owner", "admin"}:
        return
    raise HTTPException(status_code=403, detail="admin role required")


def _client_secret_for(provider: dict[str, Any]) -> str | None:
    """Resolve client secret from env vars, per kind."""
    kind = (provider.get("kind") or "").lower()
    name = (provider.get("provider_name") or "").upper()
    candidates: list[str] = []
    if kind == "okta":
        candidates.append("OKTA_CLIENT_SECRET")
    elif kind == "azure_ad":
        candidates.append("ENTRA_CLIENT_SECRET")
        candidates.append("AZURE_AD_CLIENT_SECRET")
    candidates.append(f"OIDC_CLIENT_SECRET_{name}")
    for key in candidates:
        value = (os.getenv(key) or "").strip()
        if value:
            return value
    return None


def _exchange_code(
    provider: dict[str, Any],
    *,
    code: str,
    redirect_uri: str,
    code_verifier: str,
) -> dict[str, Any]:
    discovery_url = provider.get("discovery_url") or (
        (provider.get("issuer") or "").rstrip("/") + "/.well-known/openid-configuration"
    )
    try:
        disc = httpx.get(discovery_url, timeout=5.0)
        disc.raise_for_status()
        token_endpoint = disc.json().get("token_endpoint")
    except Exception as exc:
        raise OidcValidationError("discovery_failed", str(exc)) from exc
    if not token_endpoint:
        raise OidcValidationError("discovery_failed", "no token_endpoint in discovery")

    client_secret = _client_secret_for(provider)
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": provider["client_id"],
        "code_verifier": code_verifier,
    }
    if client_secret:
        data["client_secret"] = client_secret

    try:
        response = httpx.post(token_endpoint, data=data, timeout=10.0)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise OidcValidationError("token_exchange_failed", f"{exc.response.status_code}") from exc
    except Exception as exc:
        raise OidcValidationError("token_exchange_failed", str(exc)) from exc
    return response.json()


class ExchangeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider_id: str
    code: str
    code_verifier: str
    nonce: str | None = None
    redirect_uri: str
    return_to: str | None = Field(default=None, alias="returnTo")


class ExchangeResponse(BaseModel):
    session_jwt: str
    return_to: str
    email: str
    platform_user_id: str


@router.post("/exchange", response_model=ExchangeResponse)
async def exchange(
    payload: ExchangeRequest,
    request: Request,
    x_bm_internal_auth: str | None = Header(default=None, alias=_INTERNAL_HEADER_NAME),
) -> ExchangeResponse:
    started = time.monotonic()
    _require_internal(x_bm_internal_auth)

    provider = ip_service.get_provider(payload.provider_id)
    if not provider:
        record_event(
            actor="oidc.callback",
            action="login.failure",
            tool_name=_TOOL_NAME,
            success=False,
            latency_ms=int((time.monotonic() - started) * 1000),
            error_message="provider_not_found",
            input_data={"provider_id": payload.provider_id},
        )
        raise HTTPException(status_code=400, detail="unknown provider")

    if not provider.get("enabled"):
        record_event(
            actor="oidc.callback",
            action="login.failure",
            tool_name=_TOOL_NAME,
            success=False,
            latency_ms=int((time.monotonic() - started) * 1000),
            error_message="provider_disabled",
            input_data={"provider_id": payload.provider_id},
        )
        raise HTTPException(status_code=403, detail="provider disabled")

    try:
        token_response = _exchange_code(
            provider,
            code=payload.code,
            redirect_uri=payload.redirect_uri,
            code_verifier=payload.code_verifier,
        )
    except OidcValidationError as exc:
        record_event(
            actor="oidc.callback",
            action="login.failure",
            tool_name=_TOOL_NAME,
            success=False,
            latency_ms=int((time.monotonic() - started) * 1000),
            error_message=exc.code,
            input_data={"provider": provider["provider_name"]},
        )
        raise HTTPException(status_code=400, detail=exc.code) from exc

    id_token = token_response.get("id_token")
    if not id_token:
        record_event(
            actor="oidc.callback",
            action="login.failure",
            tool_name=_TOOL_NAME,
            success=False,
            latency_ms=int((time.monotonic() - started) * 1000),
            error_message="no_id_token",
            input_data={"provider": provider["provider_name"]},
        )
        raise HTTPException(status_code=400, detail="no_id_token")

    try:
        claims = validate_oidc_token(id_token, provider, expected_nonce=payload.nonce)
    except OidcValidationError as exc:
        record_event(
            actor="oidc.callback",
            action="login.failure",
            tool_name=_TOOL_NAME,
            success=False,
            latency_ms=int((time.monotonic() - started) * 1000),
            error_message=exc.code,
            input_data={"provider": provider["provider_name"]},
        )
        raise HTTPException(status_code=400, detail=exc.code) from exc

    if not claims.email:
        record_event(
            actor="oidc.callback",
            action="login.failure",
            tool_name=_TOOL_NAME,
            success=False,
            latency_ms=int((time.monotonic() - started) * 1000),
            error_message="email_required",
            input_data={"provider": provider["provider_name"], "sub": claims.sub},
        )
        raise HTTPException(status_code=400, detail="email_required")

    user = ip_service.find_or_create_platform_user(claims.email, claims.name)
    external_identity_id = ip_service.upsert_external_identity(
        identity_provider_id=provider["identity_provider_id"],
        external_subject=claims.sub,
        email=claims.email,
        sanitized_claims=claims.sanitized,
    )
    ip_service.link_user_identity(
        platform_user_id=user["platform_user_id"],
        external_identity_id=external_identity_id,
    )

    memberships = ip_service.load_memberships(user["platform_user_id"])
    default_membership = next(
        (m for m in memberships if m.get("is_default") and m.get("status") == "active"),
        None,
    ) or (memberships[0] if memberships else None)

    target_env_id = default_membership.get("env_id") if default_membership else None
    target_env_slug = default_membership.get("env_slug") if default_membership else None
    target_business_id = None  # Set later if a business binding is added.

    resolved_role, role_reason = resolve_app_role(
        groups=claims.groups,
        group_role_mapping=provider.get("group_role_mapping"),
        default_role=provider.get("default_role"),
        overage=claims.overage,
        environment_slug=target_env_slug,
        environment_id=target_env_id,
        business_id=target_business_id,
    )

    if resolved_role and default_membership:
        # Phase 1 rule: set app_role only when currently NULL.
        ip_service.assign_app_role_if_unset(
            platform_user_id=user["platform_user_id"],
            env_id=target_env_id,
            env_slug=target_env_slug,
            app_role=resolved_role,
        )
        if not default_membership.get("app_role"):
            default_membership["app_role"] = resolved_role

    if claims.overage:
        record_event(
            actor=f"user:{user['platform_user_id']}",
            action="group_overage_unsupported",
            tool_name=_TOOL_NAME,
            success=True,
            latency_ms=int((time.monotonic() - started) * 1000),
            input_data={
                "provider": provider["provider_name"],
                "fallback_role": resolved_role,
                "reason": role_reason,
            },
        )

    is_admin = bool(default_membership and default_membership.get("role") in {"owner", "admin"})

    claims_dict = build_session_claims(
        platform_user_id=user["platform_user_id"],
        email=user["email"],
        display_name=user.get("display_name"),
        memberships=[
            {
                "env_id": m["env_id"],
                "env_slug": m["env_slug"],
                "role": m["role"],
                "status": m["status"],
                "is_default": m["is_default"],
            }
            for m in memberships
        ],
        active_env_id=target_env_id,
        active_env_slug=target_env_slug,
        active_role=default_membership.get("role") if default_membership else None,
        platform_admin=is_admin,
    )
    session_token = sign_platform_session(claims_dict)

    record_event(
        actor=f"user:{user['platform_user_id']}",
        action="login.success",
        tool_name=_TOOL_NAME,
        success=True,
        latency_ms=int((time.monotonic() - started) * 1000),
        input_data={
            "provider": provider["provider_name"],
            "external_subject": claims.sub,
            "email": claims.email,
            "app_role": resolved_role,
            "role_reason": role_reason,
            "env_slug": target_env_slug,
        },
    )

    return ExchangeResponse(
        session_jwt=session_token,
        return_to=payload.return_to or "/app",
        email=user["email"],
        platform_user_id=user["platform_user_id"],
    )


@router.get("/providers")
async def list_providers(request: Request) -> dict[str, Any]:
    auth = require_authenticated_request(request)
    _require_admin(auth)
    return {"providers": ip_service.list_providers_for_admin()}


@router.get("/providers/public")
async def list_providers_public() -> dict[str, Any]:
    """Minimal public projection. Used by the Next.js ``/start`` route to
    build the authorize URL. Never includes secrets, mappings, or audit
    state — only the fields the browser needs to know which IdP to send
    the user to."""
    rows = ip_service.list_providers(include_disabled=False)
    public = [
        {
            "identity_provider_id": p["identity_provider_id"],
            "provider_name": p["provider_name"],
            "kind": p["kind"],
            "issuer": p["issuer"],
            "client_id": p["client_id"],
            "discovery_url": p["discovery_url"],
            "audience": p["audience"],
        }
        for p in rows
    ]
    return {"providers": public}


@router.post("/test/{provider_id}")
async def test_provider(provider_id: str, request: Request) -> dict[str, Any]:
    auth = require_authenticated_request(request)
    _require_admin(auth)
    provider = ip_service.get_provider(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="provider not found")
    status, detail = ip_service.run_health_check(provider)
    ip_service.record_health_check(provider_id, status=status, detail=detail)
    record_event(
        actor=auth.actor,
        action="provider.health_check",
        tool_name=_TOOL_NAME,
        success=(status == "ok"),
        latency_ms=0,
        input_data={"provider_id": provider_id, "status": status, "detail": detail},
    )
    return {"provider_id": provider_id, "status": status, "detail": detail}


@router.get("/audit-events")
async def list_audit_events(request: Request, limit: int = 50) -> dict[str, Any]:
    """Recent OIDC audit events. Powers the admin UI table."""
    auth = require_authenticated_request(request)
    _require_admin(auth)
    from app.services.audit import list_events

    events = list_events(tool_name=_TOOL_NAME, limit=min(max(limit, 1), 200))
    return {"events": events}
