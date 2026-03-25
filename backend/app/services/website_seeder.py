"""Website OS — Workspace seeder.

Seeds minimal data for a new website environment:
- Floyorker: Palm Beach + Broward entities, ranking lists, badges, content
- Generic: 1 placeholder content item + 1 ranking list
"""

from __future__ import annotations

from datetime import date

from app.db import get_cursor
from app.observability.logger import emit_log


def _table_exists(cur, table_name: str) -> bool:
    cur.execute(
        """SELECT 1 FROM information_schema.tables
           WHERE table_name = %s
           LIMIT 1""",
        (table_name,),
    )
    return bool(cur.fetchone())


def seed_website_workspace(business_id: str, env_id: str, client_name: str) -> None:
    """Seed minimal website workspace data.

    Safe to call multiple times — checks for existing data first.
    """
    ctx = {
        "environment_id": env_id,
        "business_id": business_id,
        "module_name": "website_seeder",
        "client_name": client_name,
    }

    emit_log(
        level="info",
        service="backend",
        action="website.workspace.seed_start",
        message=f"Starting website workspace seed for '{client_name}'",
        context=ctx,
    )

    try:
        with get_cursor() as cur:
            # Guard: migration must have run
            if not _table_exists(cur, "website_content_items"):
                emit_log(
                    level="warn",
                    service="backend",
                    action="website.workspace.seed_skipped",
                    message="website_content_items table missing — migration 016 not applied",
                    context={**ctx, "init_status": "skipped", "error_reason": "missing_table:website_content_items"},
                )
                return

            # Guard: already seeded
            cur.execute(
                "SELECT 1 FROM website_content_items WHERE environment_id = %s::uuid LIMIT 1",
                (env_id,),
            )
            if cur.fetchone():
                emit_log(
                    level="info",
                    service="backend",
                    action="website.workspace.seed_skipped",
                    message="Workspace already seeded",
                    context={**ctx, "init_status": "already_initialized"},
                )
                return

        is_floyorker = client_name.strip().lower() == "floyorker"

        if is_floyorker:
            _seed_floyorker(env_id)
        else:
            _seed_generic(env_id, client_name)

        emit_log(
            level="info",
            service="backend",
            action="website.workspace.seed_complete",
            message="Website workspace seeded successfully",
            context={**ctx, "init_status": "initialized", "is_floyorker": is_floyorker},
        )

    except Exception as exc:
        emit_log(
            level="error",
            service="backend",
            action="website.workspace.seed_failed",
            message=f"Website workspace seed failed: {exc}",
            context={**ctx, "init_status": "failed", "error_reason": str(exc)},
        )
        raise


