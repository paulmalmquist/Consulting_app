"""Seed service for Development ↔ REPE Asset Bridge.

Creates PDS analytics projects, bridge links, assumption sets (base + 2 scenarios),
and monthly draw schedules for the 5 Meridian Capital Management demo assets.
All IDs are deterministic via uuid5 for idempotency.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.dev_asset_bridge import _recalculate_outputs

# Deterministic UUID namespace
_DEV_NS = uuid.UUID("d3e4f5a6-0004-0040-0004-000000000004")

# Meridian asset IDs (from fixtures/winston_demo/meridian_demo_seed.json)
_ASSET_IDS = {
    "aurora":    UUID("9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f301"),
    "cedar":     UUID("9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f302"),
    "northgate": UUID("9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f303"),
    "meridian":  UUID("9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f304"),
    "foundry":   UUID("9b4d7c63-3f7a-4dc8-8c95-7db5c4e1f305"),
}


def _uid(name: str) -> str:
    return str(uuid.uuid5(_DEV_NS, name))


# ── Project definitions ──────────────────────────────────────────

_PROJECTS: list[dict[str, Any]] = [
    {
        "key": "aurora",
        "project_name": "Aurora Phase II Expansion",
        "project_type": "Development Management",
        "market": "Denver, CO",
        "status": "active",
        "total_budget": 18200000,
        "percent_complete": 62,
        "start_date": "2025-06-01",
        "planned_end_date": "2027-03-31",
        "link_type": "value_add",
        "service_line_key": "development_management",
    },
    {
        "key": "cedar",
        "project_name": "Cedar Grove Memory Care Wing",
        "project_type": "Construction Management",
        "market": "Phoenix, AZ",
        "status": "active",
        "total_budget": 14500000,
        "percent_complete": 15,
        "start_date": "2025-11-01",
        "planned_end_date": "2027-08-31",
        "link_type": "major_renovation",
        "service_line_key": "construction_management",
    },
    {
        "key": "northgate",
        "project_name": "Northgate Commons Phase III",
        "project_type": "Development Management",
        "market": "Austin, TX",
        "status": "active",
        "total_budget": 22800000,
        "percent_complete": 38,
        "start_date": "2025-04-01",
        "planned_end_date": "2027-06-30",
        "link_type": "ground_up",
        "service_line_key": "development_management",
    },
    {
        "key": "meridian",
        "project_name": "Meridian Medical Pavilion MOB Build-Out",
        "project_type": "Project Management",
        "market": "Nashville, TN",
        "status": "active",
        "total_budget": 12100000,
        "percent_complete": 94,
        "start_date": "2024-09-01",
        "planned_end_date": "2026-04-30",
        "link_type": "repositioning",
        "service_line_key": "project_management",
    },
    {
        "key": "foundry",
        "project_name": "Foundry Logistics Distribution Annex",
        "project_type": "Development Management",
        "market": "Columbus, OH",
        "status": "active",
        "total_budget": 31500000,
        "percent_complete": 5,
        "start_date": "2026-03-01",
        "planned_end_date": "2028-06-30",
        "link_type": "ground_up",
        "service_line_key": "development_management",
    },
]

# ── Assumption definitions ───────────────────────────────────────
# Each project gets 3 scenarios: base, cost_overrun, strong_lease_up

_ASSUMPTIONS: dict[str, dict[str, dict[str, Any]]] = {
    "aurora": {
        "base": {
            "hard_cost": 12700000, "soft_cost": 3200000, "contingency": 1300000,
            "financing_cost": 1000000, "total_development_cost": 18200000,
            "construction_start": "2025-06-01", "construction_end": "2026-09-30",
            "lease_up_start": "2026-10-01", "lease_up_months": 6,
            "stabilization_date": "2027-03-31",
            "stabilized_occupancy": 0.9400, "stabilized_noi": 1420000,
            "exit_cap_rate": 0.0500,
            "construction_loan_amt": 13000000, "construction_loan_rate": 0.0725,
            "perm_loan_amt": 18500000, "perm_loan_rate": 0.0550,
        },
        "cost_overrun": {
            "hard_cost": 14605000, "soft_cost": 3200000, "contingency": 1800000,
            "financing_cost": 1200000, "total_development_cost": 20805000,
            "construction_start": "2025-06-01", "construction_end": "2026-12-31",
            "lease_up_start": "2027-01-01", "lease_up_months": 6,
            "stabilization_date": "2027-06-30",
            "stabilized_occupancy": 0.9400, "stabilized_noi": 1420000,
            "exit_cap_rate": 0.0500,
            "construction_loan_amt": 14900000, "construction_loan_rate": 0.0725,
            "perm_loan_amt": 18500000, "perm_loan_rate": 0.0550,
        },
        "strong_lease_up": {
            "hard_cost": 12700000, "soft_cost": 3200000, "contingency": 1300000,
            "financing_cost": 1000000, "total_development_cost": 18200000,
            "construction_start": "2025-06-01", "construction_end": "2026-09-30",
            "lease_up_start": "2026-10-01", "lease_up_months": 4,
            "stabilization_date": "2027-01-31",
            "stabilized_occupancy": 0.9700, "stabilized_noi": 1491000,
            "exit_cap_rate": 0.0500,
            "construction_loan_amt": 13000000, "construction_loan_rate": 0.0725,
            "perm_loan_amt": 18500000, "perm_loan_rate": 0.0550,
        },
    },
    "cedar": {
        "base": {
            "hard_cost": 9800000, "soft_cost": 2500000, "contingency": 1200000,
            "financing_cost": 1000000, "total_development_cost": 14500000,
            "construction_start": "2025-11-01", "construction_end": "2027-02-28",
            "lease_up_start": "2027-03-01", "lease_up_months": 8,
            "stabilization_date": "2027-10-31",
            "stabilized_occupancy": 0.9200, "stabilized_noi": 1150000,
            "exit_cap_rate": 0.0575,
            "construction_loan_amt": 10900000, "construction_loan_rate": 0.0700,
            "perm_loan_amt": 13000000, "perm_loan_rate": 0.0575,
        },
        "cost_overrun": {
            "hard_cost": 11270000, "soft_cost": 2500000, "contingency": 1700000,
            "financing_cost": 1200000, "total_development_cost": 16670000,
            "construction_start": "2025-11-01", "construction_end": "2027-05-31",
            "lease_up_start": "2027-06-01", "lease_up_months": 8,
            "stabilization_date": "2028-01-31",
            "stabilized_occupancy": 0.9200, "stabilized_noi": 1150000,
            "exit_cap_rate": 0.0575,
            "construction_loan_amt": 12500000, "construction_loan_rate": 0.0700,
            "perm_loan_amt": 13000000, "perm_loan_rate": 0.0575,
        },
        "strong_lease_up": {
            "hard_cost": 9800000, "soft_cost": 2500000, "contingency": 1200000,
            "financing_cost": 1000000, "total_development_cost": 14500000,
            "construction_start": "2025-11-01", "construction_end": "2027-02-28",
            "lease_up_start": "2027-03-01", "lease_up_months": 6,
            "stabilization_date": "2027-08-31",
            "stabilized_occupancy": 0.9500, "stabilized_noi": 1207500,
            "exit_cap_rate": 0.0575,
            "construction_loan_amt": 10900000, "construction_loan_rate": 0.0700,
            "perm_loan_amt": 13000000, "perm_loan_rate": 0.0575,
        },
    },
    "northgate": {
        "base": {
            "hard_cost": 16200000, "soft_cost": 3800000, "contingency": 1600000,
            "financing_cost": 1200000, "total_development_cost": 22800000,
            "construction_start": "2025-04-01", "construction_end": "2026-12-31",
            "lease_up_start": "2027-01-01", "lease_up_months": 5,
            "stabilization_date": "2027-05-31",
            "stabilized_occupancy": 0.9600, "stabilized_noi": 1780000,
            "exit_cap_rate": 0.0475,
            "construction_loan_amt": 17100000, "construction_loan_rate": 0.0750,
            "perm_loan_amt": 24500000, "perm_loan_rate": 0.0525,
        },
        "cost_overrun": {
            "hard_cost": 18630000, "soft_cost": 3800000, "contingency": 2100000,
            "financing_cost": 1500000, "total_development_cost": 26030000,
            "construction_start": "2025-04-01", "construction_end": "2027-03-31",
            "lease_up_start": "2027-04-01", "lease_up_months": 5,
            "stabilization_date": "2027-08-31",
            "stabilized_occupancy": 0.9600, "stabilized_noi": 1780000,
            "exit_cap_rate": 0.0475,
            "construction_loan_amt": 19500000, "construction_loan_rate": 0.0750,
            "perm_loan_amt": 24500000, "perm_loan_rate": 0.0525,
        },
        "strong_lease_up": {
            "hard_cost": 16200000, "soft_cost": 3800000, "contingency": 1600000,
            "financing_cost": 1200000, "total_development_cost": 22800000,
            "construction_start": "2025-04-01", "construction_end": "2026-12-31",
            "lease_up_start": "2027-01-01", "lease_up_months": 3,
            "stabilization_date": "2027-03-31",
            "stabilized_occupancy": 0.9900, "stabilized_noi": 1869000,
            "exit_cap_rate": 0.0475,
            "construction_loan_amt": 17100000, "construction_loan_rate": 0.0750,
            "perm_loan_amt": 24500000, "perm_loan_rate": 0.0525,
        },
    },
    "meridian": {
        "base": {
            "hard_cost": 7800000, "soft_cost": 2200000, "contingency": 900000,
            "financing_cost": 1200000, "total_development_cost": 12100000,
            "construction_start": "2024-09-01", "construction_end": "2025-12-31",
            "lease_up_start": "2026-01-01", "lease_up_months": 4,
            "stabilization_date": "2026-04-30",
            "stabilized_occupancy": 0.9500, "stabilized_noi": 1620000,
            "exit_cap_rate": 0.0550,
            "construction_loan_amt": 8500000, "construction_loan_rate": 0.0675,
            "perm_loan_amt": 19200000, "perm_loan_rate": 0.0525,
        },
        "cost_overrun": {
            "hard_cost": 8970000, "soft_cost": 2200000, "contingency": 1400000,
            "financing_cost": 1400000, "total_development_cost": 13970000,
            "construction_start": "2024-09-01", "construction_end": "2026-03-31",
            "lease_up_start": "2026-04-01", "lease_up_months": 4,
            "stabilization_date": "2026-07-31",
            "stabilized_occupancy": 0.9500, "stabilized_noi": 1620000,
            "exit_cap_rate": 0.0550,
            "construction_loan_amt": 9800000, "construction_loan_rate": 0.0675,
            "perm_loan_amt": 19200000, "perm_loan_rate": 0.0525,
        },
        "strong_lease_up": {
            "hard_cost": 7800000, "soft_cost": 2200000, "contingency": 900000,
            "financing_cost": 1200000, "total_development_cost": 12100000,
            "construction_start": "2024-09-01", "construction_end": "2025-12-31",
            "lease_up_start": "2026-01-01", "lease_up_months": 2,
            "stabilization_date": "2026-02-28",
            "stabilized_occupancy": 0.9800, "stabilized_noi": 1701000,
            "exit_cap_rate": 0.0550,
            "construction_loan_amt": 8500000, "construction_loan_rate": 0.0675,
            "perm_loan_amt": 19200000, "perm_loan_rate": 0.0525,
        },
    },
    "foundry": {
        "base": {
            "hard_cost": 22500000, "soft_cost": 5000000, "contingency": 2200000,
            "financing_cost": 1800000, "total_development_cost": 31500000,
            "construction_start": "2026-03-01", "construction_end": "2027-09-30",
            "lease_up_start": "2027-10-01", "lease_up_months": 3,
            "stabilization_date": "2027-12-31",
            "stabilized_occupancy": 0.9800, "stabilized_noi": 2050000,
            "exit_cap_rate": 0.0525,
            "construction_loan_amt": 24500000, "construction_loan_rate": 0.0775,
            "perm_loan_amt": 25400000, "perm_loan_rate": 0.0560,
        },
        "cost_overrun": {
            "hard_cost": 25875000, "soft_cost": 5000000, "contingency": 2700000,
            "financing_cost": 2100000, "total_development_cost": 35675000,
            "construction_start": "2026-03-01", "construction_end": "2027-12-31",
            "lease_up_start": "2028-01-01", "lease_up_months": 3,
            "stabilization_date": "2028-03-31",
            "stabilized_occupancy": 0.9800, "stabilized_noi": 2050000,
            "exit_cap_rate": 0.0525,
            "construction_loan_amt": 28000000, "construction_loan_rate": 0.0775,
            "perm_loan_amt": 25400000, "perm_loan_rate": 0.0560,
        },
        "strong_lease_up": {
            "hard_cost": 22500000, "soft_cost": 5000000, "contingency": 2200000,
            "financing_cost": 1800000, "total_development_cost": 31500000,
            "construction_start": "2026-03-01", "construction_end": "2027-09-30",
            "lease_up_start": "2027-10-01", "lease_up_months": 1,
            "stabilization_date": "2027-10-31",
            "stabilized_occupancy": 1.0000, "stabilized_noi": 2152500,
            "exit_cap_rate": 0.0525,
            "construction_loan_amt": 24500000, "construction_loan_rate": 0.0775,
            "perm_loan_amt": 25400000, "perm_loan_rate": 0.0560,
        },
    },
}


def _generate_draw_schedule(
    assumption_set_id: str,
    construction_loan_amt: float,
    construction_start: str,
    construction_end: str,
) -> list[dict[str, Any]]:
    """Generate monthly draws with bell-curve distribution."""
    start = date.fromisoformat(construction_start)
    end = date.fromisoformat(construction_end)

    months: list[date] = []
    current = start.replace(day=1)
    while current <= end:
        months.append(current)
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

    n = len(months)
    if n == 0:
        return []

    # Bell curve weights (higher in the middle)
    import math
    weights = []
    for i in range(n):
        x = (i - n / 2) / (n / 4) if n > 1 else 0
        weights.append(math.exp(-0.5 * x * x))
    total_weight = sum(weights)
    normalized = [w / total_weight for w in weights]

    draws = []
    cumulative = Decimal("0")
    loan = Decimal(str(construction_loan_amt))

    for i, m in enumerate(months):
        amount = (loan * Decimal(str(normalized[i]))).quantize(Decimal("0.01"))
        cumulative += amount
        draw_id = _uid(f"draw-{assumption_set_id}-{m.isoformat()}")
        draws.append({
            "draw_id": draw_id,
            "assumption_set_id": assumption_set_id,
            "draw_date": m.isoformat(),
            "draw_amount": str(amount),
            "cumulative_drawn": str(cumulative),
            "draw_type": "scheduled",
        })

    return draws


def seed_dev_bridge(*, env_id: UUID, business_id: UUID) -> dict[str, Any]:
    """Seed development bridge data for Meridian demo. Idempotent."""
    counts = {"pds_projects": 0, "links": 0, "assumptions": 0, "draws": 0}

    with get_cursor() as cur:
        for proj in _PROJECTS:
            key = proj["key"]
            asset_id = _ASSET_IDS[key]
            project_id = _uid(f"pds-project-{key}")
            link_id = _uid(f"link-{key}")

            # 1. Upsert pds_analytics_projects row
            cur.execute(
                """
                INSERT INTO pds_analytics_projects (
                    project_id, env_id, business_id,
                    project_name, project_type, service_line_key,
                    market, status, total_budget,
                    percent_complete, start_date, planned_end_date
                ) VALUES (
                    %s::uuid, %s::uuid, %s::uuid,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s
                )
                ON CONFLICT (project_id) DO NOTHING
                """,
                (
                    project_id, str(env_id), str(business_id),
                    proj["project_name"], proj["project_type"], proj["service_line_key"],
                    proj["market"], proj["status"], proj["total_budget"],
                    proj["percent_complete"], proj["start_date"], proj["planned_end_date"],
                ),
            )
            counts["pds_projects"] += cur.rowcount

            # 2. Create dev_project_asset_link
            cur.execute(
                """
                INSERT INTO dev_project_asset_link (
                    link_id, env_id, business_id,
                    pds_project_id, repe_asset_id,
                    link_type, status
                ) VALUES (
                    %s::uuid, %s::uuid, %s::uuid,
                    %s::uuid, %s::uuid,
                    %s, 'active'
                )
                ON CONFLICT (env_id, pds_project_id, repe_asset_id) DO NOTHING
                """,
                (
                    link_id, str(env_id), str(business_id),
                    project_id, str(asset_id),
                    proj["link_type"],
                ),
            )
            counts["links"] += cur.rowcount

            # 3. Create assumption sets (3 per project)
            for scenario_label, assumptions in _ASSUMPTIONS[key].items():
                is_base = scenario_label == "base"
                assumption_set_id = _uid(f"assumption-{key}-{scenario_label}")

                cur.execute(
                    """
                    INSERT INTO dev_assumption_set (
                        assumption_set_id, link_id, scenario_label,
                        hard_cost, soft_cost, contingency, financing_cost, total_development_cost,
                        construction_start, construction_end, lease_up_start, lease_up_months, stabilization_date,
                        stabilized_occupancy, stabilized_noi, exit_cap_rate,
                        construction_loan_amt, construction_loan_rate, perm_loan_amt, perm_loan_rate,
                        is_base
                    ) VALUES (
                        %s::uuid, %s::uuid, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s,
                        %s
                    )
                    ON CONFLICT (link_id, scenario_label) DO NOTHING
                    """,
                    (
                        assumption_set_id, link_id, scenario_label,
                        assumptions["hard_cost"], assumptions["soft_cost"],
                        assumptions["contingency"], assumptions["financing_cost"],
                        assumptions["total_development_cost"],
                        assumptions["construction_start"], assumptions["construction_end"],
                        assumptions["lease_up_start"], assumptions["lease_up_months"],
                        assumptions["stabilization_date"],
                        assumptions["stabilized_occupancy"], assumptions["stabilized_noi"],
                        assumptions["exit_cap_rate"],
                        assumptions["construction_loan_amt"], assumptions["construction_loan_rate"],
                        assumptions["perm_loan_amt"], assumptions["perm_loan_rate"],
                        is_base,
                    ),
                )
                counts["assumptions"] += cur.rowcount

                # Recalculate derived fields
                _recalculate_outputs(cur, UUID(assumption_set_id))

                # 4. Generate draw schedule for base scenarios only
                if is_base:
                    draws = _generate_draw_schedule(
                        assumption_set_id=assumption_set_id,
                        construction_loan_amt=assumptions["construction_loan_amt"],
                        construction_start=assumptions["construction_start"],
                        construction_end=assumptions["construction_end"],
                    )
                    for draw in draws:
                        cur.execute(
                            """
                            INSERT INTO dev_draw_schedule (
                                draw_id, assumption_set_id, draw_date,
                                draw_amount, cumulative_drawn, draw_type
                            ) VALUES (
                                %s::uuid, %s::uuid, %s,
                                %s, %s, %s
                            )
                            ON CONFLICT (draw_id) DO NOTHING
                            """,
                            (
                                draw["draw_id"], draw["assumption_set_id"],
                                draw["draw_date"], draw["draw_amount"],
                                draw["cumulative_drawn"], draw["draw_type"],
                            ),
                        )
                        counts["draws"] += cur.rowcount

    emit_log(
        level="info", service="backend", action="dev_bridge.seed",
        message=f"Dev bridge seed complete: {counts}",
        context={"env_id": str(env_id), "counts": counts},
    )
    return {"status": "ok", "counts": counts}
