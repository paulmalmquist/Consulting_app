"""PDS Business Line + Leader Coverage seed.

Seeds the 412-416 series tables:
  - pds_business_lines  (9 JLL service lines)
  - pds_leader_coverage (many-to-many bridge)
  - business_line_id backfill on resources, employees, projects, facts, pipeline, assignments

Idempotent: skips if pds_business_lines already populated for this env/business.

Usage:
    from app.services.pds_business_line_seed import seed_business_lines
    result = seed_business_lines(env_id=..., business_id=...)
"""

from __future__ import annotations

import logging
import random
import uuid
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)

# ─── Constants ───────────────────────────────────────────────────────

BUSINESS_LINES: list[tuple[str, str, str, int]] = [
    # (line_code, line_name, line_category, sort_order)
    ("PM", "Project Management", "delivery", 1),
    ("DM", "Development Management", "delivery", 2),
    ("CM", "Construction Management", "delivery", 3),
    ("COST", "Cost Management", "advisory", 4),
    ("DESIGN", "Design", "specialty", 5),
    ("MSP", "Multi-site Program", "delivery", 6),
    ("LOC", "Location Strategy", "advisory", 7),
    ("LDA", "Large Development Advisory", "advisory", 8),
    ("TETRIS", "Tetris", "specialty", 9),
]

# Weights for assigning employees/projects to business lines
BL_WEIGHTS = [0.30, 0.12, 0.15, 0.10, 0.05, 0.10, 0.06, 0.07, 0.05]

# Map from project_type / service_line_key text → line_code
PROJECT_TYPE_TO_BL: dict[str, str] = {
    "project management": "PM",
    "project_management": "PM",
    "development management": "DM",
    "development_management": "DM",
    "construction management": "CM",
    "construction_management": "CM",
    "cost management": "COST",
    "cost_management": "COST",
    "design": "DESIGN",
    "multi-site program": "MSP",
    "multi-site_program": "MSP",
    "location strategy": "LOC",
    "location_strategy": "LOC",
    "large development advisory": "LDA",
    "large_development_adv": "LDA",
    "large_development_advisory": "LDA",
    "tétris": "TETRIS",
    "tetris": "TETRIS",
}

# Leader seed data: (resource_code, name, title, role_preset, coverage assignments)
# Coverage: list of (market_code, line_code, coverage_role)
LEADER_SEEDS: list[dict[str, Any]] = [
    {
        "code": "LDR-001", "name": "Avery Cole", "title": "Market Leader",
        "role_preset": "market_leader",
        "coverage": [("SFL", "PM", "leader"), ("SFL", "CM", "leader")],
    },
    {
        "code": "LDR-002", "name": "Jordan Hale", "title": "Business Line Leader",
        "role_preset": "market_leader",
        "coverage": [("MAPS", "PM", "leader"), ("MAPS", "DM", "leader"), ("MAPS", "COST", "leader")],
    },
    {
        "code": "LDR-003", "name": "Sam Rivera", "title": "Market Leader",
        "role_preset": "market_leader",
        "coverage": [("NEH", "CM", "leader"), ("NEH", "DESIGN", "leader")],
    },
    {
        "code": "LDR-004", "name": "Dana Park", "title": "Regional Director",
        "role_preset": "executive",
        "coverage": [("NEH", "PM", "leader"), ("SFL", "DM", "deputy")],
    },
    {
        "code": "LDR-005", "name": "Morgan Ruiz", "title": "Regional Director",
        "role_preset": "executive",
        "coverage": [("SFL", "MSP", "leader"), ("MAPS", "MSP", "leader")],
    },
    {
        "code": "LDR-006", "name": "Taylor Chen", "title": "Business Line Leader",
        "role_preset": "market_leader",
        "coverage": [("SFL", "COST", "leader"), ("NEH", "COST", "leader"), ("MAPS", "CM", "leader")],
    },
    {
        "code": "LDR-007", "name": "Casey Williams", "title": "Service Line Director",
        "role_preset": "market_leader",
        "coverage": [("SFL", "LOC", "leader"), ("MAPS", "LOC", "leader"), ("NEH", "LOC", "leader")],
    },
    {
        "code": "LDR-008", "name": "Riley Thompson", "title": "Design Director",
        "role_preset": "account_director",
        "coverage": [("SFL", "DESIGN", "leader"), ("MAPS", "DESIGN", "leader")],
    },
    {
        "code": "LDR-009", "name": "Alex Martinez", "title": "Advisory Leader",
        "role_preset": "market_leader",
        "coverage": [("SFL", "LDA", "leader"), ("NEH", "LDA", "leader"), ("MAPS", "LDA", "leader")],
    },
    {
        "code": "LDR-010", "name": "Jamie Nguyen", "title": "Tetris Lead",
        "role_preset": "account_director",
        "coverage": [("SFL", "TETRIS", "leader"), ("NEH", "TETRIS", "leader"), ("MAPS", "TETRIS", "leader")],
    },
    {
        "code": "LDR-011", "name": "Drew Patterson", "title": "Deputy Market Leader",
        "role_preset": "market_leader",
        "coverage": [("NEH", "DM", "leader"), ("NEH", "MSP", "deputy")],
    },
    {
        "code": "LDR-012", "name": "Quinn Foster", "title": "PM Practice Lead",
        "role_preset": "market_leader",
        "coverage": [("SFL", "PM", "deputy"), ("NEH", "PM", "deputy")],
    },
]


