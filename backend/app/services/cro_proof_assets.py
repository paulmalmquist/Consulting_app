"""Consulting Revenue OS – Proof Asset service.

CRUD and summary for reusable proof collateral
(questionnaires, offer sheets, workflow examples).
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor


def list_proof_assets(
    *,
    env_id: str,
    business_id: UUID,
    status_filter: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        sql = """
            SELECT id, env_id, business_id, asset_type, title, description,
                   status, linked_offer_type, file_path, content_markdown,
                   last_used_at, use_count, created_at, updated_at
              FROM cro_proof_asset
             WHERE env_id = %s AND business_id = %s
        """
        params: list = [env_id, str(business_id)]
        if status_filter:
            sql += " AND status = %s"
            params.append(status_filter)
        sql += " ORDER BY updated_at DESC"
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def get_proof_asset(*, asset_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, env_id, business_id, asset_type, title, description,
                   status, linked_offer_type, file_path, content_markdown,
                   last_used_at, use_count, created_at, updated_at
              FROM cro_proof_asset
             WHERE id = %s
            """,
            (str(asset_id),),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def create_proof_asset(
    *,
    env_id: str,
    business_id: UUID,
    asset_type: str,
    title: str,
    description: str | None = None,
    status: str = "draft",
    linked_offer_type: str | None = None,
    file_path: str | None = None,
    content_markdown: str | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_proof_asset
              (env_id, business_id, asset_type, title, description, status,
               linked_offer_type, file_path, content_markdown)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, asset_type, title, description,
                      status, linked_offer_type, file_path, content_markdown,
                      last_used_at, use_count, created_at, updated_at
            """,
            (
                env_id, str(business_id), asset_type, title, description,
                status, linked_offer_type, file_path, content_markdown,
            ),
        )
        return dict(cur.fetchone())


def update_proof_asset(
    *,
    asset_id: UUID,
    status: str | None = None,
    title: str | None = None,
    description: str | None = None,
    content_markdown: str | None = None,
    file_path: str | None = None,
) -> dict | None:
    sets: list[str] = []
    params: list = []
    if status is not None:
        sets.append("status = %s")
        params.append(status)
    if title is not None:
        sets.append("title = %s")
        params.append(title)
    if description is not None:
        sets.append("description = %s")
        params.append(description)
    if content_markdown is not None:
        sets.append("content_markdown = %s")
        params.append(content_markdown)
    if file_path is not None:
        sets.append("file_path = %s")
        params.append(file_path)

    if not sets:
        return get_proof_asset(asset_id=asset_id)

    sets.append("updated_at = %s")
    params.append(datetime.now(timezone.utc))
    params.append(str(asset_id))

    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE cro_proof_asset
               SET {', '.join(sets)}
             WHERE id = %s
            RETURNING id, env_id, business_id, asset_type, title, description,
                      status, linked_offer_type, file_path, content_markdown,
                      last_used_at, use_count, created_at, updated_at
            """,
            params,
        )
        row = cur.fetchone()
        return dict(row) if row else None


def get_proof_asset_summary(
    *,
    env_id: str,
    business_id: UUID,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT status, COUNT(*)::int AS cnt
              FROM cro_proof_asset
             WHERE env_id = %s AND business_id = %s
             GROUP BY status
            """,
            (env_id, str(business_id)),
        )
        rows = cur.fetchall()
        counts = {r["status"]: r["cnt"] for r in rows}
        return {
            "total": sum(counts.values()),
            "ready": counts.get("ready", 0),
            "draft": counts.get("draft", 0),
            "needs_update": counts.get("needs_update", 0),
            "archived": counts.get("archived", 0),
        }
