from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.db import get_cursor


def _money_to_string(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return format(value, "f")


def get_portfolio_kpis(
    *,
    env_id: UUID | str,
    business_id: UUID | str,
    quarter: str,
    scenario_id: UUID | str | None = None,
) -> dict:
    env_text = str(env_id)
    business_text = str(business_id)
    scenario_text = str(scenario_id) if scenario_id else None
    scenario_clause = "s.scenario_id = %s::uuid" if scenario_text else "s.scenario_id IS NULL"
    params: list[str] = [business_text, quarter]
    if scenario_text:
        params.append(scenario_text)
    params.extend([business_text, business_text, business_text])

    with get_cursor() as cur:
        cur.execute(
            f"""
            WITH latest_nav AS (
              SELECT DISTINCT ON (s.fund_id)
                s.fund_id,
                s.portfolio_nav
              FROM re_fund_quarter_state s
              JOIN repe_fund f ON f.fund_id = s.fund_id
              WHERE f.business_id = %s::uuid
                AND s.quarter = %s
                AND {scenario_clause}
              ORDER BY s.fund_id, s.created_at DESC
            )
            SELECT
              (
                SELECT COUNT(*)::int
                FROM repe_fund f
                WHERE f.business_id = %s::uuid
              ) AS fund_count,
              (
                SELECT COALESCE(SUM(pc.committed_amount), 0)
                FROM re_partner_commitment pc
                JOIN repe_fund f ON f.fund_id = pc.fund_id
                WHERE f.business_id = %s::uuid
                  AND pc.status IN ('active', 'fully_called')
              ) AS total_commitments,
              (
                SELECT CASE
                  WHEN COUNT(*) = 0 THEN NULL
                  ELSE COALESCE(SUM(portfolio_nav), 0)
                END
                FROM latest_nav
              ) AS portfolio_nav,
              (
                SELECT COUNT(*)::int
                FROM repe_asset a
                JOIN repe_deal d ON d.deal_id = a.deal_id
                JOIN repe_fund f ON f.fund_id = d.fund_id
                WHERE f.business_id = %s::uuid
                  AND a.asset_type = 'property'
                  AND COALESCE(a.asset_status, 'active') IN ('active', 'held')
              ) AS active_assets
            """,
            params,
        )
        row = cur.fetchone()

    warnings: list[str] = []
    if row["portfolio_nav"] is None:
        scope = scenario_text or "base"
        warnings.append(
            f"No fund quarter state rows found for quarter {quarter} and scenario {scope}."
        )

    return {
        "env_id": env_text,
        "business_id": business_text,
        "quarter": quarter,
        "scenario_id": scenario_text,
        "fund_count": row["fund_count"] or 0,
        "total_commitments": _money_to_string(row["total_commitments"]) or "0",
        "portfolio_nav": _money_to_string(row["portfolio_nav"]),
        "active_assets": row["active_assets"] or 0,
        "warnings": warnings,
    }
