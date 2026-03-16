"""PDS Account analytics service.

Queries pds_accounts + pds_revenue_entries + pds_analytics_projects +
v_pds_account_health + v_pds_nps_summary + v_pds_utilization_monthly
to produce executive overview, regional rollup, account 360, project detail,
quadrant scatter, and RAG summary.
"""
from __future__ import annotations

from typing import Any

from app.db import get_cursor


# ---------------------------------------------------------------------------
# GET /executive-overview  (Level 0 — C-Suite)
# ---------------------------------------------------------------------------

def get_executive_overview(
    *,
    env_id: str,
    business_id: str,
) -> dict[str, Any]:
    """Total revenue YTD, YoY growth, portfolio margin, health distribution,
    top 5 by revenue, top 5 at risk."""
    with get_cursor() as cur:
        # YTD revenue + prior-year for YoY
        cur.execute(
            """
            WITH ytd AS (
                SELECT
                    SUM(r.recognized_revenue) AS total_revenue,
                    SUM(r.recognized_revenue - r.cost) AS total_profit,
                    CASE WHEN SUM(r.recognized_revenue) > 0
                         THEN ROUND(SUM(r.recognized_revenue - r.cost)
                                    / SUM(r.recognized_revenue) * 100, 2)
                         ELSE 0
                    END AS portfolio_margin
                FROM pds_revenue_entries r
                WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
                  AND r.version = 'actual'
                  AND r.period >= date_trunc('year', CURRENT_DATE)::date
            ),
            prior AS (
                SELECT SUM(r.recognized_revenue) AS prior_revenue
                FROM pds_revenue_entries r
                WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
                  AND r.version = 'actual'
                  AND r.period >= (date_trunc('year', CURRENT_DATE) - interval '1 year')::date
                  AND r.period < date_trunc('year', CURRENT_DATE)::date
            )
            SELECT
                ytd.total_revenue,
                ytd.total_profit,
                ytd.portfolio_margin,
                CASE WHEN prior.prior_revenue > 0
                     THEN ROUND((ytd.total_revenue - prior.prior_revenue)
                                / prior.prior_revenue * 100, 2)
                     ELSE NULL
                END AS yoy_growth
            FROM ytd, prior
            """,
            (env_id, business_id, env_id, business_id),
        )
        overview = cur.fetchone()

        # Health distribution
        cur.execute(
            """
            SELECT
                health_status,
                COUNT(*) AS account_count
            FROM v_pds_account_health
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            GROUP BY health_status
            """,
            (env_id, business_id),
        )
        health_dist = cur.fetchall()

        # Top 5 by revenue
        cur.execute(
            """
            SELECT
                a.account_id, a.account_name,
                SUM(r.recognized_revenue) AS ytd_revenue
            FROM pds_revenue_entries r
            JOIN pds_analytics_projects p ON p.project_id = r.project_id
                AND p.env_id = r.env_id AND p.business_id = r.business_id
            JOIN pds_accounts a ON a.account_id = p.account_id
                AND a.env_id = p.env_id AND a.business_id = p.business_id
            WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
              AND r.version = 'actual'
              AND r.period >= date_trunc('year', CURRENT_DATE)::date
            GROUP BY a.account_id, a.account_name
            ORDER BY ytd_revenue DESC
            LIMIT 5
            """,
            (env_id, business_id),
        )
        top5_revenue = cur.fetchall()

        # Top 5 at risk
        cur.execute(
            """
            SELECT
                h.account_id, a.account_name,
                h.health_status, h.health_score
            FROM v_pds_account_health h
            JOIN pds_accounts a ON a.account_id = h.account_id
                AND a.env_id = h.env_id AND a.business_id = h.business_id
            WHERE h.env_id = %s::uuid AND h.business_id = %s::uuid
              AND h.health_status IN ('red', 'yellow')
            ORDER BY h.health_score ASC
            LIMIT 5
            """,
            (env_id, business_id),
        )
        top5_risk = cur.fetchall()

    return {
        "total_revenue_ytd": float((overview or {}).get("total_revenue") or 0),
        "portfolio_margin": float((overview or {}).get("portfolio_margin") or 0),
        "yoy_growth": (overview or {}).get("yoy_growth"),
        "health_distribution": [dict(r) for r in health_dist],
        "top_5_by_revenue": [dict(r) for r in top5_revenue],
        "top_5_at_risk": [dict(r) for r in top5_risk],
    }


# ---------------------------------------------------------------------------
# GET /regional  (Level 1)
# ---------------------------------------------------------------------------

