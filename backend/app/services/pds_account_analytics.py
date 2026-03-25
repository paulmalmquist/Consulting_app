"""PDS Account analytics service.

Queries pds_accounts + pds_revenue_entries + pds_analytics_projects +
v_pds_account_health + v_pds_nps_summary to produce executive overview,
regional rollup, account 360, project detail, quadrant scatter, and RAG summary.
"""
from __future__ import annotations

from typing import Any

from app.db import get_cursor

# Compute a unified health_status from nps_health + margin_health available in the view.
_HEALTH_STATUS_EXPR = """
    CASE
        WHEN h.nps_health = 'red' OR h.margin_health = 'red' THEN 'red'
        WHEN h.nps_health = 'amber' OR h.margin_health = 'amber' THEN 'amber'
        WHEN h.nps_health = 'green' AND h.margin_health = 'green' THEN 'green'
        ELSE 'unknown'
    END
"""

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

        # Health distribution using available nps_health + margin_health columns
        cur.execute(
            f"""
            SELECT
                {_HEALTH_STATUS_EXPR} AS health_status,
                COUNT(*) AS account_count
            FROM v_pds_account_health h
            WHERE h.env_id = %s::uuid AND h.business_id = %s::uuid
            GROUP BY {_HEALTH_STATUS_EXPR}
            """,
            (env_id, business_id),
        )
        health_dist = cur.fetchall()

        # Top 5 by YTD revenue
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

        # Top 5 at risk (red or amber NPS)
        cur.execute(
            f"""
            SELECT
                h.account_id, h.account_name,
                {_HEALTH_STATUS_EXPR} AS health_status,
                h.latest_nps,
                h.avg_margin
            FROM v_pds_account_health h
            WHERE h.env_id = %s::uuid AND h.business_id = %s::uuid
              AND ({_HEALTH_STATUS_EXPR}) IN ('red', 'amber')
            ORDER BY h.latest_nps ASC NULLS LAST
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

        cur.execute(
            f"""
            SELECT
                a.region,
                {_HEALTH_STATUS_EXPR} AS health_status,
                COUNT(*) AS count
            FROM v_pds_account_health h
            JOIN pds_accounts a ON a.account_id = h.account_id
                AND a.env_id = h.env_id AND a.business_id = h.business_id
            WHERE h.env_id = %s::uuid AND h.business_id = %s::uuid
            GROUP BY a.region, {_HEALTH_STATUS_EXPR}
            """,
            (env_id, business_id),
        )
        health_rows = cur.fetchall()

        # Budget vs actual by region (aggregate from revenue_entries directly)
        cur.execute(
            """
            SELECT
                a.region,
                SUM(r.recognized_revenue) FILTER (WHERE r.version = 'budget') AS budget_total,
                SUM(r.recognized_revenue) FILTER (WHERE r.version = 'actual') AS actual_total
            FROM pds_revenue_entries r
            JOIN pds_analytics_projects p ON p.project_id = r.project_id
                AND p.env_id = r.env_id AND p.business_id = r.business_id
            JOIN pds_accounts a ON a.account_id = p.account_id
                AND a.env_id = p.env_id AND a.business_id = p.business_id
            WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
              AND r.period >= date_trunc('year', CURRENT_DATE)::date
            GROUP BY a.region
            """,
            (env_id, business_id),
        )
        bva_rows = cur.fetchall()

    health_by_region: dict[str, dict[str, int]] = {}
    for r in health_rows:
        health_by_region.setdefault(r["region"], {})[r["health_status"]] = r["count"]

    bva_by_region: dict[str, float | None] = {}
    for r in bva_rows:
        budget = float(r["budget_total"] or 0)
        actual = float(r["actual_total"] or 0)
        bva_by_region[r["region"]] = round(actual / budget * 100, 2) if budget else None

    regions = []
    for r in revenue_rows:
        region = r["region"]
        regions.append({
            **dict(r),
            "health_distribution": health_by_region.get(region, {}),
            "budget_vs_actual_pct": bva_by_region.get(region),
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
    """Full account profile: P&L, project count, NPS trend, contract info."""
    with get_cursor() as cur:
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
    """Projects for an account: timeline, budget vs actual."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                p.project_id,
                p.project_name,
                p.status,
                p.start_date,
                p.planned_end_date AS end_date,
                p.percent_complete,
                p.fee_amount AS budget,
                COALESCE(act.actual_revenue, 0) AS actual_revenue,
                CASE WHEN p.fee_amount > 0
                     THEN ROUND(COALESCE(act.actual_revenue, 0)
                                / p.fee_amount * 100, 2)
                     ELSE NULL
                END AS budget_vs_actual_pct
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
    """RAG scoring across all accounts."""
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                h.account_id,
                h.account_name,
                {_HEALTH_STATUS_EXPR} AS health_status,
                h.nps_health AS satisfaction_rag,
                h.margin_health AS margin_rag,
                h.latest_nps,
                h.avg_margin,
                h.ytd_revenue
            FROM v_pds_account_health h
            WHERE h.env_id = %s::uuid AND h.business_id = %s::uuid
            ORDER BY h.latest_nps ASC NULLS LAST
            """,
            (env_id, business_id),
        )
        rows = cur.fetchall()

    return {"accounts": [dict(r) for r in rows]}