def _uid() -> str:
    return str(uuid.uuid4())


# ─── Main seeder ──────────────────────────────────────────────────────

def seed_business_lines(
    *,
    env_id: UUID,
    business_id: UUID,
) -> dict[str, Any]:
    """Seed business lines, leader coverage, and backfill business_line_id.

    Idempotent: skips if pds_business_lines already populated.
    Returns dict with counts.
    """
    random.seed(42)
    env_str = str(env_id)
    biz_str = str(business_id)

    with get_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM pds_business_lines WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (env_str, biz_str),
        )
        if int((cur.fetchone() or {}).get("cnt") or 0) > 0:
            return {"status": "already_seeded"}

    counts: dict[str, int] = {}

    with get_cursor() as cur:
        # ── 1. Seed business lines ────────────────────────────
        bl_map = _seed_business_lines(cur, env_str, biz_str)
        counts["business_lines"] = len(bl_map)

        # ── 2. Load existing markets ─────────────────────────
        cur.execute(
            "SELECT market_id, market_code FROM pds_markets WHERE env_id = %s::uuid AND business_id = %s::uuid",
            (env_str, biz_str),
        )
        market_map: dict[str, str] = {
            row["market_code"]: str(row["market_id"]) for row in cur.fetchall()
        }

        if not market_map:
            logger.warning("No markets found — skipping leader coverage and backfill")
            return counts

        # ── 3. Seed leaders as resources + coverage ───────────
        leader_resource_map = _seed_leaders(cur, env_str, biz_str, bl_map, market_map)
        counts["leaders"] = len(leader_resource_map)

        # ── 4. Wire leader_resource_id on markets ─────────────
        _wire_market_leaders(cur, env_str, biz_str, market_map, leader_resource_map)

        # ── 5. Wire owner_resource_id on accounts ─────────────
        _wire_account_owners(cur, env_str, biz_str, leader_resource_map)

        # ── 6. Backfill business_line_id on resources ─────────
        counts["resources_updated"] = _backfill_resources(cur, env_str, biz_str, bl_map)

        # ── 7. Backfill business_line_id on projects ──────────
        counts["projects_updated"] = _backfill_projects(cur, env_str, biz_str, bl_map)

        # ── 8. Backfill business_line_id on fact tables ───────
        counts["facts_updated"] = _backfill_facts(cur, env_str, biz_str)

        # ── 9. Backfill business_line_id on pipeline deals ────
        counts["pipeline_updated"] = _backfill_pipeline(cur, env_str, biz_str, bl_map, market_map, leader_resource_map)

        # ── 10. Backfill analytics tables ─────────────────────
        counts["analytics_updated"] = _backfill_analytics(cur, env_str, biz_str, bl_map)

    return counts


# ─── 1. Business lines ────────────────────────────────────────────────

def _seed_business_lines(cur, env_str: str, biz_str: str) -> dict[str, str]:
    """Insert 9 business lines. Returns {line_code: business_line_id}."""
    bl_map: dict[str, str] = {}
    for code, name, category, sort_order in BUSINESS_LINES:
        bl_id = _uid()
        cur.execute(
            """INSERT INTO pds_business_lines
               (business_line_id, env_id, business_id, line_code, line_name, line_category, sort_order, metadata_json)
               VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, '{}')
               ON CONFLICT (env_id, business_id, line_code) DO UPDATE
               SET line_name = EXCLUDED.line_name, line_category = EXCLUDED.line_category, sort_order = EXCLUDED.sort_order
               RETURNING business_line_id
            """,
            (bl_id, env_str, biz_str, code, name, category, sort_order),
        )
        row = cur.fetchone()
        bl_map[code] = str(row["business_line_id"]) if row else bl_id
    return bl_map


