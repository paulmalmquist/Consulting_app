"""Service layer for ``app.identity_providers`` + linked tables.

CRUD-ish helpers used by the OIDC routes and admin UI. All reads return
plain dicts that mirror the row shape; write paths return the row id.

Client secrets are NEVER stored in or returned by this service — they
live in env vars. Public read paths return a ``client_id_masked`` field
for the admin UI rather than the raw value.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import httpx

from app.db import get_cursor

_PROVIDER_COLUMNS = (
    "identity_provider_id, provider_name, kind, issuer, client_id, audience, "
    "discovery_url, jwks_uri, enabled, claim_mapping, group_role_mapping, "
    "default_role, last_health_check_at, last_health_status, last_health_detail, "
    "created_at, updated_at"
)


def _mask_client_id(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 4:
        return "****"
    return f"****{value[-4:]}"


def _coerce_json(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return {}
    return {}


def _row_to_dict(row: dict) -> dict[str, Any]:
    return {
        "identity_provider_id": str(row["identity_provider_id"]),
        "provider_name": row["provider_name"],
        "kind": row["kind"],
        "issuer": row["issuer"],
        "client_id": row["client_id"],
        "audience": row["audience"],
        "discovery_url": row["discovery_url"],
        "jwks_uri": row["jwks_uri"],
        "enabled": row["enabled"],
        "claim_mapping": _coerce_json(row.get("claim_mapping")),
        "group_role_mapping": _coerce_json(row.get("group_role_mapping")),
        "default_role": row.get("default_role"),
        "last_health_check_at": row.get("last_health_check_at"),
        "last_health_status": row.get("last_health_status"),
        "last_health_detail": row.get("last_health_detail"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def list_providers(*, include_disabled: bool = True) -> list[dict[str, Any]]:
    where = "TRUE" if include_disabled else "enabled = true"
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_PROVIDER_COLUMNS} FROM app.identity_providers WHERE {where} "
            "ORDER BY provider_name"
        )
        rows = cur.fetchall() or []
    return [_row_to_dict(r) for r in rows]


def list_providers_for_admin() -> list[dict[str, Any]]:
    """Same as ``list_providers`` but with ``client_id`` masked."""
    providers = list_providers()
    for p in providers:
        p["client_id_masked"] = _mask_client_id(p.pop("client_id"))
    return providers


def get_provider(provider_id: str | UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_PROVIDER_COLUMNS} FROM app.identity_providers WHERE identity_provider_id = %s",
            (str(provider_id),),
        )
        row = cur.fetchone()
    return _row_to_dict(row) if row else None


def get_provider_by_name(provider_name: str) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_PROVIDER_COLUMNS} FROM app.identity_providers WHERE provider_name = %s",
            (provider_name,),
        )
        row = cur.fetchone()
    return _row_to_dict(row) if row else None


def record_health_check(
    provider_id: str | UUID,
    *,
    status: str,
    detail: str | None,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE app.identity_providers
                  SET last_health_check_at = now(),
                      last_health_status = %s,
                      last_health_detail = %s,
                      updated_at = now()
                WHERE identity_provider_id = %s""",
            (status, detail, str(provider_id)),
        )


def upsert_provider(
    *,
    provider_name: str,
    kind: str,
    issuer: str,
    client_id: str,
    audience: str | None = None,
    discovery_url: str | None = None,
    jwks_uri: str | None = None,
    enabled: bool = False,
    claim_mapping: dict[str, Any] | None = None,
    group_role_mapping: dict[str, Any] | None = None,
    default_role: str | None = None,
) -> str:
    """Idempotent upsert keyed on ``provider_name``. Returns the row id."""
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.identity_providers
                (provider_name, kind, issuer, client_id, audience, discovery_url, jwks_uri,
                 enabled, claim_mapping, group_role_mapping, default_role)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
                ON CONFLICT (provider_name) DO UPDATE SET
                    kind = EXCLUDED.kind,
                    issuer = EXCLUDED.issuer,
                    client_id = EXCLUDED.client_id,
                    audience = EXCLUDED.audience,
                    discovery_url = EXCLUDED.discovery_url,
                    jwks_uri = EXCLUDED.jwks_uri,
                    enabled = EXCLUDED.enabled,
                    claim_mapping = EXCLUDED.claim_mapping,
                    group_role_mapping = EXCLUDED.group_role_mapping,
                    default_role = EXCLUDED.default_role,
                    updated_at = now()
                RETURNING identity_provider_id""",
            (
                provider_name,
                kind,
                issuer,
                client_id,
                audience,
                discovery_url,
                jwks_uri,
                enabled,
                json.dumps(claim_mapping or {}),
                json.dumps(group_role_mapping or {}),
                default_role,
            ),
        )
        row = cur.fetchone()
    return str(row["identity_provider_id"])


def upsert_external_identity(
    *,
    identity_provider_id: str,
    external_subject: str,
    email: str | None,
    sanitized_claims: dict[str, Any],
) -> str:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.external_identities
                (identity_provider_id, external_subject, email, sanitized_claims, last_seen_at)
                VALUES (%s, %s, %s, %s::jsonb, now())
                ON CONFLICT (identity_provider_id, external_subject) DO UPDATE SET
                    email = EXCLUDED.email,
                    sanitized_claims = EXCLUDED.sanitized_claims,
                    last_seen_at = now()
                RETURNING external_identity_id""",
            (
                str(identity_provider_id),
                external_subject,
                email,
                json.dumps(sanitized_claims),
            ),
        )
        row = cur.fetchone()
    return str(row["external_identity_id"])


