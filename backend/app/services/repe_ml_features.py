"""
repe_ml_features.py — Compute ML features from authoritative snapshot tables.

All inputs come from re_asset_quarter_state and related tables.
No approximations or UI-layer calculations.

Features are stored in repe_ml_features for downstream consumption by
Databricks training pipelines (NOI forecast, refi risk, distress classification).
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import date
from typing import Any
from uuid import UUID

from app.db import get_pool

logger = logging.getLogger(__name__)


async def compute_ml_features(
    env_id: str,
    business_id: UUID,
    quarter: str,
    scenario_id: UUID | None = None,
) -> list[dict[str, Any]]:
    """
    Compute ML features for all assets in an environment for a given quarter.

    All values derived from re_asset_quarter_state snapshots.
    Returns list of feature dicts (one per asset).
    """
    pool = get_pool()

    sql = """
    WITH current_q AS (
        SELECT
            aq.asset_id,
            aq.quarter,
            aq.noi,
            aq.revenue,
            aq.opex,
            aq.occupancy,
            aq.debt_balance,
            aq.debt_service,
            aq.asset_value,
            aq.nav,
            aq.capex,
            CASE
                WHEN aq.debt_service > 0 AND aq.noi IS NOT NULL
                THEN aq.noi / aq.debt_service
            END AS dscr,
            CASE
                WHEN aq.asset_value > 0 AND aq.debt_balance IS NOT NULL
                THEN aq.debt_balance / aq.asset_value
            END AS ltv,
            CASE
                WHEN aq.debt_balance > 0 AND aq.noi IS NOT NULL
                THEN aq.noi / aq.debt_balance
            END AS debt_yield
        FROM re_asset_quarter_state aq
        WHERE aq.quarter = %(quarter)s
          AND EXISTS (
              SELECT 1 FROM repe_asset a
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              WHERE a.asset_id = aq.asset_id
                AND f.business_id = %(business_id)s
          )
    ),
    prior_q AS (
        SELECT
            aq.asset_id,
            aq.noi AS prior_noi,
            aq.revenue AS prior_revenue,
            aq.opex AS prior_opex,
            aq.occupancy AS prior_occupancy
        FROM re_asset_quarter_state aq
        WHERE aq.quarter = %(prior_quarter)s
          AND EXISTS (
              SELECT 1 FROM repe_asset a
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              WHERE a.asset_id = aq.asset_id
                AND f.business_id = %(business_id)s
          )
    ),
    yoy_q AS (
        SELECT
            aq.asset_id,
            aq.noi AS yoy_noi,
            aq.revenue AS yoy_revenue,
            aq.opex AS yoy_opex,
            aq.occupancy AS yoy_occupancy
        FROM re_asset_quarter_state aq
        WHERE aq.quarter = %(yoy_quarter)s
          AND EXISTS (
              SELECT 1 FROM repe_asset a
              JOIN repe_deal d ON d.deal_id = a.deal_id
              JOIN repe_fund f ON f.fund_id = d.fund_id
              WHERE a.asset_id = aq.asset_id
                AND f.business_id = %(business_id)s
          )
    ),
    uw AS (
        SELECT
            ub.asset_id,
            SUM(ub.amount) AS uw_noi
        FROM uw_noi_budget_monthly ub
        WHERE ub.env_id = %(env_id)s
          AND ub.business_id = %(business_id)s
          AND ub.line_code = 'NOI'
          AND ub.period_month >= %(quarter_start)s
          AND ub.period_month < %(quarter_end)s
        GROUP BY ub.asset_id
    ),
    maturity AS (
        SELECT
            l.asset_id,
            MIN(
                EXTRACT(EPOCH FROM (l.maturity::timestamp - NOW())) / (86400 * 30.44)
            )::int AS min_maturity_months
        FROM re_loan l
        WHERE l.env_id = %(env_id)s
          AND l.business_id = %(business_id)s
          AND l.maturity IS NOT NULL
        GROUP BY l.asset_id
    )
    SELECT
        c.asset_id,
        c.quarter,
        -- QoQ growth
        CASE WHEN p.prior_noi > 0 THEN (c.noi - p.prior_noi) / ABS(p.prior_noi) END AS noi_growth_qoq,
        CASE WHEN p.prior_revenue > 0 THEN (c.revenue - p.prior_revenue) / ABS(p.prior_revenue) END AS revenue_growth_qoq,
        CASE WHEN p.prior_opex > 0 THEN (c.opex - p.prior_opex) / ABS(p.prior_opex) END AS expense_growth_qoq,
        c.occupancy - p.prior_occupancy AS occupancy_change_qoq,
        -- YoY growth
        CASE WHEN y.yoy_noi > 0 THEN (c.noi - y.yoy_noi) / ABS(y.yoy_noi) END AS noi_growth_yoy,
        CASE WHEN y.yoy_revenue > 0 THEN (c.revenue - y.yoy_revenue) / ABS(y.yoy_revenue) END AS revenue_growth_yoy,
        CASE WHEN y.yoy_opex > 0 THEN (c.opex - y.yoy_opex) / ABS(y.yoy_opex) END AS expense_growth_yoy,
        c.occupancy - y.yoy_occupancy AS occupancy_change_yoy,
        -- Debt metrics
        c.dscr,
        c.ltv,
        c.debt_yield,
        -- Capital intensity
        CASE WHEN c.revenue > 0 AND c.capex IS NOT NULL THEN c.capex / c.revenue END AS capex_ratio,
        -- Maturity
        m.min_maturity_months AS debt_maturity_months,
        -- UW variance
        CASE WHEN u.uw_noi > 0 THEN c.noi / u.uw_noi END AS noi_variance_to_uw
    FROM current_q c
    LEFT JOIN prior_q p ON p.asset_id = c.asset_id
    LEFT JOIN yoy_q y ON y.asset_id = c.asset_id
    LEFT JOIN uw u ON u.asset_id = c.asset_id
    LEFT JOIN maturity m ON m.asset_id = c.asset_id
    """

    # Compute quarter offsets
    year = int(quarter[:4])
    q_num = int(quarter[-1])

    # Prior quarter
    if q_num == 1:
        prior_quarter = f"{year - 1}Q4"
    else:
        prior_quarter = f"{year}Q{q_num - 1}"

    # YoY quarter
    yoy_quarter = f"{year - 1}Q{q_num}"

    # Quarter date range for UW budget lookup
    quarter_month_start = (q_num - 1) * 3 + 1
    quarter_start = date(year, quarter_month_start, 1)
    if q_num == 4:
        quarter_end = date(year + 1, 1, 1)
    else:
        quarter_end = date(year, quarter_month_start + 3, 1)

    params = {
        "env_id": env_id,
        "business_id": str(business_id),
        "quarter": quarter,
        "prior_quarter": prior_quarter,
        "yoy_quarter": yoy_quarter,
        "quarter_start": quarter_start.isoformat(),
        "quarter_end": quarter_end.isoformat(),
    }

    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            columns = [desc[0] for desc in cur.description]
            rows = await cur.fetchall()

    features = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        inputs_hash = hashlib.sha256(
            json.dumps(row_dict, default=str, sort_keys=True).encode()
        ).hexdigest()[:16]

        feature = {
            "env_id": env_id,
            "business_id": str(business_id),
            "asset_id": str(row_dict["asset_id"]),
            "quarter": quarter,
            "scenario_id": str(scenario_id) if scenario_id else None,
            "noi_growth_qoq": row_dict.get("noi_growth_qoq"),
            "noi_growth_yoy": row_dict.get("noi_growth_yoy"),
            "occupancy_change_qoq": row_dict.get("occupancy_change_qoq"),
            "occupancy_change_yoy": row_dict.get("occupancy_change_yoy"),
            "expense_growth_qoq": row_dict.get("expense_growth_qoq"),
            "expense_growth_yoy": row_dict.get("expense_growth_yoy"),
            "revenue_growth_qoq": row_dict.get("revenue_growth_qoq"),
            "revenue_growth_yoy": row_dict.get("revenue_growth_yoy"),
            "dscr": row_dict.get("dscr"),
            "ltv": row_dict.get("ltv"),
            "debt_yield": row_dict.get("debt_yield"),
            "capex_ratio": row_dict.get("capex_ratio"),
            "debt_maturity_months": row_dict.get("debt_maturity_months"),
            "noi_variance_to_uw": row_dict.get("noi_variance_to_uw"),
            "lease_rollover_12m": None,  # requires lease data — future enhancement
            "inputs_hash": inputs_hash,
        }
        features.append(feature)

    return features


async def persist_ml_features(features: list[dict[str, Any]]) -> int:
    """Upsert computed features into repe_ml_features table."""
    if not features:
        return 0

    pool = get_pool()
    upsert_sql = """
    INSERT INTO repe_ml_features (
        env_id, business_id, asset_id, quarter, scenario_id,
        noi_growth_qoq, noi_growth_yoy,
        occupancy_change_qoq, occupancy_change_yoy,
        expense_growth_qoq, expense_growth_yoy,
        revenue_growth_qoq, revenue_growth_yoy,
        dscr, ltv, debt_yield,
        lease_rollover_12m, capex_ratio,
        debt_maturity_months, noi_variance_to_uw,
        inputs_hash, computed_at
    ) VALUES (
        %(env_id)s, %(business_id)s, %(asset_id)s, %(quarter)s, %(scenario_id)s,
        %(noi_growth_qoq)s, %(noi_growth_yoy)s,
        %(occupancy_change_qoq)s, %(occupancy_change_yoy)s,
        %(expense_growth_qoq)s, %(expense_growth_yoy)s,
        %(revenue_growth_qoq)s, %(revenue_growth_yoy)s,
        %(dscr)s, %(ltv)s, %(debt_yield)s,
        %(lease_rollover_12m)s, %(capex_ratio)s,
        %(debt_maturity_months)s, %(noi_variance_to_uw)s,
        %(inputs_hash)s, NOW()
    )
    ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
        noi_growth_qoq = EXCLUDED.noi_growth_qoq,
        noi_growth_yoy = EXCLUDED.noi_growth_yoy,
        occupancy_change_qoq = EXCLUDED.occupancy_change_qoq,
        occupancy_change_yoy = EXCLUDED.occupancy_change_yoy,
        expense_growth_qoq = EXCLUDED.expense_growth_qoq,
        expense_growth_yoy = EXCLUDED.expense_growth_yoy,
        revenue_growth_qoq = EXCLUDED.revenue_growth_qoq,
        revenue_growth_yoy = EXCLUDED.revenue_growth_yoy,
        dscr = EXCLUDED.dscr,
        ltv = EXCLUDED.ltv,
        debt_yield = EXCLUDED.debt_yield,
        lease_rollover_12m = EXCLUDED.lease_rollover_12m,
        capex_ratio = EXCLUDED.capex_ratio,
        debt_maturity_months = EXCLUDED.debt_maturity_months,
        noi_variance_to_uw = EXCLUDED.noi_variance_to_uw,
        inputs_hash = EXCLUDED.inputs_hash,
        computed_at = NOW()
    """

    count = 0
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            for feature in features:
                await cur.execute(upsert_sql, feature)
                count += 1
        await conn.commit()

    logger.info("Persisted %d ML features for quarter %s", count, features[0]["quarter"] if features else "?")
    return count
