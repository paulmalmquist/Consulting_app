"""Consulting Revenue OS – Demo readiness service.

Tracks readiness state per product/vertical demo.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor


def list_demo_readiness(
    *,
    env_id: str,
    business_id: UUID,
) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, env_id, business_id, demo_name, vertical,
                   status, blockers, last_tested_at, notes,
                   created_at, updated_at
              FROM cro_demo_readiness
             WHERE env_id = %s AND business_id = %s
             ORDER BY demo_name
            """,
            (env_id, str(business_id)),
        )
        return [dict(r) for r in cur.fetchall()]


def update_demo_readiness(
    *,
    demo_id: UUID,
    status: str | None = None,
    blockers: list[str] | None = None,
    notes: str | None = None,
    last_tested_at: datetime | None = None,
) -> dict | None:
    sets: list[str] = []
    params: list = []
    if status is not None:
        sets.append("status = %s")
        params.append(status)
    if blockers is not None:
        sets.append("blockers = %s")
        params.append(blockers)
    if notes is not None:
        sets.append("notes = %s")
        params.append(notes)
    if last_tested_at is not None:
        sets.append("last_tested_at = %s")
        params.append(last_tested_at)

    if not sets:
        return None

    sets.append("updated_at = %s")
    params.append(datetime.now(timezone.utc))
    params.append(str(demo_id))

    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE cro_demo_readiness
               SET {', '.join(sets)}
             WHERE id = %s
            RETURNING id, env_id, business_id, demo_name, vertical,
                      status, blockers, last_tested_at, notes,
                      created_at, updated_at
            """,
            params,
        )
        row = cur.fetchone()
        return dict(row) if row else None
