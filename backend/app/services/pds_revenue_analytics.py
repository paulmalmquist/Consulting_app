"""PDS Fee Revenue analytics service.

Queries pds_revenue_entries + pds_analytics_projects + pds_accounts
to produce time-series, variance, pipeline, portfolio, and mix data.
"""
from __future__ import annotations

from typing import Any

from app.db import get_cursor


def get_revenue_time_series(
    *,
    env_id: str,
    business_id: str,
    governance_track: str | None = None,
    versions: list[str] | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    service_line: str | None = None,
    region: str | None = None,
    account_id: str | None = None,
) -> dict[str, Any]:
    """Monthly revenue by version with optional filters."""
    clauses = ["r.env_id = %s::uuid", "r.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if governance_track and governance_track != "all":
        clauses.append("p.governance_track = %s")
        params.append(governance_track)
    if versions:
        clauses.append("r.version = ANY(%s)")
        params.append(versions)
    if date_from:
        clauses.append("r.period >= %s::date")
        params.append(date_from)
    if date_to:
        clauses.append("r.period <= %s::date")
        params.append(date_to)
    if service_line:
        clauses.append("p.service_line_key = %s")
        params.append(service_line)
    if region:
        clauses.append("p.market = %s")
        params.append(region)
    if account_id:
        clauses.append("r.account_id = %s::uuid")
        params.append(account_id)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                r.period,
                r.version,
                SUM(r.recognized_revenue) AS recognized_revenue,
                SUM(r.billed_revenue)     AS billed_revenue,
                SUM(r.cost)               AS cost,
                AVG(r.margin_pct)         AS avg_margin
            FROM pds_revenue_entries r
            JOIN pds_analytics_projects p ON p.project_id = r.project_id
                AND p.env_id = r.env_id AND p.business_id = r.business_id
            WHERE {where}
            GROUP BY r.period, r.version
            ORDER BY r.period, r.version
            """,
            params,
        )
        rows = cur.fetchall()

    return {"series": [dict(r) for r in rows]}


def get_revenue_variance(
    *,
    env_id: str,
    business_id: str,
    comparison: str = "budget_vs_actual",
    period_grain: str = "month",
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Compute variance between two revenue versions."""
    version_map = {
        "budget_vs_actual": ("budget", "actual"),
        "forecast_vs_actual": ("forecast_6_6", "actual"),
        "forecast_vs_budget": ("forecast_6_6", "budget"),
    }
    base_version, compare_version = version_map.get(comparison, ("budget", "actual"))

    date_clause = ""
    params: list[Any] = [env_id, business_id, base_version, env_id, business_id, compare_version]
    if date_from:
        date_clause += " AND period >= %s::date"
        params.append(date_from)
    if date_to:
        date_clause += " AND period <= %s::date"
        params.append(date_to)

    trunc_expr = "date_trunc('month', period)::date" if period_grain == "month" else (
        "date_trunc('quarter', period)::date" if period_grain == "quarter" else
        "date_trunc('year', period)::date"
    )

    with get_cursor() as cur:
        cur.execute(
            f"""
            WITH base AS (
                SELECT {trunc_expr} AS period_bucket,
                       SUM(recognized_revenue) AS revenue
                FROM pds_revenue_entries
                WHERE env_id = %s::uuid AND business_id = %s::uuid AND version = %s
                {date_clause}
                GROUP BY 1
            ),
            comp AS (
                SELECT {trunc_expr} AS period_bucket,
                       SUM(recognized_revenue) AS revenue
                FROM pds_revenue_entries
                WHERE env_id = %s::uuid AND business_id = %s::uuid AND version = %s
                {date_clause}
                GROUP BY 1
            )
            SELECT
                COALESCE(b.period_bucket, c.period_bucket) AS period,
                b.revenue AS base_revenue,
                c.revenue AS compare_revenue,
                COALESCE(c.revenue, 0) - COALESCE(b.revenue, 0) AS variance_amount,
                CASE WHEN COALESCE(b.revenue, 0) != 0
                     THEN ROUND((COALESCE(c.revenue, 0) - b.revenue) / b.revenue * 100, 2)
                     ELSE NULL
                END AS variance_pct
            FROM base b
            FULL OUTER JOIN comp c ON c.period_bucket = b.period_bucket
            ORDER BY 1
            """,
            params,
        )
        rows = cur.fetchall()

    return {
        "comparison": comparison,
        "base_version": base_version,
        "compare_version": compare_version,
        "data": [dict(r) for r in rows],
    }


def get_pipeline(*, env_id: str, business_id: str) -> dict[str, Any]:
    """Variable-track pipeline funnel with weighted values."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                p.status,
                COUNT(*) AS deal_count,
                SUM(p.fee_amount) AS total_value
            FROM pds_analytics_projects p
            WHERE p.env_id = %s::uuid AND p.business_id = %s::uuid
              AND p.governance_track = 'variable'
            GROUP BY p.status
            """,
            (env_id, business_id),
        )
        rows = cur.fetchall()

    stage_weights = {
        "active": 0.57,       # "Shortlisted" equivalent
        "on_hold": 0.32,      # "Proposal" equivalent
        "cancelled": 0.12,    # "Prospect" equivalent
        "completed": 1.0,     # "Signed"
    }

    stages = []
    for r in rows:
        status = r["status"]
        weight = stage_weights.get(status, 0.5)
        total_val = float(r["total_value"] or 0)
        stages.append({
            "stage": status,
            "count": int(r["deal_count"]),           # frontend expects "count"
            "deal_count": int(r["deal_count"]),       # keep for backwards compat
            "weighted_value": round(total_val * weight, 2),
            "unweighted_value": round(total_val, 2),  # frontend expects "unweighted_value"
            "total_value": total_val,                  # keep for backwards compat
            "weight": weight,
        })

    total_weighted = sum(s["weighted_value"] for s in stages)
    # Pipeline coverage ratio = weighted pipeline ÷ signed/completed value
    signed_value = sum(s["total_value"] for s in stages if s["stage"] == "completed")
    coverage = round(total_weighted / max(signed_value, 1), 2)

    return {"stages": stages, "total_weighted": total_weighted, "coverage_ratio": coverage}


