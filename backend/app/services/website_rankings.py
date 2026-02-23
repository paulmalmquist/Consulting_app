"""Website OS — Rankings module service.

Manages entities, ranking lists, entries, champion badges, and the audit log.
All operations scoped strictly by environment_id.
"""

from __future__ import annotations

import json
from typing import Optional

from app.db import get_cursor

VALID_BADGE_TYPES = ("area_champ", "p4p_champ")


# ── Entities ──────────────────────────────────────────────────────────

def list_entities(
    env_id: str,
    category: Optional[str] = None,
) -> list[dict]:
    with get_cursor() as cur:
        if category:
            cur.execute(
                """SELECT id, environment_id, name, category, location, website,
                          instagram, tags, editorial_notes, last_verified_at, created_at
                   FROM website_entities
                   WHERE environment_id = %s::uuid AND category = %s
                   ORDER BY name""",
                (env_id, category),
            )
        else:
            cur.execute(
                """SELECT id, environment_id, name, category, location, website,
                          instagram, tags, editorial_notes, last_verified_at, created_at
                   FROM website_entities
                   WHERE environment_id = %s::uuid
                   ORDER BY name""",
                (env_id,),
            )
        return cur.fetchall()


def create_entity(
    *,
    env_id: str,
    name: str,
    category: Optional[str] = None,
    location: Optional[str] = None,
    website: Optional[str] = None,
    instagram: Optional[str] = None,
    tags: Optional[list] = None,
    editorial_notes: Optional[str] = None,
) -> dict:
    tags_json = json.dumps(tags or [])
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO website_entities
                 (environment_id, name, category, location, website,
                  instagram, tags, editorial_notes)
               VALUES (%s::uuid, %s, %s, %s, %s, %s, %s::jsonb, %s)
               RETURNING id, environment_id, name, category, location, website,
                         instagram, tags, editorial_notes, last_verified_at, created_at""",
            (env_id, name, category, location, website, instagram, tags_json, editorial_notes),
        )
        return cur.fetchone()


# ── Ranking lists ─────────────────────────────────────────────────────

def list_ranking_lists(env_id: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT rl.id, rl.environment_id, rl.name, rl.category, rl.area,
                      rl.created_at,
                      COUNT(re.id) AS entry_count
               FROM website_ranking_lists rl
               LEFT JOIN website_ranking_entries re ON re.ranking_list_id = rl.id
               WHERE rl.environment_id = %s::uuid
               GROUP BY rl.id
               ORDER BY rl.created_at DESC""",
            (env_id,),
        )
        return cur.fetchall()