# ─── 2-3. Leaders + coverage ──────────────────────────────────────────

def _seed_leaders(
    cur, env_str: str, biz_str: str,
    bl_map: dict[str, str], market_map: dict[str, str],
) -> dict[str, str]:
    """Seed leader resources and coverage rows. Returns {leader_name: resource_id}."""
    leader_resource_map: dict[str, str] = {}
    coverage_count = 0

    for leader in LEADER_SEEDS:
        # Upsert resource
        resource_id = _uid()
        primary_bl_code = leader["coverage"][0][1] if leader["coverage"] else "PM"
        primary_market_code = leader["coverage"][0][0] if leader["coverage"] else None
        home_market_id = market_map.get(primary_market_code) if primary_market_code else None

        cur.execute(
            """INSERT INTO pds_resources
               (resource_id, env_id, business_id, home_market_id, business_line_id,
                resource_code, full_name, title, role_preset, metadata_json)
               VALUES (%s, %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                       %s, %s, %s, %s, '{}')
               ON CONFLICT (env_id, business_id, resource_code) DO UPDATE
               SET full_name = EXCLUDED.full_name, title = EXCLUDED.title,
                   role_preset = EXCLUDED.role_preset, home_market_id = EXCLUDED.home_market_id,
                   business_line_id = EXCLUDED.business_line_id
               RETURNING resource_id
            """,
            (
                resource_id, env_str, biz_str,
                home_market_id,
                bl_map.get(primary_bl_code),
                leader["code"], leader["name"], leader["title"], leader["role_preset"],
            ),
        )
        row = cur.fetchone()
        resource_id = str(row["resource_id"]) if row else resource_id
        leader_resource_map[leader["name"]] = resource_id

        # Insert coverage rows
        for market_code, bl_code, role in leader["coverage"]:
            mid = market_map.get(market_code)
            blid = bl_map.get(bl_code)
            if not mid or not blid:
                continue
            is_primary = role == "leader"
            cur.execute(
                """INSERT INTO pds_leader_coverage
                   (env_id, business_id, resource_id, market_id, business_line_id,
                    coverage_role, effective_from, is_primary, metadata_json)
                   VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::uuid,
                           %s, %s, %s, '{}')
                   ON CONFLICT (env_id, business_id, resource_id, market_id, business_line_id, effective_from)
                   DO NOTHING
                """,
                (
                    env_str, biz_str, resource_id, mid, blid,
                    role, date(2025, 1, 1), is_primary,
                ),
            )
            coverage_count += 1

    logger.info("Seeded %d leader coverage rows", coverage_count)
    return leader_resource_map


# ─── 4. Wire market leaders ───────────────────────────────────────────

def _wire_market_leaders(
    cur, env_str: str, biz_str: str,
    market_map: dict[str, str], leader_resource_map: dict[str, str],
) -> None:
    """Set leader_resource_id on markets by matching leader_name text."""
    for name, resource_id in leader_resource_map.items():
        cur.execute(
            """UPDATE pds_markets SET leader_resource_id = %s::uuid
               WHERE env_id = %s::uuid AND business_id = %s::uuid
               AND leader_name = %s AND leader_resource_id IS NULL""",
            (resource_id, env_str, biz_str, name),
        )


# ─── 5. Wire account owners ───────────────────────────────────────────

def _wire_account_owners(
    cur, env_str: str, biz_str: str,
    leader_resource_map: dict[str, str],
) -> None:
    """Set owner_resource_id on accounts and account_owners by matching name text."""
    for name, resource_id in leader_resource_map.items():
        cur.execute(
            """UPDATE pds_accounts SET owner_resource_id = %s::uuid
               WHERE env_id = %s::uuid AND business_id = %s::uuid
               AND owner_name = %s AND owner_resource_id IS NULL""",
            (resource_id, env_str, biz_str, name),
        )
        cur.execute(
            """UPDATE pds_account_owners SET resource_id = %s::uuid
               WHERE env_id = %s::uuid AND business_id = %s::uuid
               AND owner_name = %s AND resource_id IS NULL""",
            (resource_id, env_str, biz_str, name),
        )


