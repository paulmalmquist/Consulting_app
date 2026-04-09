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


def run_fund_table_query(
    business_id: str,
    quarter: str,
    model_id: str | None = None,
) -> list[dict]:
    """
    Execute the fund table query — same SQL as get_fund_table_rows().
    Returns raw rows for verification comparison.
    """
    if model_id:
        scenario_clause = "sq.scenario_id = %s::uuid"
        scenario_params: list[Any] = [model_id]
    else:
        scenario_clause = "sq.scenario_id IS NULL"
        scenario_params = []

    params: list[Any] = [quarter] + scenario_params + [business_id]

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
              f.fund_id, f.name, f.vintage_year, f.strategy, f.status, f.target_size,
              s.portfolio_nav, s.total_committed, s.total_called, s.total_distributed,
              s.dpi, s.rvpi, s.tvpi, s.gross_irr, s.net_irr,
              s.weighted_dscr, s.weighted_ltv,
              CASE WHEN s.total_committed > 0 THEN s.total_called / s.total_committed ELSE NULL END AS pct_invested
            FROM repe_fund f
            LEFT JOIN LATERAL (
              SELECT * FROM re_fund_quarter_state sq
              WHERE sq.fund_id = f.fund_id AND sq.quarter = %s AND {scenario_clause}
              ORDER BY sq.created_at DESC LIMIT 1
            ) s ON true
            WHERE f.business_id = %s::uuid
            ORDER BY f.name
            """,
            params,
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
