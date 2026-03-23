"""Website OS — Analytics module service.

Manages time-series analytics snapshots and summary KPIs.
All operations scoped strictly by environment_id.
"""

from __future__ import annotations

from typing import Optional

from app.db import get_cursor


def list_snapshots(env_id: str, days: int = 30) -> list[dict]:
    """Return the last N days of analytics snapshots for an environment."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, environment_id, date, sessions, pageviews,
                      conversions, revenue, top_page
               FROM website_analytics_snapshots
               WHERE environment_id = %s::uuid
                 AND date >= CURRENT_DATE - (%s || ' days')::interval
               ORDER BY date DESC""",
            (env_id, str(days)),
        )
        return cur.fetchall()


def upsert_snapshot(
    *,
    env_id: str,
    date: str,
    sessions: int = 0,
    pageviews: int = 0,
    conversions: int = 0,
    revenue: float = 0.0,
    top_page: Optional[str] = None,
) -> dict:
    """Insert or update an analytics snapshot for a given date."""
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO website_analytics_snapshots
                 (environment_id, date, sessions, pageviews, conversions, revenue, top_page)
               VALUES (%s::uuid, %s::date, %s, %s, %s, %s, %s)
               ON CONFLICT (environment_id, date) DO UPDATE
                 SET sessions    = EXCLUDED.sessions,
                     pageviews   = EXCLUDED.pageviews,
                     conversions = EXCLUDED.conversions,
                     revenue     = EXCLUDED.revenue,
                     top_page    = EXCLUDED.top_page
               RETURNING id, environment_id, date, sessions, pageviews,
                         conversions, revenue, top_page""",
            (env_id, date, sessions, pageviews, conversions, revenue, top_page),
        )
        return cur.fetchone()


def get_analytics_summary(env_id: str) -> dict:
    """Compute the 7 KPI values displayed on the Website Dashboard.

    Aggregates from:
    - website_analytics_snapshots (sessions, conversions, revenue, top_page)
    - website_content_items (new content count)
    - website_ranking_changes (recent ranking movements)
    """
    with get_cursor() as cur:
        # Sessions (7d)
        cur.execute(
            """SELECT COALESCE(SUM(sessions), 0) AS sessions_7d
               FROM website_analytics_snapshots
               WHERE environment_id = %s::uuid
                 AND date >= CURRENT_DATE - interval '7 days'""",
            (env_id,),
        )
        sessions_7d = cur.fetchone()["sessions_7d"]

        # Sessions (30d)
        cur.execute(
            """SELECT COALESCE(SUM(sessions), 0) AS sessions_30d
               FROM website_analytics_snapshots
               WHERE environment_id = %s::uuid
                 AND date >= CURRENT_DATE - interval '30 days'""",
            (env_id,),
        )
        sessions_30d = cur.fetchone()["sessions_30d"]

        # Top page (7d — the page that appeared most as top_page)
        cur.execute(
            """SELECT top_page
               FROM website_analytics_snapshots
               WHERE environment_id = %s::uuid
                 AND date >= CURRENT_DATE - interval '7 days'
                 AND top_page IS NOT NULL
               GROUP BY top_page
               ORDER BY COUNT(*) DESC
               LIMIT 1""",
            (env_id,),
        )
        row = cur.fetchone()
        top_page_7d = row["top_page"] if row else None

        # New content (30d)
        cur.execute(
            """SELECT COUNT(*) AS cnt
               FROM website_content_items
               WHERE environment_id = %s::uuid
                 AND created_at >= now() - interval '30 days'""",
            (env_id,),
        )
        new_content_30d = cur.fetchone()["cnt"]

        # Revenue MTD
        cur.execute(
            """SELECT COALESCE(SUM(revenue), 0) AS revenue_mtd
               FROM website_analytics_snapshots
               WHERE environment_id = %s::uuid
                 AND date >= date_trunc('month', CURRENT_DATE)""",
            (env_id,),
        )
        revenue_mtd = float(cur.fetchone()["revenue_mtd"])

        # Conversion events (7d)
        cur.execute(
            """SELECT COALESCE(SUM(conversions), 0) AS conv_7d
               FROM website_analytics_snapshots
               WHERE environment_id = %s::uuid
                 AND date >= CURRENT_DATE - interval '7 days'""",
            (env_id,),
        )
        conversion_events_7d = cur.fetchone()["conv_7d"]

        # Ranking changes (30d)
        cur.execute(
            """SELECT COUNT(*) AS cnt
               FROM website_ranking_changes
               WHERE environment_id = %s::uuid
                 AND changed_at >= now() - interval '30 days'""",
            (env_id,),
        )
        ranking_changes_30d = cur.fetchone()["cnt"]

    return {
        "sessions_7d": int(sessions_7d),
        "sessions_30d": int(sessions_30d),
        "top_page_7d": top_page_7d,
        "new_content_30d": int(new_content_30d),
        "revenue_mtd": revenue_mtd,
        "conversion_events_7d": int(conversion_events_7d),
        "ranking_changes_30d": int(ranking_changes_30d),
    }
