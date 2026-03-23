from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _canonical_json(data: dict) -> str:
    return json.dumps(data, sort_keys=True, default=str)


def _compute_hash(data: dict) -> str:
    return hashlib.sha256(_canonical_json(data).encode()).hexdigest()


def create_scenario(*, fund_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        is_base = payload.get("scenario_type") == "base"
        cur.execute(
            """
            INSERT INTO re_scenario (
                fund_id, name, description, scenario_type,
                is_base, parent_scenario_id
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (fund_id, name) DO UPDATE
            SET description = EXCLUDED.description,
                scenario_type = EXCLUDED.scenario_type,
                parent_scenario_id = EXCLUDED.parent_scenario_id
            RETURNING *
            """,
            (
                str(fund_id),
                payload["name"],
                payload.get("description"),
                payload.get("scenario_type", "custom"),
                is_base,
                str(payload["parent_scenario_id"]) if payload.get("parent_scenario_id") else None,
            ),
        )
        return cur.fetchone()


def list_scenarios(*, fund_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_scenario
            WHERE fund_id = %s AND status = 'active'
            ORDER BY is_base DESC, created_at DESC
            """,
            (str(fund_id),),
        )
        return cur.fetchall()


def get_scenario(*, scenario_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM re_scenario WHERE scenario_id = %s",
            (str(scenario_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Scenario {scenario_id} not found")
        return row


def create_assumption_set(
    *,
    fund_id: UUID | None = None,
    payload: dict,
) -> dict:
    with get_cursor() as cur:
        # Find next version
        cur.execute(
            """
            SELECT COALESCE(MAX(version), 0) + 1 AS next_version
            FROM re_assumption_set
            WHERE fund_id = %s AND name = %s
            """,
            (str(fund_id) if fund_id else None, payload["name"]),
        )
        next_ver = cur.fetchone()["next_version"]

        cur.execute(
            """
            INSERT INTO re_assumption_set (
                fund_id, name, version, notes, created_by
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                str(fund_id) if fund_id else None,
                payload["name"],
                next_ver,
                payload.get("notes"),
                payload.get("created_by"),
            ),
        )
        return cur.fetchone()


def set_assumption_value(*, assumption_set_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_assumption_value (
                assumption_set_id, scope_type, key, value_type,
                value_decimal, value_int, value_text, value_json, unit
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (assumption_set_id, scope_type, key) DO UPDATE
            SET value_type = EXCLUDED.value_type,
                value_decimal = EXCLUDED.value_decimal,
                value_int = EXCLUDED.value_int,
                value_text = EXCLUDED.value_text,
                value_json = EXCLUDED.value_json,
                unit = EXCLUDED.unit
            RETURNING *
            """,
            (
                str(assumption_set_id),
                payload.get("scope_type", "fund"),
                payload["key"],
                payload.get("value_type", "decimal"),
                payload.get("value_decimal"),
                payload.get("value_int"),
                payload.get("value_text"),
                json.dumps(payload["value_json"]) if payload.get("value_json") is not None else None,
                payload.get("unit"),
            ),
        )
        return cur.fetchone()


def set_override(*, scenario_id: UUID, payload: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_assumption_override (
                scenario_id, scope_node_type, scope_node_id, key,
                value_type, value_decimal, value_int, value_text,
                value_json, reason
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (scenario_id, scope_node_type, scope_node_id, key) DO UPDATE
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
                str(scenario_id),
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


def list_overrides(*, scenario_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM re_assumption_override
            WHERE scenario_id = %s AND is_active = true
            ORDER BY scope_node_type, key
            """,
            (str(scenario_id),),
        )
        return cur.fetchall()


def resolve_assumptions(
    *,
    scenario_id: UUID,
    node_path: dict | None = None,
) -> tuple[dict, str]:
    """
    Resolve effective assumptions for a scenario, applying overrides
    in priority order: fund → investment → jv → asset.

    Returns (effective_assumptions_dict, assumptions_hash).
    """
    scenario = get_scenario(scenario_id=scenario_id)

    # Load base assumption set
    base_assumptions: dict = {}
    if scenario.get("base_assumption_set_id"):
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT key, value_type, value_decimal, value_int, value_text, value_json
                FROM re_assumption_value
                WHERE assumption_set_id = %s
                ORDER BY key
                """,
                (str(scenario["base_assumption_set_id"]),),
            )
            for row in cur.fetchall():
                val = _extract_value(row)
                base_assumptions[row["key"]] = val

    # Resolve parent chain
    if scenario.get("parent_scenario_id"):
        parent_assumptions, _ = resolve_assumptions(
            scenario_id=UUID(str(scenario["parent_scenario_id"])),
            node_path=node_path,
        )
        parent_assumptions.update(base_assumptions)
        base_assumptions = parent_assumptions

    # Apply overrides in scope order
    overrides = list_overrides(scenario_id=scenario_id)
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
                base_assumptions[ov["key"]] = _extract_value(ov)

    assumptions_hash = _compute_hash(base_assumptions)
    return base_assumptions, assumptions_hash


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
    return row.get("value_decimal") or row.get("value_int") or row.get("value_text") or row.get("value_json")
