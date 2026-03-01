"""Model > Scenario > Version spine CRUD operations."""

from __future__ import annotations

from uuid import UUID

from app.db import get_cursor


def list_models(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT model_id, fund_id, name, description, status,
                   created_by, approved_at, approved_by, created_at
            FROM re_model
            WHERE fund_id = %s
            ORDER BY created_at DESC
            """,
            (str(fund_id),),
        )
        return cur.fetchall()


def create_model(*, fund_id: UUID, name: str, description: str | None = None) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_model (fund_id, name, description, status)
            VALUES (%s, %s, %s, 'draft')
            RETURNING model_id, fund_id, name, description, status,
                      created_by, approved_at, approved_by, created_at
            """,
            (str(fund_id), name, description),
        )
        return cur.fetchone()


def get_model(*, model_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT model_id, fund_id, name, description, status,
                   created_by, approved_at, approved_by, created_at
            FROM re_model
            WHERE model_id = %s
            """,
            (str(model_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Model {model_id} not found")
        return row


def approve_model(*, model_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_model
            SET status = 'approved', approved_at = now()
            WHERE model_id = %s
            RETURNING model_id, fund_id, name, description, status,
                      created_by, approved_at, approved_by, created_at
            """,
            (str(model_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Model {model_id} not found")
        return row


def archive_model(*, model_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_model
            SET status = 'archived'
            WHERE model_id = %s
            RETURNING model_id, fund_id, name, description, status,
                      created_by, approved_at, approved_by, created_at
            """,
            (str(model_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Model {model_id} not found")
        return row


def list_versions(*, scenario_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT version_id, scenario_id, model_id, version_number,
                   label, assumption_set_id, is_locked, locked_at,
                   locked_by, notes, created_at
            FROM re_scenario_version
            WHERE scenario_id = %s
            ORDER BY version_number DESC
            """,
            (str(scenario_id),),
        )
        return cur.fetchall()


def create_version(
    *,
    scenario_id: UUID,
    model_id: UUID,
    label: str | None = None,
    assumption_set_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        # Determine next version number
        cur.execute(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM re_scenario_version WHERE scenario_id = %s",
            (str(scenario_id),),
        )
        next_version = cur.fetchone()["coalesce"]

        cur.execute(
            """
            INSERT INTO re_scenario_version
              (scenario_id, model_id, version_number, label, assumption_set_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING version_id, scenario_id, model_id, version_number,
                      label, assumption_set_id, is_locked, locked_at,
                      locked_by, notes, created_at
            """,
            (
                str(scenario_id),
                str(model_id),
                next_version,
                label,
                str(assumption_set_id) if assumption_set_id else None,
            ),
        )
        return cur.fetchone()


def lock_version(*, version_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE re_scenario_version
            SET is_locked = true, locked_at = now()
            WHERE version_id = %s AND NOT is_locked
            RETURNING version_id, scenario_id, model_id, version_number,
                      label, assumption_set_id, is_locked, locked_at,
                      locked_by, notes, created_at
            """,
            (str(version_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Version {version_id} not found or already locked")
        return row
