"""Idempotent seed for ``app.identity_providers``.

Reads provider config from environment variables and upserts placeholder
rows. Rows are written ``enabled=false`` when any required field is
missing, so the admin UI can flip them on once mapping is reviewed.

Client secrets stay in env vars (``OKTA_CLIENT_SECRET`` /
``ENTRA_CLIENT_SECRET``) and are never written to the database.

Usage::

    python backend/scripts/seed_identity_providers.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Allow running as a script from anywhere.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from app.services import identity_providers as ip_service  # noqa: E402


def _read_okta() -> dict | None:
    issuer = os.getenv("OKTA_ISSUER")
    client_id = os.getenv("OKTA_CLIENT_ID")
    if not issuer and not client_id:
        return None
    return {
        "provider_name": "okta",
        "kind": "okta",
        "issuer": issuer or "",
        "client_id": client_id or "",
        "audience": os.getenv("OKTA_AUDIENCE") or os.getenv("OKTA_CLIENT_ID") or "",
        "discovery_url": os.getenv("OKTA_DISCOVERY_URL")
        or (issuer.rstrip("/") + "/.well-known/openid-configuration" if issuer else None),
        "default_role": os.getenv("OKTA_DEFAULT_ROLE") or "viewer",
        "enabled": bool(issuer and client_id),
    }


def _read_entra() -> dict | None:
    tenant = os.getenv("ENTRA_TENANT_ID")
    client_id = os.getenv("ENTRA_CLIENT_ID")
    if not tenant and not client_id:
        return None
    issuer = f"https://login.microsoftonline.com/{tenant}/v2.0" if tenant else ""
    return {
        "provider_name": "entra",
        "kind": "azure_ad",
        "issuer": issuer,
        "client_id": client_id or "",
        "audience": os.getenv("ENTRA_AUDIENCE") or client_id or "",
        "discovery_url": (
            f"https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration"
            if tenant
            else None
        ),
        "default_role": os.getenv("ENTRA_DEFAULT_ROLE") or "viewer",
        "enabled": bool(tenant and client_id),
    }


def main() -> int:
    seeded: list[str] = []
    for builder in (_read_okta, _read_entra):
        row = builder()
        if not row:
            continue
        provider_id = ip_service.upsert_provider(
            provider_name=row["provider_name"],
            kind=row["kind"],
            issuer=row["issuer"],
            client_id=row["client_id"],
            audience=row.get("audience"),
            discovery_url=row.get("discovery_url"),
            jwks_uri=None,
            enabled=row.get("enabled", False),
            claim_mapping={},
            group_role_mapping={},
            default_role=row.get("default_role"),
        )
        seeded.append(
            f"{row['provider_name']} -> {provider_id} (enabled={row.get('enabled')})"
        )

    if not seeded:
        print(
            "no provider env vars set — set OKTA_* or ENTRA_* and re-run "
            "(see docs/identity-oidc.md)"
        )
        return 0

    print(json.dumps({"seeded": seeded}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