def create_ranking_list(
    *,
    env_id: str,
    name: str,
    category: Optional[str] = None,
    area: Optional[str] = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO website_ranking_lists (environment_id, name, category, area)
               VALUES (%s::uuid, %s, %s, %s)
               RETURNING id, environment_id, name, category, area, created_at""",
            (env_id, name, category, area),
        )
        return cur.fetchone()


def get_ranking_list_with_entries(
    ranking_list_id: str,
    env_id: str,
) -> dict:
    """Return ranking list metadata plus all entries ordered by rank."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, environment_id, name, category, area, created_at
               FROM website_ranking_lists
               WHERE id = %s::uuid AND environment_id = %s::uuid""",
            (ranking_list_id, env_id),
        )
        rl = cur.fetchone()

    if not rl:
        raise LookupError(f"Ranking list {ranking_list_id} not found in environment {env_id}")

    with get_cursor() as cur:
        cur.execute(
            """SELECT re.id, re.rank, re.score, re.notes, re.updated_at,
                      re.entity_id,
                      e.name AS entity_name, e.category AS entity_category,
                      e.location AS entity_location
               FROM website_ranking_entries re
               LEFT JOIN website_entities e ON e.id = re.entity_id
               WHERE re.ranking_list_id = %s::uuid
               ORDER BY re.rank""",
            (ranking_list_id,),
        )
        entries = cur.fetchall()

    return {**rl, "entries": entries}


def set_ranking_entry(
    *,
    ranking_list_id: str,
    entity_id: Optional[str],
    rank: int,
    score: Optional[float] = None,
    notes: Optional[str] = None,
    env_id: str,
) -> dict:
    """UPSERT a ranking entry and write to the audit log."""
    # Verify the list belongs to the environment
    with get_cursor() as cur:
        cur.execute(
            "SELECT id FROM website_ranking_lists WHERE id = %s::uuid AND environment_id = %s::uuid",
            (ranking_list_id, env_id),
        )
        if not cur.fetchone():
            raise LookupError(f"Ranking list {ranking_list_id} not in environment {env_id}")

    # Get current rank for the entity in this list (for audit log)
    old_rank = None
    with get_cursor() as cur:
        if entity_id:
            cur.execute(
                """SELECT rank FROM website_ranking_entries
                   WHERE ranking_list_id = %s::uuid AND entity_id = %s::uuid""",
                (ranking_list_id, entity_id),
            )
            existing = cur.fetchone()
            if existing:
                old_rank = existing["rank"]

        # UPSERT the entry
        cur.execute(
            """INSERT INTO website_ranking_entries
                 (ranking_list_id, entity_id, rank, score, notes)
               VALUES (%s::uuid, %s::uuid, %s, %s, %s)
               ON CONFLICT (ranking_list_id, rank) DO UPDATE
                 SET entity_id = EXCLUDED.entity_id,
                     score = EXCLUDED.score,
                     notes = EXCLUDED.notes,
                     updated_at = now()
               RETURNING id, ranking_list_id, entity_id, rank, score, notes, updated_at""",
            (ranking_list_id, entity_id, rank, score, notes),
        )
        entry = cur.fetchone()

        # Write to audit log
        cur.execute(
            """INSERT INTO website_ranking_changes
                 (environment_id, ranking_list_id, entity_id, old_rank, new_rank, changed_by)
               VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, 'operator')""",
            (env_id, ranking_list_id, entity_id, old_rank, rank),
        )

    return entry


# ── Champion badges ───────────────────────────────────────────────────

def list_champion_badges(env_id: str) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT cb.id, cb.environment_id, cb.entity_id, cb.badge_type, cb.awarded_at,
                      e.name AS entity_name, e.category AS entity_category
               FROM website_champion_badges cb
               JOIN website_entities e ON e.id = cb.entity_id
               WHERE cb.environment_id = %s::uuid
               ORDER BY cb.awarded_at DESC""",
            (env_id,),
        )
        return cur.fetchall()


def award_champion_badge(
    *,
    env_id: str,
    entity_id: str,
    badge_type: str,
) -> dict:
    if badge_type not in VALID_BADGE_TYPES:
        raise ValueError(f"Invalid badge_type '{badge_type}'. Must be one of: {VALID_BADGE_TYPES}")

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO website_champion_badges (environment_id, entity_id, badge_type)
               VALUES (%s::uuid, %s::uuid, %s)
               RETURNING id, environment_id, entity_id, badge_type, awarded_at""",
            (env_id, entity_id, badge_type),
        )
        return cur.fetchone()


# ── Ranking audit log ─────────────────────────────────────────────────

def list_ranking_changes(env_id: str, limit: int = 50) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT rc.id, rc.environment_id, rc.ranking_list_id, rc.entity_id,
                      rc.old_rank, rc.new_rank, rc.changed_by, rc.changed_at,
                      e.name AS entity_name,
                      rl.name AS list_name
               FROM website_ranking_changes rc
               LEFT JOIN website_entities e ON e.id = rc.entity_id
               LEFT JOIN website_ranking_lists rl ON rl.id = rc.ranking_list_id
               WHERE rc.environment_id = %s::uuid
               ORDER BY rc.changed_at DESC
               LIMIT %s""",
            (env_id, limit),
        )
        return cur.fetchall()


# ── Aggregate stats ───────────────────────────────────────────────────

def get_rankings_stats(env_id: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM website_ranking_lists WHERE environment_id = %s::uuid",
            (env_id,),
        )
        lists_count = cur.fetchone()["cnt"]

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM website_entities WHERE environment_id = %s::uuid",
            (env_id,),
        )
        entities_count = cur.fetchone()["cnt"]

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM website_champion_badges WHERE environment_id = %s::uuid",
            (env_id,),
        )
        champion_count = cur.fetchone()["cnt"]

        cur.execute(
            """SELECT COUNT(*) AS cnt FROM website_ranking_changes
               WHERE environment_id = %s::uuid
                 AND changed_at >= now() - interval '30 days'""",
            (env_id,),
        )
        recent_changes_count = cur.fetchone()["cnt"]

    return {
        "lists_count": lists_count,
        "entities_count": entities_count,
        "champion_count": champion_count,
        "recent_changes_count": recent_changes_count,
    }