# ─── 6. Backfill resources ────────────────────────────────────────────

def _backfill_resources(cur, env_str: str, biz_str: str, bl_map: dict[str, str]) -> int:
    """Assign business_line_id to resources that don't have one, using weighted random."""
    cur.execute(
        """SELECT resource_id FROM pds_resources
           WHERE env_id = %s::uuid AND business_id = %s::uuid AND business_line_id IS NULL""",
        (env_str, biz_str),
    )
    rows = cur.fetchall()
    bl_codes = list(bl_map.keys())
    count = 0
    for row in rows:
        code = random.choices(bl_codes, weights=BL_WEIGHTS, k=1)[0]
        cur.execute(
            "UPDATE pds_resources SET business_line_id = %s::uuid WHERE resource_id = %s::uuid",
            (bl_map[code], str(row["resource_id"])),
        )
        count += 1
    return count


# ─── 7. Backfill projects ─────────────────────────────────────────────

def _backfill_projects(cur, env_str: str, biz_str: str, bl_map: dict[str, str]) -> int:
    """Stamp business_line_id on pds_projects using project name / metadata heuristics."""
    cur.execute(
        """SELECT project_id, name, metadata_json FROM pds_projects
           WHERE env_id = %s::uuid AND business_id = %s::uuid AND business_line_id IS NULL""",
        (env_str, biz_str),
    )
    rows = cur.fetchall()
    bl_codes = list(bl_map.keys())
    count = 0
    for row in rows:
        project_name = (row.get("name") or "").lower()
        matched_code = None
        for text, code in PROJECT_TYPE_TO_BL.items():
            if text in project_name:
                matched_code = code
                break
        if not matched_code:
            matched_code = random.choices(bl_codes, weights=BL_WEIGHTS, k=1)[0]
        cur.execute(
            "UPDATE pds_projects SET business_line_id = %s::uuid WHERE project_id = %s::uuid",
            (bl_map[matched_code], str(row["project_id"])),
        )
        count += 1
    return count


# ─── 8. Backfill fact tables ──────────────────────────────────────────

def _backfill_facts(cur, env_str: str, biz_str: str) -> int:
    """Inherit business_line_id from project on all 10 fact tables."""
    fact_tables = [
        "pds_fee_revenue_plan", "pds_fee_revenue_actual",
        "pds_gaap_revenue_plan", "pds_gaap_revenue_actual",
        "pds_ci_plan", "pds_ci_actual",
        "pds_backlog_fact", "pds_billing_fact",
        "pds_collection_fact", "pds_writeoff_fact",
    ]
    total = 0
    for table in fact_tables:
        cur.execute(
            f"""UPDATE {table} AS f
                SET business_line_id = p.business_line_id
                FROM pds_projects p
                WHERE f.project_id = p.project_id
                AND f.env_id = %s::uuid AND f.business_id = %s::uuid
                AND f.business_line_id IS NULL
                AND p.business_line_id IS NOT NULL""",
            (env_str, biz_str),
        )
        total += cur.rowcount
    return total


# ─── 9. Backfill pipeline ─────────────────────────────────────────────

def _backfill_pipeline(
    cur, env_str: str, biz_str: str,
    bl_map: dict[str, str], market_map: dict[str, str],
    leader_resource_map: dict[str, str],
) -> int:
    """Stamp business_line_id, market_id, owner_resource_id on pipeline deals."""
    cur.execute(
        """SELECT deal_id, account_id, owner_name, deal_name FROM pds_pipeline_deals
           WHERE env_id = %s::uuid AND business_id = %s::uuid""",
        (env_str, biz_str),
    )
    rows = cur.fetchall()
    bl_codes = list(bl_map.keys())
    market_ids = list(market_map.values())
    count = 0

    for row in rows:
        # Resolve owner_resource_id from name
        owner_resource_id = leader_resource_map.get(row.get("owner_name"))

        # Resolve business_line_id from deal name or random
        deal_name = (row.get("deal_name") or "").lower()
        matched_bl = None
        for text, code in PROJECT_TYPE_TO_BL.items():
            if text in deal_name:
                matched_bl = bl_map[code]
                break
        if not matched_bl:
            matched_bl = bl_map[random.choices(bl_codes, weights=BL_WEIGHTS, k=1)[0]]

        # Resolve market_id: inherit from account, else random
        deal_market_id = None
        if row.get("account_id"):
            cur.execute(
                "SELECT market_id FROM pds_accounts WHERE account_id = %s::uuid",
                (str(row["account_id"]),),
            )
            acc = cur.fetchone()
            deal_market_id = str(acc["market_id"]) if acc and acc.get("market_id") else None
        if not deal_market_id and market_ids:
            deal_market_id = random.choice(market_ids)

        cur.execute(
            """UPDATE pds_pipeline_deals
               SET business_line_id = COALESCE(business_line_id, %s::uuid),
                   market_id = COALESCE(market_id, %s::uuid),
                   owner_resource_id = COALESCE(owner_resource_id, %s::uuid)
               WHERE deal_id = %s::uuid""",
            (
                matched_bl,
                deal_market_id,
                owner_resource_id,
                str(row["deal_id"]),
            ),
        )
        count += 1
    return count