def link_user_identity(*, platform_user_id: str, external_identity_id: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.user_identity_links (platform_user_id, external_identity_id)
                VALUES (%s, %s)
                ON CONFLICT (platform_user_id, external_identity_id) DO NOTHING""",
            (str(platform_user_id), str(external_identity_id)),
        )


def find_or_create_platform_user(email: str, display_name: str | None) -> dict[str, Any]:
    """Idempotent lookup on ``app.platform_users`` keyed by email."""
    normalized = (email or "").strip().lower()
    if not normalized:
        raise ValueError("email required to resolve platform user")
    with get_cursor() as cur:
        cur.execute(
            "SELECT platform_user_id, email, display_name FROM app.platform_users "
            "WHERE lower(email) = %s LIMIT 1",
            (normalized,),
        )
        row = cur.fetchone()
        if row:
            return {
                "platform_user_id": str(row["platform_user_id"]),
                "email": row["email"],
                "display_name": row.get("display_name"),
            }
        cur.execute(
            """INSERT INTO app.platform_users (email, display_name)
                VALUES (%s, %s)
                RETURNING platform_user_id, email, display_name""",
            (normalized, display_name),
        )
        new_row = cur.fetchone()
    return {
        "platform_user_id": str(new_row["platform_user_id"]),
        "email": new_row["email"],
        "display_name": new_row.get("display_name"),
    }


def load_memberships(platform_user_id: str) -> list[dict[str, Any]]:
    """Load membership rows for the bm_session JWT.

    Joins ``app.environment_memberships`` with ``app.environments`` to populate
    ``env_slug``. Keeps the shape compatible with ``PlatformMembershipSlim``.
    """
    with get_cursor() as cur:
        cur.execute(
            """SELECT em.env_id::text AS env_id,
                       e.slug AS env_slug,
                       em.role,
                       em.status,
                       em.is_default,
                       em.app_role
                  FROM app.environment_memberships em
                  JOIN app.environments e USING (env_id)
                 WHERE em.platform_user_id = %s
                 ORDER BY em.is_default DESC, em.created_at ASC""",
            (str(platform_user_id),),
        )
        rows = cur.fetchall() or []
    return [
        {
            "env_id": row["env_id"],
            "env_slug": row["env_slug"],
            "role": row["role"],
            "status": row["status"],
            "is_default": row["is_default"],
            "app_role": row.get("app_role"),
        }
        for row in rows
    ]


def assign_app_role_if_unset(
    *,
    platform_user_id: str,
    env_id: str | None,
    env_slug: str | None,
    app_role: str,
) -> str | None:
    """Phase 1 non-destructive write: set ``app_role`` only when it is NULL.

    Returns the env_id of the row that was updated, or ``None`` if no row
    matched or the existing value was preserved.
    """
    if not app_role:
        return None
    target_env_id: str | None = env_id
    with get_cursor() as cur:
        if not target_env_id and env_slug:
            cur.execute(
                "SELECT env_id::text AS env_id FROM app.environments WHERE slug = %s",
                (env_slug,),
            )
            row = cur.fetchone()
            if row:
                target_env_id = row["env_id"]
        if not target_env_id:
            return None
        cur.execute(
            """UPDATE app.environment_memberships
                  SET app_role = %s,
                      updated_at = now()
                WHERE platform_user_id = %s
                  AND env_id = %s
                  AND app_role IS NULL
              RETURNING env_id::text AS env_id""",
            (app_role, str(platform_user_id), str(target_env_id)),
        )
        updated = cur.fetchone()
    return updated["env_id"] if updated else None


def run_health_check(provider: dict[str, Any]) -> tuple[str, str]:
    """Fetch discovery + JWKS and return ``(status, detail)``.

    ``status`` is one of ``ok`` / ``warn`` / ``error``. ``detail`` is a short
    human string suitable for the admin UI.
    """
    issuer = provider.get("issuer") or ""
    discovery_url = provider.get("discovery_url") or (
        issuer.rstrip("/") + "/.well-known/openid-configuration" if issuer else ""
    )
    if not discovery_url:
        return "error", "no issuer or discovery_url configured"
    try:
        disc_response = httpx.get(discovery_url, timeout=5.0)
        disc_response.raise_for_status()
        discovery = disc_response.json()
    except Exception as exc:
        return "error", f"discovery fetch failed: {exc}"

    jwks_uri = provider.get("jwks_uri") or discovery.get("jwks_uri")
    if not jwks_uri:
        return "error", "discovery response missing jwks_uri"
    try:
        jwks_response = httpx.get(jwks_uri, timeout=5.0)
        jwks_response.raise_for_status()
        payload = jwks_response.json()
    except Exception as exc:
        return "error", f"jwks fetch failed: {exc}"

    keys = payload.get("keys") or []
    if not keys:
        return "warn", "jwks returned no keys"
    return "ok", f"discovery + jwks reachable ({len(keys)} keys)"