def get_regional(
    *,
    env_id: str,
    business_id: str,
) -> dict[str, Any]:
    """Per-region: revenue, margin, account count, health distribution, budget vs actual."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                a.region,
                COUNT(DISTINCT a.account_id) AS account_count,
                SUM(r.recognized_revenue) AS revenue,
                CASE WHEN SUM(r.recognized_revenue) > 0
                     THEN ROUND(SUM(r.recognized_revenue - r.cost)
                                / SUM(r.recognized_revenue) * 100, 2)
                     ELSE 0
                END AS margin_pct
            FROM pds_revenue_entries r
            JOIN pds_analytics_projects p ON p.project_id = r.project_id
                AND p.env_id = r.env_id AND p.business_id = r.business_id
            JOIN pds_accounts a ON a.account_id = p.account_id
                AND a.env_id = p.env_id AND a.business_id = p.business_id
            WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
              AND r.version = 'actual'
              AND r.period >= date_trunc('year', CURRENT_DATE)::date
            GROUP BY a.region
            ORDER BY revenue DESC
            """,
            (env_id, business_id),
        )
        revenue_rows = cur.fetchall()

        # Health distribution by region
        cur.execute(
            """
            SELECT
                a.region,
                h.health_status,
                COUNT(*) AS count
            FROM v_pds_account_health h
            JOIN pds_accounts a ON a.account_id = h.account_id
                AND a.env_id = h.env_id AND a.business_id = h.business_id
            WHERE h.env_id = %s::uuid AND h.business_id = %s::uuid
            GROUP BY a.region, h.health_status
            """,
            (env_id, business_id),
        )
        health_rows = cur.fetchall()

        # Budget vs actual by region
        cur.execute(
            """
            SELECT
                a.region,
                v.budget_total,
                v.actual_total,
                CASE WHEN v.budget_total > 0
                     THEN ROUND(v.actual_total / v.budget_total * 100, 2)
                     ELSE NULL
                END AS budget_vs_actual_pct
            FROM v_pds_revenue_variance v
            JOIN pds_accounts a ON a.account_id = v.account_id
                AND a.env_id = v.env_id AND a.business_id = v.business_id
            WHERE v.env_id = %s::uuid AND v.business_id = %s::uuid
            """,
            (env_id, business_id),
        )
        bva_rows = cur.fetchall()

    # Merge health distributions into region map
    health_by_region: dict[str, dict[str, int]] = {}
    for r in health_rows:
        region = r["region"]
        health_by_region.setdefault(region, {})[r["health_status"]] = r["count"]

    bva_by_region: dict[str, float] = {}
    for r in bva_rows:
        region = r["region"]
        # Aggregate across accounts
        bva_by_region.setdefault(region, [])
        if r["budget_vs_actual_pct"] is not None:
            bva_by_region[region].append(float(r["budget_vs_actual_pct"]))

    regions = []
    for r in revenue_rows:
        region = r["region"]
        bva_list = bva_by_region.get(region, [])
        regions.append({
            **dict(r),
            "health_distribution": health_by_region.get(region, {}),
            "budget_vs_actual_pct": round(sum(bva_list) / max(len(bva_list), 1), 2) if bva_list else None,
        })

    return {"regions": regions}


# ---------------------------------------------------------------------------
# GET /{account_id}/360  (Level 2)
# ---------------------------------------------------------------------------

