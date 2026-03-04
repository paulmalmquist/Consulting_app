"""Cross-fund model scenario CRUD: scenarios, asset scope, and overrides.

Scenarios are children of re_model. Each scenario defines which assets
are in scope (plucked from any fund) and what assumption overrides apply.
"""

from __future__ import annotations

import json
from uuid import UUID

from app.db import get_cursor


# ── Scenario CRUD ────────────────────────────────────────────────────────────

_SCENARIO_COLS = "id, model_id, name, description, is_base, created_at, updated_at"


def list_scenarios(*, model_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_SCENARIO_COLS} FROM re_model_scenarios WHERE model_id = %s ORDER BY is_base DESC, created_at",
            (str(model_id),),
        )
        return cur.fetchall()


def create_scenario(
    *,
    model_id: UUID,
    name: str,
    description: str | None = None,
    is_base: bool = False,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO re_model_scenarios (model_id, name, description, is_base)
            VALUES (%s, %s, %s, %s)
            RETURNING {_SCENARIO_COLS}
            """,
            (str(model_id), name, description, is_base),
        )
        return cur.fetchone()


def get_scenario(*, scenario_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_SCENARIO_COLS} FROM re_model_scenarios WHERE id = %s",
            (str(scenario_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Scenario {scenario_id} not found")
        return row


def clone_scenario(*, scenario_id: UUID, new_name: str) -> dict:
    """Deep copy a scenario: metadata, scope assets, and overrides."""
    source = get_scenario(scenario_id=scenario_id)

    with get_cursor() as cur:
        # Create new scenario
        cur.execute(
            f"""
            INSERT INTO re_model_scenarios (model_id, name, description, is_base)
            VALUES (%s, %s, %s, false)
            RETURNING {_SCENARIO_COLS}
            """,
            (str(source["model_id"]), new_name, source.get("description")),
        )
        new_scenario = cur.fetchone()
        new_id = str(new_scenario["id"])

        # Copy scope assets
        cur.execute(
            """
            INSERT INTO re_model_scenario_assets (scenario_id, asset_id, source_fund_id, source_investment_id)
            SELECT %s, asset_id, source_fund_id, source_investment_id
            FROM re_model_scenario_assets
            WHERE scenario_id = %s
            """,
            (new_id, str(scenario_id)),
        )

        # Copy overrides
        cur.execute(
            """
            INSERT INTO re_scenario_overrides (scenario_id, scope_type, scope_id, key, value_json)
            SELECT %s, scope_type, scope_id, key, value_json
            FROM re_scenario_overrides
            WHERE scenario_id = %s
            """,
            (new_id, str(scenario_id)),
        )

        return new_scenario


def delete_scenario(*, scenario_id: UUID) -> None:
    """Delete a scenario. Cannot delete base scenarios."""
    scenario = get_scenario(scenario_id=scenario_id)
    if scenario.get("is_base"):
        raise ValueError("Cannot delete the base scenario")
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM re_model_scenarios WHERE id = %s",
            (str(scenario_id),),
        )


# ── Scenario Asset Scope ────────────────────────────────────────────────────

_ASSET_COLS = """sa.id, sa.scenario_id, sa.asset_id, sa.source_fund_id,
    sa.source_investment_id, sa.added_at,
    a.asset_name, a.asset_type,
    f.name AS fund_name"""


def list_scenario_assets(*, scenario_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT {_ASSET_COLS}
            FROM re_model_scenario_assets sa
            JOIN repe_asset a ON a.asset_id = sa.asset_id
            LEFT JOIN repe_fund f ON f.fund_id = sa.source_fund_id
            WHERE sa.scenario_id = %s
            ORDER BY a.asset_name
            """,
            (str(scenario_id),),
        )
        return cur.fetchall()


def add_scenario_asset(
    *,
    scenario_id: UUID,
    asset_id: UUID,
    source_fund_id: UUID | None = None,
    source_investment_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_model_scenario_assets (scenario_id, asset_id, source_fund_id, source_investment_id)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (scenario_id, asset_id) DO NOTHING
            RETURNING id, scenario_id, asset_id, source_fund_id, source_investment_id, added_at
            """,
            (
                str(scenario_id),
                str(asset_id),
                str(source_fund_id) if source_fund_id else None,
                str(source_investment_id) if source_investment_id else None,
            ),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Asset {asset_id} already in scenario")
        return row


def remove_scenario_asset(*, scenario_id: UUID, asset_id: UUID) -> None:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM re_model_scenario_assets WHERE scenario_id = %s AND asset_id = %s",
            (str(scenario_id), str(asset_id)),
        )


def list_available_assets(
    *,
    env_id: UUID | None = None,
    scenario_id: UUID | None = None,
) -> list[dict]:
    """List assets NOT already in the scenario, with fund/sector info."""
    with get_cursor() as cur:
        exclude_clause = ""
        params: list = []

        if scenario_id:
            exclude_clause = """
                AND a.asset_id NOT IN (
                    SELECT asset_id FROM re_model_scenario_assets WHERE scenario_id = %s
                )
            """
            params.append(str(scenario_id))

        cur.execute(
            f"""
            SELECT a.asset_id, a.asset_name, a.asset_type,
                   d.fund_id AS source_fund_id,
                   d.deal_id AS source_investment_id,
                   f.name AS fund_name
            FROM repe_asset a
            LEFT JOIN repe_deal d ON d.deal_id = a.deal_id
            LEFT JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE 1=1 {exclude_clause}
            ORDER BY f.name, a.asset_name
            """,
            params,
        )
        return cur.fetchall()


# ── Scenario Overrides ──────────────────────────────────────────────────────

_OVERRIDE_COLS = "id, scenario_id, scope_type, scope_id, key, value_json, created_at, updated_at"


def list_scenario_overrides(*, scenario_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_OVERRIDE_COLS} FROM re_scenario_overrides WHERE scenario_id = %s ORDER BY scope_type, key",
            (str(scenario_id),),
        )
        return cur.fetchall()


def set_scenario_override(
    *,
    scenario_id: UUID,
    scope_type: str,
    scope_id: UUID,
    key: str,
    value_json: dict | float | int | str,
) -> dict:
    val = json.dumps(value_json) if not isinstance(value_json, str) else json.dumps(value_json)
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO re_scenario_overrides (scenario_id, scope_type, scope_id, key, value_json)
            VALUES (%s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (scenario_id, scope_type, scope_id, key)
            DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
            RETURNING {_OVERRIDE_COLS}
            """,
            (str(scenario_id), scope_type, str(scope_id), key, val),
        )
        return cur.fetchone()


def delete_scenario_override(*, override_id: UUID) -> None:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM re_scenario_overrides WHERE id = %s",
            (str(override_id),),
        )


def reset_asset_overrides(*, scenario_id: UUID, asset_id: UUID) -> None:
    """Remove all overrides for a specific asset in a scenario."""
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM re_scenario_overrides WHERE scenario_id = %s AND scope_type = 'asset' AND scope_id = %s",
            (str(scenario_id), str(asset_id)),
        )


def reset_scenario_overrides(*, scenario_id: UUID) -> None:
    """Remove all overrides for a scenario."""
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM re_scenario_overrides WHERE scenario_id = %s",
            (str(scenario_id),),
        )
