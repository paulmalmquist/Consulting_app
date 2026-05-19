"""outreach_personalizer.py — Outreach Personalizer DB service.

All DB reads/writes for cro_outreach_target, cro_outreach_asset, and
cro_microsite_event. AI orchestration lives in outreach_personalizer_ai.py.

Rules (mirror pitch_forge):
- Synchronous DB via get_cursor()
- Return dicts (not ORM models)
- Raise OutreachPersonalizerError subclasses for domain failures
- Tenant scoping via explicit WHERE env_id = %s (RLS is defense-in-depth)
"""
from __future__ import annotations

import json
from uuid import UUID

from app.db import get_cursor

PUBLIC_STATUSES = ("assets_ready", "microsite_live")


# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------

class OutreachPersonalizerError(Exception):
    """Base class for Outreach Personalizer domain errors."""


class OutreachTargetNotFound(OutreachPersonalizerError):
    """Requested target does not exist."""


# ---------------------------------------------------------------------------
# cro_outreach_target
# ---------------------------------------------------------------------------

def get_target_by_id(*, target_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM cro_outreach_target WHERE id = %s::uuid",
            (str(target_id),),
        )
        row = cur.fetchone()
    if not row:
        raise OutreachTargetNotFound(f"Target {target_id} not found")
    return row


def get_target_by_slug(*, env_id: str, firm_slug: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM cro_outreach_target
               WHERE env_id = %s AND firm_slug = %s""",
            (env_id, firm_slug),
        )
        return cur.fetchone()


def get_public_target_by_slug(*, firm_slug: str) -> dict | None:
    """Public lookup by slug only (no env context). Returns the latest row for
    the slug regardless of status; the route decides ready vs not-ready so the
    public page can distinguish 'not found' from 'not ready'. Phase 1 is
    single-tenant; Phase 2 must add env disambiguation if a slug recurs."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM cro_outreach_target
               WHERE firm_slug = %s
               ORDER BY updated_at DESC
               LIMIT 1""",
            (firm_slug,),
        )
        return cur.fetchone()


def is_public_ready(target: dict) -> bool:
    return target.get("status") in PUBLIC_STATUSES


def list_targets(*, env_id: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM cro_outreach_target
               WHERE env_id = %s
               ORDER BY updated_at DESC""",
            (env_id,),
        )
        return cur.fetchall()


def create_target(*, env_id: str, business_id: UUID | None, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO cro_outreach_target
               (env_id, business_id, firm_name, firm_slug, logo_url, accent_hsl,
                profile_json, loom_url, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, 'pending')
               RETURNING *""",
            (
                env_id,
                str(business_id) if business_id else None,
                payload["firm_name"],
                payload["firm_slug"],
                payload.get("logo_url"),
                payload.get("accent_hsl"),
                json.dumps(payload.get("profile_json") or {}),
                payload.get("loom_url"),
            ),
        )
        return cur.fetchone()


def update_target(
    *,
    target_id: UUID,
    status: str | None = None,
    microsite_url: str | None = None,
    loom_url: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """UPDATE cro_outreach_target
               SET status        = COALESCE(%s, status),
                   microsite_url = COALESCE(%s, microsite_url),
                   loom_url      = COALESCE(%s, loom_url),
                   updated_at    = now()
               WHERE id = %s::uuid
               RETURNING *""",
            (status, microsite_url, loom_url, str(target_id)),
        )
        row = cur.fetchone()
    if not row:
        raise OutreachTargetNotFound(f"Target {target_id} not found")
    return row


# ---------------------------------------------------------------------------
# cro_outreach_asset
# ---------------------------------------------------------------------------

def list_assets(*, target_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT * FROM cro_outreach_asset
               WHERE target_id = %s::uuid
               ORDER BY asset_type ASC, position ASC""",
            (str(target_id),),
        )
        return cur.fetchall()


def insert_asset(
    *, target_id: UUID, asset_type: str, payload: dict, position: int = 0
) -> dict:
    """Initial generation. regenerated_count stays at its default of 0."""
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO cro_outreach_asset
               (target_id, asset_type, position, payload)
               VALUES (%s::uuid, %s, %s, %s::jsonb)
               RETURNING *""",
            (str(target_id), asset_type, position, json.dumps(payload)),
        )
        return cur.fetchone()


def regenerate_asset_row(*, target_id: UUID, asset_type: str, payload: dict) -> dict:
    """Replace an asset's payload and increment regenerated_count.

    If no row exists yet for this asset_type, insert one already marked as a
    regeneration (count = 1) so the counter still reflects the action.
    """
    with get_cursor() as cur:
        cur.execute(
            """UPDATE cro_outreach_asset
               SET payload           = %s::jsonb,
                   generated_at      = now(),
                   regenerated_count = regenerated_count + 1
               WHERE target_id = %s::uuid AND asset_type = %s
               RETURNING *""",
            (json.dumps(payload), str(target_id), asset_type),
        )
        row = cur.fetchone()
        if row:
            return row
        cur.execute(
            """INSERT INTO cro_outreach_asset
               (target_id, asset_type, position, payload, regenerated_count)
               VALUES (%s::uuid, %s, 0, %s::jsonb, 1)
               RETURNING *""",
            (str(target_id), asset_type, json.dumps(payload)),
        )
        return cur.fetchone()


# ---------------------------------------------------------------------------
# cro_microsite_event
# ---------------------------------------------------------------------------

def record_microsite_event(
    *,
    target_id: UUID | None,
    env_id: str | None,
    microsite_slug: str,
    event_type: str,
    metadata: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO cro_microsite_event
               (target_id, env_id, microsite_slug, event_type, metadata,
                ip_address, user_agent)
               VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
               RETURNING *""",
            (
                str(target_id) if target_id else None,
                env_id,
                microsite_slug,
                event_type,
                json.dumps(metadata or {}),
                ip_address,
                user_agent,
            ),
        )
        return cur.fetchone()
