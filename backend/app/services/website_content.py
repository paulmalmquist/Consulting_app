"""Website OS — Content module service.

All operations are scoped strictly by environment_id.
"""

from __future__ import annotations

from typing import Optional

from app.db import get_cursor

VALID_STATES = ("idea", "draft", "review", "scheduled", "published")
VALID_MONETIZATION = ("affiliate", "sponsor", "lead_gen", "none")


def list_content_items(
    env_id: str,
    state: Optional[str] = None,
) -> list[dict]:
    """Return content items for an environment, optionally filtered by state."""
    with get_cursor() as cur:
        if state:
            cur.execute(
                """SELECT id, environment_id, title, slug, category, area, state,
                          target_keyword, monetization_type, publish_date,
                          created_at, updated_at
                   FROM website_content_items
                   WHERE environment_id = %s::uuid AND state = %s
                   ORDER BY created_at DESC""",
                (env_id, state),
            )
        else:
            cur.execute(
                """SELECT id, environment_id, title, slug, category, area, state,
                          target_keyword, monetization_type, publish_date,
                          created_at, updated_at
                   FROM website_content_items
                   WHERE environment_id = %s::uuid
                   ORDER BY created_at DESC""",
                (env_id,),
            )
        return cur.fetchall()


def create_content_item(
    *,
    env_id: str,
    title: str,
    slug: str,
    category: Optional[str] = None,
    area: Optional[str] = None,
    state: str = "idea",
    target_keyword: Optional[str] = None,
    monetization_type: str = "none",
    publish_date: Optional[str] = None,
) -> dict:
    """Create a new content item."""
    if state not in VALID_STATES:
        raise ValueError(f"Invalid state '{state}'. Must be one of: {VALID_STATES}")
    if monetization_type not in VALID_MONETIZATION:
        raise ValueError(f"Invalid monetization_type '{monetization_type}'")

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO website_content_items
                 (environment_id, title, slug, category, area, state,
                  target_keyword, monetization_type, publish_date)
               VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING id, environment_id, title, slug, category, area, state,
                         target_keyword, monetization_type, publish_date,
                         created_at, updated_at""",
            (
                env_id, title, slug, category, area, state,
                target_keyword, monetization_type, publish_date,
            ),
        )
        return cur.fetchone()


def update_content_state(
    *,
    item_id: str,
    env_id: str,
    new_state: str,
) -> dict:
    """Advance a content item to a new state. Validates state is valid."""
    if new_state not in VALID_STATES:
        raise ValueError(f"Invalid state '{new_state}'. Must be one of: {VALID_STATES}")

    with get_cursor() as cur:
        cur.execute(
            """UPDATE website_content_items
               SET state = %s, updated_at = now()
               WHERE id = %s::uuid AND environment_id = %s::uuid
               RETURNING id, environment_id, title, slug, category, area, state,
                         target_keyword, monetization_type, publish_date,
                         created_at, updated_at""",
            (new_state, item_id, env_id),
        )
        row = cur.fetchone()

    if not row:
        raise LookupError(f"Content item {item_id} not found in environment {env_id}")
    return row


def get_content_stats(env_id: str) -> dict:
    """Return aggregate counts per state for an environment."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT
                 COUNT(*) FILTER (WHERE state = 'idea')       AS idea,
                 COUNT(*) FILTER (WHERE state = 'draft')      AS draft,
                 COUNT(*) FILTER (WHERE state = 'review')     AS review,
                 COUNT(*) FILTER (WHERE state = 'scheduled')  AS scheduled,
                 COUNT(*) FILTER (WHERE state = 'published')  AS published,
                 COUNT(*)                                      AS total
               FROM website_content_items
               WHERE environment_id = %s::uuid""",
            (env_id,),
        )
        row = cur.fetchone()
    return {
        "idea": row["idea"],
        "draft": row["draft"],
        "review": row["review"],
        "scheduled": row["scheduled"],
        "published": row["published"],
        "total": row["total"],
    }
