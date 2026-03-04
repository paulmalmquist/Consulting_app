"""Model > Scenario > Version spine CRUD operations.

Extended with scope, override, and resolve functions for the Models workspace.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


# ── Helpers ──────────────────────────────────────────────────────────────────

def _canonical_json(data: dict) -> str:
    return json.dumps(data, sort_keys=True, default=str)


def _compute_hash(data: dict) -> str:
    return hashlib.sha256(_canonical_json(data).encode()).hexdigest()


def _extract_value(row: dict):
    vt = row.get("value_type", "decimal")
    if vt == "decimal" and row.get("value_decimal") is not None:
        return Decimal(str(row["value_decimal"]))
    if vt == "int" and row.get("value_int") is not None:
        return row["value_int"]
    if vt == "string" and row.get("value_text") is not None:
        return row["value_text"]
    if vt == "bool" and row.get("value_text") is not None:
        return row["value_text"].lower() in ("true", "1", "yes")
    if vt == "curve_json" and row.get("value_json") is not None:
        return row["value_json"]
    return (
        row.get("value_decimal")
        or row.get("value_int")
        or row.get("value_text")
        or row.get("value_json")
    )


# ── Model CRUD ───────────────────────────────────────────────────────────────

_MODEL_COLS = """model_id, primary_fund_id, env_id, name, description, status,
                   model_type, locked_at,
                   strategy_type, base_snapshot_id,
                   created_by, approved_at, approved_by, created_at, updated_at"""


def list_models(*, fund_id: UUID | None = None, env_id: UUID | None = None) -> list[dict]:
    with get_cursor() as cur:
        if env_id:
            cur.execute(
                f"SELECT {_MODEL_COLS} FROM re_model WHERE env_id = %s ORDER BY created_at DESC",
                (str(env_id),),
            )
        elif fund_id:
            cur.execute(
                f"SELECT {_MODEL_COLS} FROM re_model WHERE primary_fund_id = %s ORDER BY created_at DESC",
                (str(fund_id),),
            )
        else:
            cur.execute(f"SELECT {_MODEL_COLS} FROM re_model ORDER BY created_at DESC")
        return cur.fetchall()


def create_model(
    *,
    fund_id: UUID | None = None,
    env_id: UUID | None = None,
    name: str,
    description: str | None = None,
    strategy_type: str | None = None,
    base_snapshot_id: UUID | None = None,
    model_type: str = "scenario",
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO re_model (primary_fund_id, env_id, name, description, status,
                                  strategy_type, base_snapshot_id, model_type)
            VALUES (%s, %s, %s, %s, 'draft', %s, %s, %s)
            RETURNING {_MODEL_COLS}
            """,
            (
                str(fund_id) if fund_id else None,
                str(env_id) if env_id else None,
                name,
                description,
                strategy_type,
                str(base_snapshot_id) if base_snapshot_id else None,
                model_type,
            ),
        )
        model = cur.fetchone()

        # Auto-create Base scenario
        cur.execute(
            """
            INSERT INTO re_model_scenarios (model_id, name, description, is_base)
            VALUES (%s, 'Base', 'Default base scenario', true)
            ON CONFLICT (model_id, name) DO NOTHING
            """,
            (str(model["model_id"]),),
        )

        return model


