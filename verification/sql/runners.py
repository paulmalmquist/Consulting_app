"""
Canonical SQL runners for truth parity verification.

Execute the exact same queries the API endpoints use, returning raw rows
for comparison against Python finance functions and API responses.
"""
from __future__ import annotations

import sys
import os
from typing import Any
from uuid import UUID

# Add backend to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from app.db import get_cursor


def run_fund_portfolio_included_query(
    env_id: str,
    business_id: str,
    quarter: str,
) -> list[dict]:
    """Execute the canonical fund portfolio query.

    Reads the re_fund_portfolio_included_v view (defined in
    repo-b/db/schema/535_re_fund_portfolio_included_view.sql), which is the
    single source of truth for investor-facing rows on the Fund Portfolio page.

    Replaces the prior `run_fund_table_query` which mirrored
    `get_fund_table_rows` SQL — both are deleted in the same change. Plan:
    audit/fund_portfolio_coherence/gap_report.md.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              env_id, business_id, fund_id, name, vintage_year, strategy, status,
              target_size, snapshot_version, audit_run_id, promotion_state,
              trust_status, breakpoint_layer,
              canonical_metrics, null_reasons,
              legacy_weighted_dscr, legacy_weighted_ltv
            FROM re_fund_portfolio_included_v
            WHERE env_id = %s
              AND business_id = %s::uuid
              AND quarter = %s
            ORDER BY name
            """,
            [env_id, business_id, quarter],
        )
        return [dict(r) for r in cur.fetchall()]


def run_fund_portfolio_excluded_query(
    env_id: str,
    business_id: str,
) -> list[dict]:
    """Execute the canonical fund portfolio diagnostics query.

    Reads re_fund_portfolio_excluded_v env-scoped to (env_id, business_id).
    Returns one row per fund excluded from the investor-facing view, with
    `exclusion_reason` in {quarantined, archived, draft_only,
    no_released_snapshot, scope_incomplete}.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              env_id, business_id, fund_id, name, status,
              latest_quarter, latest_audit_run_id, latest_promotion_state,
              latest_null_reasons, exclusion_reason
            FROM re_fund_portfolio_excluded_v
            WHERE env_id = %s
              AND business_id = %s::uuid
            ORDER BY name
            """,
            [env_id, business_id],
        )
        return [dict(r) for r in cur.fetchall()]


def run_portfolio_kpis_query(
    business_id: str,
    quarter: str,
) -> dict:
    """
    Execute the portfolio KPI aggregation — same logic as get_portfolio_kpis().
    Returns a single dict with all KPI values for verification.
    """
    with get_cursor() as cur:
        # Fund count
        cur.execute(
            "SELECT COUNT(*)::int AS fund_count FROM repe_fund WHERE business_id = %s::uuid",
            [business_id],
        )
        fund_count = cur.fetchone()["fund_count"]

        # Total commitments
        cur.execute(
            """
            SELECT COALESCE(SUM(pc.committed_amount), 0) AS total_commitments
            FROM re_partner_commitment pc
            JOIN repe_fund f ON f.fund_id = pc.fund_id
            WHERE f.business_id = %s::uuid AND pc.status IN ('active', 'fully_called')
            """,
            [business_id],
        )
        total_commitments = cur.fetchone()["total_commitments"]

        # Latest fund quarter state per fund (base scenario)
        cur.execute(
            """
            SELECT DISTINCT ON (s.fund_id)
              s.fund_id, s.portfolio_nav, s.gross_irr, s.net_irr,
              s.weighted_dscr, s.weighted_ltv,
              s.total_committed, s.total_called
            FROM re_fund_quarter_state s
            JOIN repe_fund f ON f.fund_id = s.fund_id
            WHERE f.business_id = %s::uuid AND s.quarter = %s AND s.scenario_id IS NULL
            ORDER BY s.fund_id, s.created_at DESC
            """,
            [business_id, quarter],
        )
        fund_states = [dict(r) for r in cur.fetchall()]

    return {
        "fund_count": fund_count,
        "total_commitments": total_commitments,
        "fund_states": fund_states,
    }


def run_allocation_query(
    business_id: str,
    quarter: str,
    group_by: str = "sector",
) -> list[dict]:
    """
    Execute allocation breakdown — same logic as get_allocation_breakdown().
    Returns raw grouped rows.
    """
    if group_by == "geography":
        group_col = "COALESCE(pa.state, 'Unknown')"
    else:
        group_col = "COALESCE(pa.property_type, 'Unknown')"

    with get_cursor() as cur:
        cur.execute(
            f"""
            WITH active_assets AS (
              SELECT a.asset_id
              FROM repe_asset a
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              WHERE f.business_id = %s::uuid
                AND (a.asset_status IS NULL OR a.asset_status IN ('active','held','lease_up','operating'))
            ),
            latest_state AS (
              SELECT DISTINCT ON (aqs.asset_id)
                aqs.asset_id,
                COALESCE(aqs.nav, aqs.asset_value, 0) AS nav_value
              FROM re_asset_quarter_state aqs
              WHERE aqs.asset_id IN (SELECT asset_id FROM active_assets)
                AND aqs.quarter = %s AND aqs.scenario_id IS NULL
              ORDER BY aqs.asset_id, aqs.created_at DESC
            )
            SELECT
              {group_col} AS group_name,
              SUM(ls.nav_value) AS total_nav,
              COUNT(*)::int AS asset_count
            FROM active_assets aa
            JOIN repe_property_asset pa ON pa.asset_id = aa.asset_id
            LEFT JOIN latest_state ls ON ls.asset_id = aa.asset_id
            GROUP BY {group_col}
            ORDER BY total_nav DESC NULLS LAST
            """,
            [business_id, quarter],
        )
        return [dict(r) for r in cur.fetchall()]