def get_account_360(
    *,
    env_id: str,
    business_id: str,
    account_id: str,
) -> dict[str, Any]:
    """Full account profile: P&L, project count with RAG, utilization, NPS trend, contract value."""
    with get_cursor() as cur:
        # Account info
        cur.execute(
            """
            SELECT
                a.account_id, a.account_name, a.region, a.governance_track,
                a.annual_contract_value, a.contract_start_date, a.contract_end_date,
                a.status
            FROM pds_accounts a
            WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid
              AND a.account_id = %s::uuid
            """,
            (env_id, business_id, account_id),
        )
        acct = cur.fetchone()

        # P&L
        cur.execute(
            """
            SELECT
                SUM(r.recognized_revenue) AS ytd_revenue,
                SUM(r.cost)               AS ytd_cost,
                SUM(r.recognized_revenue - r.cost) AS ytd_profit,
                CASE WHEN SUM(r.recognized_revenue) > 0
                     THEN ROUND(SUM(r.recognized_revenue - r.cost)
                                / SUM(r.recognized_revenue) * 100, 2)
                     ELSE 0
                END AS margin_pct
            FROM pds_revenue_entries r
            JOIN pds_analytics_projects p ON p.project_id = r.project_id
                AND p.env_id = r.env_id AND p.business_id = r.business_id
            WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
              AND p.account_id = %s::uuid
              AND r.version = 'actual'
              AND r.period >= date_trunc('year', CURRENT_DATE)::date
            """,
            (env_id, business_id, account_id),
        )
        pnl = cur.fetchone()

        # Project count by status
        cur.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM pds_analytics_projects
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              AND account_id = %s::uuid
            GROUP BY status
            """,
            (env_id, business_id, account_id),
        )
        project_counts = cur.fetchall()

        # Utilization for this account's employees
        cur.execute(
            """
            SELECT
                v.period,
                v.utilization_pct
            FROM v_pds_utilization_monthly v
            WHERE v.env_id = %s::uuid AND v.business_id = %s::uuid
              AND v.account_id = %s::uuid
            ORDER BY v.period DESC
            LIMIT 12
            """,
            (env_id, business_id, account_id),
        )
        util_rows = cur.fetchall()

        # NPS trend
        cur.execute(
            """
            SELECT
                date_trunc('quarter', n.survey_date)::date AS quarter,
                ROUND(
                    (SUM(CASE WHEN n.nps_score >= 9 THEN 1 ELSE 0 END)
                     - SUM(CASE WHEN n.nps_score <= 6 THEN 1 ELSE 0 END))::numeric
                    / NULLIF(COUNT(*), 0) * 100, 2
                ) AS nps
            FROM pds_nps_responses n
            WHERE n.env_id = %s::uuid AND n.business_id = %s::uuid
              AND n.account_id = %s::uuid
            GROUP BY date_trunc('quarter', n.survey_date)
            ORDER BY quarter
            """,
            (env_id, business_id, account_id),
        )
        nps_rows = cur.fetchall()

    return {
        "account": dict(acct) if acct else None,
        "pnl": dict(pnl) if pnl else None,
        "project_counts": [dict(r) for r in project_counts],
        "utilization_trend": [dict(r) for r in util_rows],
        "nps_trend": [dict(r) for r in nps_rows],
    }


# ---------------------------------------------------------------------------
# GET /{account_id}/projects  (Level 3)
# ---------------------------------------------------------------------------

def get_account_projects(
    *,
    env_id: str,
    business_id: str,
    account_id: str,
) -> dict[str, Any]:
    """Projects for an account: timeline, budget vs actual, EVM metrics."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                p.project_id,
                p.project_name,
                p.status,
                p.start_date,
                p.end_date,
                p.percent_complete,
                p.fee_amount AS budget,
                COALESCE(act.actual_revenue, 0) AS actual_revenue,
                CASE WHEN p.fee_amount > 0
                     THEN ROUND(COALESCE(act.actual_revenue, 0)
                                / p.fee_amount * 100, 2)
                     ELSE NULL
                END AS budget_vs_actual_pct,
                p.cpi,
                p.spi
            FROM pds_analytics_projects p
            LEFT JOIN LATERAL (
                SELECT SUM(r.recognized_revenue) AS actual_revenue
                FROM pds_revenue_entries r
                WHERE r.project_id = p.project_id
                  AND r.env_id = p.env_id AND r.business_id = p.business_id
                  AND r.version = 'actual'
            ) act ON true
            WHERE p.env_id = %s::uuid AND p.business_id = %s::uuid
              AND p.account_id = %s::uuid
            ORDER BY p.start_date DESC
            """,
            (env_id, business_id, account_id),
        )
        rows = cur.fetchall()

    return {"projects": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# GET /quadrant/{type}
# ---------------------------------------------------------------------------

def get_quadrant(
    *,
    env_id: str,
    business_id: str,
    quadrant_type: str,
) -> dict[str, Any]:
    """Scatter data for strategic quadrant views."""
    if quadrant_type == "revenue_growth":
        return _quadrant_revenue_growth(env_id=env_id, business_id=business_id)
    if quadrant_type == "satisfaction_revenue":
        return _quadrant_satisfaction_revenue(env_id=env_id, business_id=business_id)
    return {"error": f"Unknown quadrant type: {quadrant_type}", "points": []}


def _quadrant_revenue_growth(*, env_id: str, business_id: str) -> dict[str, Any]:
    """x=revenue, y=growth, size=margin."""
    with get_cursor() as cur:
        cur.execute(
            """
            WITH ytd AS (
                SELECT
                    p.account_id,
                    SUM(r.recognized_revenue) AS revenue,
                    CASE WHEN SUM(r.recognized_revenue) > 0
                         THEN ROUND(SUM(r.recognized_revenue - r.cost)
                                    / SUM(r.recognized_revenue) * 100, 2)
                         ELSE 0
                    END AS margin
                FROM pds_revenue_entries r
                JOIN pds_analytics_projects p ON p.project_id = r.project_id
                    AND p.env_id = r.env_id AND p.business_id = r.business_id
                WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
                  AND r.version = 'actual'
                  AND r.period >= date_trunc('year', CURRENT_DATE)::date
                GROUP BY p.account_id
            ),
            prior AS (
                SELECT
                    p.account_id,
                    SUM(r.recognized_revenue) AS revenue
                FROM pds_revenue_entries r
                JOIN pds_analytics_projects p ON p.project_id = r.project_id
                    AND p.env_id = r.env_id AND p.business_id = r.business_id
                WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
                  AND r.version = 'actual'
                  AND r.period >= (date_trunc('year', CURRENT_DATE) - interval '1 year')::date
                  AND r.period < date_trunc('year', CURRENT_DATE)::date
                GROUP BY p.account_id
            )
            SELECT
                a.account_id, a.account_name,
                ytd.revenue AS x,
                CASE WHEN prior.revenue > 0
                     THEN ROUND((ytd.revenue - prior.revenue)
                                / prior.revenue * 100, 2)
                     ELSE NULL
                END AS y,
                ytd.margin AS size
            FROM ytd
            JOIN pds_accounts a ON a.account_id = ytd.account_id
                AND a.env_id = %s::uuid AND a.business_id = %s::uuid
            LEFT JOIN prior ON prior.account_id = ytd.account_id
            ORDER BY ytd.revenue DESC
            """,
            (env_id, business_id, env_id, business_id, env_id, business_id),
        )
        rows = cur.fetchall()

    return {
        "quadrant_type": "revenue_growth",
        "x_label": "Revenue (YTD)",
        "y_label": "YoY Growth %",
        "size_label": "Margin %",
        "points": [dict(r) for r in rows],
    }


def _quadrant_satisfaction_revenue(*, env_id: str, business_id: str) -> dict[str, Any]:
    """x=revenue, y=nps."""
    with get_cursor() as cur:
        cur.execute(
            """
            WITH rev AS (
                SELECT
                    p.account_id,
                    SUM(r.recognized_revenue) AS revenue
                FROM pds_revenue_entries r
                JOIN pds_analytics_projects p ON p.project_id = r.project_id
                    AND p.env_id = r.env_id AND p.business_id = r.business_id
                WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
                  AND r.version = 'actual'
                  AND r.period >= date_trunc('year', CURRENT_DATE)::date
                GROUP BY p.account_id
            )
            SELECT
                a.account_id, a.account_name,
                rev.revenue AS x,
                v.nps AS y
            FROM rev
            JOIN pds_accounts a ON a.account_id = rev.account_id
                AND a.env_id = %s::uuid AND a.business_id = %s::uuid
            LEFT JOIN v_pds_nps_summary v ON v.account_id = rev.account_id
                AND v.env_id = %s::uuid AND v.business_id = %s::uuid
            ORDER BY rev.revenue DESC
            """,
            (env_id, business_id, env_id, business_id, env_id, business_id),
        )
        rows = cur.fetchall()

    return {
        "quadrant_type": "satisfaction_revenue",
        "x_label": "Revenue (YTD)",
        "y_label": "NPS",
        "points": [dict(r) for r in rows],
    }


# ---------------------------------------------------------------------------
# GET /rag-summary
# ---------------------------------------------------------------------------

def get_rag_summary(
    *,
    env_id: str,
    business_id: str,
) -> dict[str, Any]:
    """RAG scoring across all accounts per dimension."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                h.account_id,
                a.account_name,
                h.health_status,
                h.health_score,
                h.revenue_rag,
                h.margin_rag,
                h.utilization_rag,
                h.satisfaction_rag,
                h.adoption_rag
            FROM v_pds_account_health h
            JOIN pds_accounts a ON a.account_id = h.account_id
                AND a.env_id = h.env_id AND a.business_id = h.business_id
            WHERE h.env_id = %s::uuid AND h.business_id = %s::uuid
            ORDER BY h.health_score ASC
            """,
            (env_id, business_id),
        )
        rows = cur.fetchall()

    return {"accounts": [dict(r) for r in rows]}
