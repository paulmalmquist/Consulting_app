"""OIDC token validator.

Validates a JWT against a provider config row from ``app.identity_providers``:

- Signature via JWKS (handled by ``oidc_keys.OidcKeyResolver``).
- ``iss``, ``aud``, ``exp``, ``iat`` checked by PyJWT.
- ``nonce`` checked against the value the caller round-tripped through state.
- Claims sanitized to a whitelist before persistence.

Claim sanitization is non-negotiable: arbitrary IdP claims must never land
in the database. The whitelist below is intentionally narrow.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import jwt

from app.auth.oidc_keys import oidc_keys

# Default claim whitelist. A provider's ``claim_mapping.allow_extra`` list can
# extend this on a per-provider basis without code changes.
_DEFAULT_CLAIM_WHITELIST = frozenset(
    {
        "sub",
        "email",
        "email_verified",
        "name",
        "preferred_username",
        "groups",
        "roles",
        "tid",
        "tenant_id",
        "oid",
    }
)


class OidcValidationError(Exception):
    """Raised when an OIDC token fails any validation step."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class ValidatedClaims:
    sub: str
    email: str | None
    name: str | None
    groups: list[str] = field(default_factory=list)
    tenant_id: str | None = None
    sanitized: dict[str, Any] = field(default_factory=dict)
    overage: bool = False  # Entra group overage indicator
    raw_iss: str = ""


def _sanitize_claims(payload: dict[str, Any], extra_allowed: set[str]) -> dict[str, Any]:
    allowed = _DEFAULT_CLAIM_WHITELIST | set(extra_allowed or set())
    return {k: v for k, v in payload.items() if k in allowed}


def _detect_overage(payload: dict[str, Any]) -> bool:
    """Entra returns ``_claim_names.groups`` and ``_claim_sources`` when a user
    is in too many groups for the token. ``hasgroups: true`` is the v2 hint.
    """
    if payload.get("hasgroups"):
        return True
    claim_names = payload.get("_claim_names")
    if isinstance(claim_names, dict) and "groups" in claim_names:
        return True
    return False


def _coerce_groups(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        return [value]
    return []


def validate_oidc_token(
    token: str,
    provider: dict[str, Any],
    *,
    expected_nonce: str | None = None,
    leeway_seconds: int = 30,
) -> ValidatedClaims:
    """Validate ``token`` against ``provider`` config and return canonical claims.

    ``provider`` is a row from ``app.identity_providers`` (as a dict) with
    keys ``provider_name``, ``issuer``, ``audience``, ``client_id``,
    ``discovery_url``, ``jwks_uri``, ``enabled``, ``claim_mapping``.
    """
    if not provider.get("enabled"):
        raise OidcValidationError("provider_disabled", "provider is not enabled")

    issuer = provider.get("issuer") or ""
    audience = provider.get("audience") or provider.get("client_id") or ""
    if not issuer or not audience:
        raise OidcValidationError("provider_misconfigured", "provider missing issuer or audience")

    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise OidcValidationError("invalid_token", f"could not parse JWT header: {exc}") from exc

    kid = unverified_header.get("kid")
    if not kid:
        raise OidcValidationError("invalid_token", "JWT header missing kid")

    try:
        signing_key = oidc_keys.get_signing_key(
            jwks_uri=provider.get("jwks_uri"),
            issuer=issuer,
            discovery_url=provider.get("discovery_url"),
            kid=kid,
        )
    except KeyError as exc:
        raise OidcValidationError("unknown_kid", str(exc)) from exc
    except Exception as exc:  # network / discovery / parse
        raise OidcValidationError("jwks_unavailable", f"could not load JWKS: {exc}") from exc

    try:
        payload = jwt.decode(
            token,
            key=signing_key.key,
            algorithms=[unverified_header.get("alg") or "RS256"],
            audience=audience,
            issuer=issuer,
            leeway=leeway_seconds,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise OidcValidationError("token_expired", str(exc)) from exc
    except jwt.InvalidAudienceError as exc:
        raise OidcValidationError("invalid_audience", str(exc)) from exc
    except jwt.InvalidIssuerError as exc:
        raise OidcValidationError("invalid_issuer", str(exc)) from exc
    except jwt.MissingRequiredClaimError as exc:
        raise OidcValidationError("missing_claim", str(exc)) from exc
    except jwt.InvalidTokenError as exc:
        raise OidcValidationError("invalid_token", str(exc)) from exc

    if expected_nonce is not None:
        token_nonce = payload.get("nonce")
        if not token_nonce or token_nonce != expected_nonce:
            raise OidcValidationError("nonce_mismatch", "nonce does not match request")

    claim_mapping = provider.get("claim_mapping") or {}
    if isinstance(claim_mapping, str):
        # tolerate a JSON-encoded string column read
        import json

        try:
            claim_mapping = json.loads(claim_mapping)
        except Exception:
            claim_mapping = {}

    extra_allowed = set(claim_mapping.get("allow_extra") or [])
    sanitized = _sanitize_claims(payload, extra_allowed)

    sub = payload.get("sub")
    if not sub:
        raise OidcValidationError("missing_claim", "sub claim missing")

    email_key = claim_mapping.get("email") or "email"
    name_key = claim_mapping.get("name") or "name"
    groups_key = claim_mapping.get("groups") or "groups"
    tenant_key = claim_mapping.get("tenant") or "tid"

    overage = _detect_overage(payload)

    return ValidatedClaims(
        sub=str(sub),
        email=payload.get(email_key) or payload.get("preferred_username"),
        name=payload.get(name_key),
        groups=[] if overage else _coerce_groups(payload.get(groups_key)),
        tenant_id=payload.get(tenant_key),
        sanitized=sanitized,
        overage=overage,
        raw_iss=str(payload.get("iss") or ""),
    )


def resolve_app_role(
    *,
    groups: list[str],
    group_role_mapping: dict[str, Any] | None,
    default_role: str | None,
    overage: bool,
    environment_slug: str | None = None,
    environment_id: str | None = None,
    business_id: str | None = None,
) -> tuple[str | None, str | None]:
    """Resolve an internal app_role from IdP groups.

    Mapping shape (immutable group IDs as keys):

        {
          "<group_id>": {
            "environment_slug": "...",
            "environment_id": "...",
            "business_id": "...",
            "app_role": "finance_admin"
          }
        }

    Returns ``(app_role, reason)``. ``app_role`` is ``None`` when no match
    is found AND no ``default_role`` is configured. ``reason`` is a short
    code suitable for audit (``mapped`` / ``default`` / ``overage`` /
    ``no_match``).
    """
    if overage:
        # Fail-closed for Entra group overage. Microsoft Graph fallback is
        # explicitly out of scope for this phase.
        if default_role:
            return default_role, "overage"
        return None, "overage"

    mapping = group_role_mapping or {}
    for group_id in groups:
        rule = mapping.get(group_id)
        if not isinstance(rule, dict):
            continue
        # Scope checks — keep the most specific gate that's configured.
        if rule.get("environment_slug") and environment_slug and rule["environment_slug"] != environment_slug:
            continue
        if rule.get("environment_id") and environment_id and str(rule["environment_id"]) != str(environment_id):
            continue
        if rule.get("business_id") and business_id and str(rule["business_id"]) != str(business_id):
            continue
        candidate = rule.get("app_role")
        if candidate in {"viewer", "operator", "finance_admin", "admin"}:
            return candidate, "mapped"

    if default_role:
        return default_role, "default"
    return None, "no_match"