def get_dedicated_portfolio(*, env_id: str, business_id: str) -> dict[str, Any]:
    """Dedicated-track account portfolio with contract details."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                a.account_id,
                a.account_name,
                a.annual_contract_value,
                a.contract_start_date,
                a.contract_end_date,
                COALESCE(rv.monthly_run_rate, 0) AS monthly_run_rate,
                COALESCE(rv.ytd_revenue, 0) AS ytd_revenue
            FROM pds_accounts a
            LEFT JOIN LATERAL (
                SELECT
                    AVG(r.recognized_revenue) AS monthly_run_rate,
                    SUM(r.recognized_revenue) AS ytd_revenue
                FROM pds_revenue_entries r
                JOIN pds_analytics_projects p ON p.project_id = r.project_id
                    AND p.env_id = r.env_id AND p.business_id = r.business_id
                WHERE p.account_id = a.account_id
                  AND r.env_id = a.env_id AND r.business_id = a.business_id
                  AND r.version = 'actual'
                  AND r.period >= date_trunc('year', CURRENT_DATE)::date
            ) rv ON true
            WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid
              AND a.governance_track = 'dedicated'
              AND a.status = 'active'
            ORDER BY a.annual_contract_value DESC NULLS LAST
            """,
            (env_id, business_id),
        )
        rows = cur.fetchall()

    return {"accounts": [dict(r) for r in rows]}


def get_revenue_waterfall(
    *,
    env_id: str,
    business_id: str,
    period_grain: str = "month",
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Revenue recognition waterfall: backlog → recognized → billed → collected."""
    params: list[Any] = [env_id, business_id]
    date_clause = ""
    if date_from:
        date_clause += " AND r.period >= %s::date"
        params.append(date_from)
    if date_to:
        date_clause += " AND r.period <= %s::date"
        params.append(date_to)

    trunc_expr = "date_trunc('month', r.period)::date" if period_grain == "month" else (
        "date_trunc('quarter', r.period)::date" if period_grain == "quarter" else
        "date_trunc('year', r.period)::date"
    )

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                {trunc_expr} AS period,
                SUM(r.backlog) AS backlog,
                SUM(r.recognized_revenue) AS recognized,
                SUM(r.billed_revenue) AS billed,
                SUM(r.unbilled_revenue) AS unbilled,
                SUM(r.deferred_revenue) AS deferred
            FROM pds_revenue_entries r
            WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
              AND r.version = 'actual'
              {date_clause}
            GROUP BY 1
            ORDER BY 1
            """,
            params,
        )
        rows = cur.fetchall()

    return {"waterfall": [dict(r) for r in rows]}


def get_revenue_mix(
    *,
    env_id: str,
    business_id: str,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Variable vs dedicated revenue mix over time."""
    params: list[Any] = [env_id, business_id]
    date_clause = ""
    if date_from:
        date_clause += " AND r.period >= %s::date"
        params.append(date_from)
    if date_to:
        date_clause += " AND r.period <= %s::date"
        params.append(date_to)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                r.period,
                p.governance_track,
                SUM(r.recognized_revenue) AS revenue
            FROM pds_revenue_entries r
            JOIN pds_analytics_projects p ON p.project_id = r.project_id
                AND p.env_id = r.env_id AND p.business_id = r.business_id
            WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid
              AND r.version = 'actual'
              AND p.governance_track IS NOT NULL
              {date_clause}
            GROUP BY r.period, p.governance_track
            ORDER BY r.period, p.governance_track
            """,
            params,
        )
        rows = cur.fetchall()

    return {"mix": [dict(r) for r in rows]}
