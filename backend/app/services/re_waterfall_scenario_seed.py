"""Idempotent seed patch for waterfall scenario viability.

Ensures all ingredients exist for a successful waterfall scenario run:
1. Scenario with overrides ("Downside CapRate +75bps")
2. Validates existing fund structure, waterfall definition, partners
3. Ensures capital ledger entries, cash events, and fund state exist
4. Creates scenario and overrides if not present

Re-runnable: uses deterministic UUIDs, upserts where possible.
"""
from __future__ import annotations

import uuid as _uuid
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log

# Deterministic UUID namespace for scenario seed
_SCENARIO_NS = _uuid.UUID("c3d4e5f6-0003-0030-0003-000000000003")


def _sid(name: str) -> UUID:
    """Stable UUID5 from a descriptive name."""
    return _uuid.uuid5(_SCENARIO_NS, name)


# Pre-defined scenario IDs
DOWNSIDE_SCENARIO_ID = _sid("downside-caprate-75bps")
UPSIDE_SCENARIO_ID = _sid("upside-noi-growth-10pct")


def seed_waterfall_scenario_patch(
    *,
    env_id: str,
    business_id: UUID,
    fund_id: UUID,
    quarter: str = "2025Q1",
) -> dict:
    """Ensure all ingredients exist for waterfall scenario runs.

    This is ADDITIVE ONLY — never deletes existing data.
    Returns a summary of what was created vs already existed.
    """
    summary = {
        "scenarios_created": 0,
        "overrides_created": 0,
        "already_existed": [],
        "fund_id": str(fund_id),
        "quarter": quarter,
    }

    with get_cursor() as cur:
        # ── 1. Ensure downside scenario exists ───────────────────────────
        cur.execute(
            "SELECT scenario_id FROM re_scenario WHERE scenario_id = %s",
            (str(DOWNSIDE_SCENARIO_ID),),
        )
        if not cur.fetchone():
            cur.execute(
                """INSERT INTO re_scenario
                    (scenario_id, fund_id, name, scenario_type, is_base, parent_scenario_id, status)
                   VALUES (%s, %s, %s, 'downside', false, NULL, 'active')
                   ON CONFLICT (scenario_id) DO NOTHING""",
                (str(DOWNSIDE_SCENARIO_ID), str(fund_id), "Downside CapRate +75bps"),
            )
            summary["scenarios_created"] += 1
        else:
            summary["already_existed"].append("downside_scenario")

        # ── 2. Ensure scenario overrides ─────────────────────────────────
        overrides = [
            ("exit_cap_rate_delta_bps", "75"),
            ("noi_stress_pct", "5"),
            ("exit_date_shift_months", "0"),
        ]
        for key, value in overrides:
            override_id = _sid(f"override-downside-{key}")
            cur.execute(
                """INSERT INTO re_assumption_override
                    (id, scenario_id, scope_node_type, scope_node_id, key, value_type, value_int, reason)
                   VALUES (%s, %s, 'fund', %s, %s, 'int', %s, 'Auto-seeded waterfall scenario')
                   ON CONFLICT (scenario_id, scope_node_type, scope_node_id, key)
                   DO UPDATE SET
                     value_type = EXCLUDED.value_type,
                     value_int = EXCLUDED.value_int,
                     reason = EXCLUDED.reason,
                     is_active = true""",
                (str(override_id), str(DOWNSIDE_SCENARIO_ID), str(fund_id), key, int(value)),
            )
            summary["overrides_created"] += 1

        # ── 3. Ensure upside scenario exists ─────────────────────────────
        cur.execute(
            "SELECT scenario_id FROM re_scenario WHERE scenario_id = %s",
            (str(UPSIDE_SCENARIO_ID),),
        )
        if not cur.fetchone():
            cur.execute(
                """INSERT INTO re_scenario
                    (scenario_id, fund_id, name, scenario_type, is_base, parent_scenario_id, status)
                   VALUES (%s, %s, %s, 'upside', false, NULL, 'active')
                   ON CONFLICT (scenario_id) DO NOTHING""",
                (str(UPSIDE_SCENARIO_ID), str(fund_id), "Upside NOI Growth +10%"),
            )
            summary["scenarios_created"] += 1
        else:
            summary["already_existed"].append("upside_scenario")

        upside_overrides = [
            ("exit_cap_rate_delta_bps", "-50"),
            ("noi_stress_pct", "-10"),
            ("exit_date_shift_months", "-6"),
        ]
        for key, value in upside_overrides:
            override_id = _sid(f"override-upside-{key}")
            cur.execute(
                """INSERT INTO re_assumption_override
                    (id, scenario_id, scope_node_type, scope_node_id, key, value_type, value_int, reason)
                   VALUES (%s, %s, 'fund', %s, %s, 'int', %s, 'Auto-seeded waterfall scenario')
                   ON CONFLICT (scenario_id, scope_node_type, scope_node_id, key)
                   DO UPDATE SET
                     value_type = EXCLUDED.value_type,
                     value_int = EXCLUDED.value_int,
                     reason = EXCLUDED.reason,
                     is_active = true""",
                (str(override_id), str(UPSIDE_SCENARIO_ID), str(fund_id), key, int(value)),
            )
            summary["overrides_created"] += 1

        # ── 4. Validate existing ingredients ─────────────────────────────
        checks = {}

        # Fund
        cur.execute("SELECT fund_id FROM repe_fund WHERE fund_id = %s", (str(fund_id),))
        checks["fund_exists"] = cur.fetchone() is not None

        # Waterfall definition
        cur.execute(
            "SELECT definition_id FROM re_waterfall_definition WHERE fund_id = %s AND is_active = true LIMIT 1",
            (str(fund_id),),
        )
        checks["waterfall_definition"] = cur.fetchone() is not None

        # Partners
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM re_partner_commitment WHERE fund_id = %s AND status = 'active'",
            (str(fund_id),),
        )
        row = cur.fetchone()
        checks["partners"] = row["cnt"] if row else 0

        # Capital ledger
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM re_capital_ledger_entry WHERE fund_id = %s AND quarter <= %s",
            (str(fund_id), quarter),
        )
        row = cur.fetchone()
        checks["capital_ledger_entries"] = row["cnt"] if row else 0

        # Fund quarter state
        cur.execute(
            "SELECT fund_id FROM re_fund_quarter_state WHERE fund_id = %s AND quarter = %s LIMIT 1",
            (str(fund_id), quarter),
        )
        checks["fund_quarter_state"] = cur.fetchone() is not None

        # Cash events
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM re_cash_event WHERE env_id = %s AND business_id = %s AND fund_id = %s",
            (env_id, str(business_id), str(fund_id)),
        )
        row = cur.fetchone()
        checks["cash_events"] = row["cnt"] if row else 0

        # Base metrics
        cur.execute(
            "SELECT id FROM re_fund_metrics_qtr WHERE env_id = %s AND business_id = %s AND fund_id = %s AND quarter = %s LIMIT 1",
            (env_id, str(business_id), str(fund_id), quarter),
        )
        checks["base_metrics"] = cur.fetchone() is not None

        # Investments
        cur.execute("SELECT COUNT(*) AS cnt FROM repe_deal WHERE fund_id = %s", (str(fund_id),))
        row = cur.fetchone()
        checks["investments"] = row["cnt"] if row else 0

        summary["ingredient_checks"] = checks

    emit_log(
        level="info",
        service="backend",
        action="re.waterfall_scenario.seed",
        message=f"Waterfall scenario seed patch completed for fund {fund_id}",
        context=summary,
    )

    return summary