# ─── 10. Backfill analytics tables ────────────────────────────────────

def _backfill_analytics(cur, env_str: str, biz_str: str, bl_map: dict[str, str]) -> int:
    """Backfill business_line_id on analytics employees, projects, assignments, revenue."""
    total = 0
    bl_codes = list(bl_map.keys())

    # Analytics projects: match service_line_key → line_code
    cur.execute(
        """SELECT project_id, service_line_key, project_type FROM pds_analytics_projects
           WHERE env_id = %s::uuid AND business_id = %s::uuid AND business_line_id IS NULL""",
        (env_str, biz_str),
    )
    for row in cur.fetchall():
        slk = (row.get("service_line_key") or row.get("project_type") or "").lower().strip()
        matched = PROJECT_TYPE_TO_BL.get(slk)
        if not matched:
            for text, code in PROJECT_TYPE_TO_BL.items():
                if text in slk:
                    matched = code
                    break
        if not matched:
            matched = random.choices(bl_codes, weights=BL_WEIGHTS, k=1)[0]
        cur.execute(
            "UPDATE pds_analytics_projects SET business_line_id = %s::uuid WHERE project_id = %s::uuid",
            (bl_map[matched], str(row["project_id"])),
        )
        total += 1

    # Analytics employees: weighted random assignment
    cur.execute(
        """SELECT employee_id FROM pds_analytics_employees
           WHERE env_id = %s::uuid AND business_id = %s::uuid AND business_line_id IS NULL""",
        (env_str, biz_str),
    )
    for row in cur.fetchall():
        code = random.choices(bl_codes, weights=BL_WEIGHTS, k=1)[0]
        cur.execute(
            "UPDATE pds_analytics_employees SET business_line_id = %s::uuid WHERE employee_id = %s::uuid",
            (bl_map[code], str(row["employee_id"])),
        )
        total += 1

    # Analytics employees: wire market_id FK from text market field
    cur.execute(
        """UPDATE pds_analytics_employees ae
           SET market_id = m.market_id
           FROM pds_markets m
           WHERE ae.env_id = m.env_id AND ae.business_id = m.business_id
           AND ae.market = m.market_name
           AND ae.env_id = %s::uuid AND ae.business_id = %s::uuid
           AND ae.market_id IS NULL""",
        (env_str, biz_str),
    )
    total += cur.rowcount

    # Analytics assignments: inherit from project
    cur.execute(
        """UPDATE pds_analytics_assignments aa
           SET business_line_id = ap.business_line_id
           FROM pds_analytics_projects ap
           WHERE aa.project_id = ap.project_id
           AND aa.env_id = %s::uuid AND aa.business_id = %s::uuid
           AND aa.business_line_id IS NULL
           AND ap.business_line_id IS NOT NULL""",
        (env_str, biz_str),
    )
    total += cur.rowcount

    # Revenue entries: inherit from project
    cur.execute(
        """UPDATE pds_revenue_entries re
           SET business_line_id = ap.business_line_id
           FROM pds_analytics_projects ap
           WHERE re.project_id = ap.project_id
           AND re.env_id = %s::uuid AND re.business_id = %s::uuid
           AND re.business_line_id IS NULL
           AND ap.business_line_id IS NOT NULL""",
        (env_str, biz_str),
    )
    total += cur.rowcount

    return total