def _seed_floyorker(env_id: str) -> None:
    """Seed Floyorker-specific data: Palm Beach + Broward entities, lists, badges, content."""
    with get_cursor() as cur:
        # ── Entities ──────────────────────────────────────────────────
        bagel_entities = [
            ("Einstein Bros Bagels", "Bagels", "Palm Beach County"),
            ("Barry's Bagels", "Bagels", "Palm Beach County"),
            ("NYC Bagel Deli", "Bagels", "Palm Beach County"),
        ]
        pizza_entities = [
            ("Louie Bossi's", "Pizza", "Broward County"),
            ("Rocco's Tacos (Pizza)", "Pizza", "Broward County"),
            ("Brozinni Pizzeria", "Pizza", "Broward County"),
        ]

        bagel_ids = []
        pizza_ids = []

        for name, category, location in bagel_entities:
            cur.execute(
                """INSERT INTO website_entities (environment_id, name, category, location, tags)
                   VALUES (%s::uuid, %s, %s, %s, '[]'::jsonb)
                   RETURNING id""",
                (env_id, name, category, location),
            )
            bagel_ids.append(cur.fetchone()["id"])

        for name, category, location in pizza_entities:
            cur.execute(
                """INSERT INTO website_entities (environment_id, name, category, location, tags)
                   VALUES (%s::uuid, %s, %s, %s, '[]'::jsonb)
                   RETURNING id""",
                (env_id, name, category, location),
            )
            pizza_ids.append(cur.fetchone()["id"])

        # ── Ranking lists ──────────────────────────────────────────────
        cur.execute(
            """INSERT INTO website_ranking_lists (environment_id, name, category, area)
               VALUES (%s::uuid, 'Best Bagels - Palm Beach County', 'Bagels', 'Palm Beach County')
               RETURNING id""",
            (env_id,),
        )
        bagel_list_id = cur.fetchone()["id"]

        cur.execute(
            """INSERT INTO website_ranking_lists (environment_id, name, category, area)
               VALUES (%s::uuid, 'Best Pizza - Broward County', 'Pizza', 'Broward County')
               RETURNING id""",
            (env_id,),
        )
        pizza_list_id = cur.fetchone()["id"]

        # ── Ranking entries ────────────────────────────────────────────
        for rank, entity_id in enumerate(bagel_ids, start=1):
            cur.execute(
                """INSERT INTO website_ranking_entries (ranking_list_id, entity_id, rank, score)
                   VALUES (%s::uuid, %s::uuid, %s, %s)""",
                (bagel_list_id, entity_id, rank, round(10.0 - (rank - 1) * 0.5, 1)),
            )
            cur.execute(
                """INSERT INTO website_ranking_changes
                     (environment_id, ranking_list_id, entity_id, old_rank, new_rank, changed_by)
                   VALUES (%s::uuid, %s::uuid, %s::uuid, NULL, %s, 'seeder')""",
                (env_id, bagel_list_id, entity_id, rank),
            )

        for rank, entity_id in enumerate(pizza_ids, start=1):
            cur.execute(
                """INSERT INTO website_ranking_entries (ranking_list_id, entity_id, rank, score)
                   VALUES (%s::uuid, %s::uuid, %s, %s)""",
                (pizza_list_id, entity_id, rank, round(10.0 - (rank - 1) * 0.5, 1)),
            )
            cur.execute(
                """INSERT INTO website_ranking_changes
                     (environment_id, ranking_list_id, entity_id, old_rank, new_rank, changed_by)
                   VALUES (%s::uuid, %s::uuid, %s::uuid, NULL, %s, 'seeder')""",
                (env_id, pizza_list_id, entity_id, rank),
            )

        # ── Champion badges for #1 in each list ───────────────────────
        cur.execute(
            """INSERT INTO website_champion_badges (environment_id, entity_id, badge_type)
               VALUES (%s::uuid, %s::uuid, 'area_champ')""",
            (env_id, bagel_ids[0]),
        )
        cur.execute(
            """INSERT INTO website_champion_badges (environment_id, entity_id, badge_type)
               VALUES (%s::uuid, %s::uuid, 'area_champ')""",
            (env_id, pizza_ids[0]),
        )

        # ── Seed content items ─────────────────────────────────────────
        content_items = [
            ("Best Bagels in Palm Beach County", "best-bagels-palm-beach", "Rankings", "Palm Beach County", "published", "best bagels palm beach county"),
            ("Best Pizza in Broward County", "best-pizza-broward", "Rankings", "Broward County", "published", "best pizza broward county"),
        ]
        for title, slug, category, area, state, keyword in content_items:
            cur.execute(
                """INSERT INTO website_content_items
                     (environment_id, title, slug, category, area, state, target_keyword, monetization_type)
                   VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, 'affiliate')""",
                (env_id, title, slug, category, area, state, keyword),
            )

        # ── Seed today's analytics snapshot ───────────────────────────
        today = date.today().isoformat()
        cur.execute(
            """INSERT INTO website_analytics_snapshots
                 (environment_id, date, sessions, pageviews, conversions, revenue, top_page)
               VALUES (%s::uuid, %s::date, 0, 0, 0, 0, NULL)
               ON CONFLICT (environment_id, date) DO NOTHING""",
            (env_id, today),
        )


def _seed_generic(env_id: str, client_name: str) -> None:
    """Seed minimal data for a generic website environment."""
    with get_cursor() as cur:
        # One placeholder content item
        cur.execute(
            """INSERT INTO website_content_items
                 (environment_id, title, slug, category, state, monetization_type)
               VALUES (%s::uuid, %s, %s, 'General', 'idea', 'none')""",
            (env_id, f"Welcome to {client_name}", "welcome"),
        )

        # One placeholder ranking list
        cur.execute(
            """INSERT INTO website_ranking_lists (environment_id, name, category, area)
               VALUES (%s::uuid, 'Top Picks', 'General', NULL)""",
            (env_id,),
        )