def get_model(*, model_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {_MODEL_COLS}
            FROM re_model
            WHERE model_id = %s
            """,
            (str(model_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Model {model_id} not found")
        return row


def update_model(*, model_id: UUID, payload: dict) -> dict:
    sets = []
    params = []
    for field in ("name", "description", "strategy_type", "model_type"):
        if field in payload and payload[field] is not None:
            sets.append(f"{field} = %s")
            params.append(payload[field])
    if not sets:
        return get_model(model_id=model_id)
    sets.append("updated_at = now()")
    params.append(str(model_id))
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE re_model
            SET {', '.join(sets)}
            WHERE model_id = %s
            RETURNING {_MODEL_COLS}
            """,
            params,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Model {model_id} not found")
        return row


def approve_model(*, model_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE re_model
            SET status = 'approved', approved_at = now(), updated_at = now()
            WHERE model_id = %s
            RETURNING {_MODEL_COLS}
            """,
            (str(model_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Model {model_id} not found")
        return row


def lock_model(*, model_id: UUID) -> dict:
    """Lock a model (set locked_at). Model must have a model_type set."""
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE re_model
            SET status = 'approved', approved_at = COALESCE(approved_at, now()),
                locked_at = now(), updated_at = now()
            WHERE model_id = %s AND locked_at IS NULL
            RETURNING {_MODEL_COLS}
            """,
            (str(model_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Model {model_id} not found or already locked")
        if not row.get("model_type") or row["model_type"] == "scenario":
            raise ValueError("Set model_type before locking (e.g. underwriting_io, forecast)")
        return row


def archive_model(*, model_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE re_model
            SET status = 'archived', updated_at = now()
            WHERE model_id = %s
            RETURNING {_MODEL_COLS}
            """,
            (str(model_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Model {model_id} not found")
        return row


# ── Model Scope ──────────────────────────────────────────────────────────────

def list_model_scope(*, model_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, model_id, scope_type, scope_node_id, include, created_at
            FROM re_model_scope
            WHERE model_id = %s
            ORDER BY scope_type, created_at
            """,
            (str(model_id),),
        )
        return cur.fetchall()


def add_model_scope(
    *,
    model_id: UUID,
    scope_type: str,
    scope_node_id: UUID,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_model_scope (model_id, scope_type, scope_node_id, include)
            VALUES (%s, %s, %s, true)
            ON CONFLICT (model_id, scope_type, scope_node_id)
            DO UPDATE SET include = true
            RETURNING id, model_id, scope_type, scope_node_id, include, created_at
            """,
            (str(model_id), scope_type, str(scope_node_id)),
        )
        return cur.fetchone()


def remove_model_scope(
    *,
    model_id: UUID,
    scope_type: str,
    scope_node_id: UUID,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            DELETE FROM re_model_scope
            WHERE model_id = %s AND scope_type = %s AND scope_node_id = %s
            """,
            (str(model_id), scope_type, str(scope_node_id)),
        )


def get_scoped_asset_ids(*, model_id: UUID) -> list[str]:
    """Return list of asset IDs that are in scope for this model."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT scope_node_id FROM re_model_scope
            WHERE model_id = %s AND scope_type = 'asset' AND include = true
            """,
            (str(model_id),),
        )
        return [str(row["scope_node_id"]) for row in cur.fetchall()]


# ── Model Overrides ──────────────────────────────────────────────────────────

def set_model_override(*, model_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_model_override (
                model_id, scope_node_type, scope_node_id, key,
                value_type, value_decimal, value_int, value_text,
                value_json, reason
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (model_id, scope_node_type, scope_node_id, key) DO UPDATE
            SET value_type = EXCLUDED.value_type,
                value_decimal = EXCLUDED.value_decimal,
                value_int = EXCLUDED.value_int,
                value_text = EXCLUDED.value_text,
                value_json = EXCLUDED.value_json,
                reason = EXCLUDED.reason,
                is_active = true
            RETURNING *
            """,
            (
                str(model_id),
                payload["scope_node_type"],
                str(payload["scope_node_id"]),
                payload["key"],
                payload.get("value_type", "decimal"),
                payload.get("value_decimal"),
                payload.get("value_int"),
                payload.get("value_text"),
                json.dumps(payload["value_json"]) if payload.get("value_json") is not None else None,
                payload.get("reason"),
            ),
        )
        return cur.fetchone()


def list_model_overrides(*, model_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_model_override
            WHERE model_id = %s AND is_active = true
            ORDER BY scope_node_type, key
            """,
            (str(model_id),),
        )
        return cur.fetchall()


def resolve_model_assumptions(
    *,
    model_id: UUID,
    node_path: dict | None = None,
) -> tuple[dict, str]:
    """Resolve effective model assumptions by applying overrides
    in priority order: fund -> investment -> jv -> asset.

    Returns (effective_assumptions_dict, assumptions_hash).
    """
    overrides = list_model_overrides(model_id=model_id)
    effective: dict = {}
    scope_order = ["fund", "investment", "jv", "asset"]

    for scope in scope_order:
        scope_node_id = node_path.get(f"{scope}_id") if node_path else None
        if not scope_node_id:
            continue
        for ov in overrides:
            if (
                ov["scope_node_type"] == scope
                and str(ov["scope_node_id"]) == str(scope_node_id)
            ):
                effective[ov["key"]] = _extract_value(ov)

    return effective, _compute_hash(effective)


# ── Scenario Versions (unchanged) ────────────────────────────────────────────

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
