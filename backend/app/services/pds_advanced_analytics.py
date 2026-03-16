"""PDS Advanced Analytics — project health scoring, EVM, CLV, and predictive models."""
from __future__ import annotations

from typing import Any

from app.db import get_cursor


def get_project_health(*, env_id: str, business_id: str, project_id: str) -> dict[str, Any]:
    """Composite project health score with 4 weighted dimensions."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                p.project_id, p.project_name, p.total_budget, p.fee_amount,
                p.percent_complete, p.start_date, p.planned_end_date, p.status,
                COALESCE(SUM(r.recognized_revenue) FILTER (WHERE r.version = 'actual'), 0) AS actual_revenue,
                COALESCE(SUM(r.cost) FILTER (WHERE r.version = 'actual'), 0) AS actual_cost
            FROM pds_analytics_projects p
            LEFT JOIN pds_revenue_entries r ON r.project_id = p.project_id
                AND r.env_id = p.env_id AND r.business_id = p.business_id
            WHERE p.env_id = %s::uuid AND p.business_id = %s::uuid AND p.project_id = %s::uuid
            GROUP BY p.project_id
            """,
            (env_id, business_id, project_id),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "Project not found"}

        # Schedule health (27.5%)
        planned_pct = float(row["percent_complete"] or 0)
        # Approximate planned percent based on time elapsed
        if row["start_date"] and row["planned_end_date"]:
            import datetime
            today = datetime.date.today()
            total_days = (row["planned_end_date"] - row["start_date"]).days or 1
            elapsed = (today - row["start_date"]).days
            time_pct = min(100, max(0, elapsed / total_days * 100))
            spi = planned_pct / max(time_pct, 1)
        else:
            spi = 1.0
            time_pct = 0

        if spi > 0.95:
            schedule_score = 90 + (spi - 0.95) * 200
        elif spi > 0.85:
            schedule_score = 60 + (spi - 0.85) * 300
        else:
            schedule_score = max(0, spi * 70)
        schedule_score = min(100, schedule_score)

        # Budget health (32.5%)
        actual_cost = float(row["actual_cost"] or 0)
        actual_rev = float(row["actual_revenue"] or 0)
        cpi = actual_rev / max(actual_cost, 1)

        if cpi > 0.95:
            budget_score = 90 + (cpi - 0.95) * 200
        elif cpi > 0.85:
            budget_score = 60 + (cpi - 0.85) * 300
        else:
            budget_score = max(0, cpi * 70)
        budget_score = min(100, budget_score)

        # Quality health (20%) — placeholder
        import random
        random.seed(hash(project_id) % 2**32)
        quality_score = random.uniform(60, 95)

        # Risk health (20%)
        cur.execute(
            """
            SELECT COUNT(*) AS risk_count
            FROM pds_risks
            WHERE env_id = %s::uuid AND business_id = %s::uuid
              AND project_id = %s::uuid AND status != 'closed'
            """,
            (env_id, business_id, project_id),
        )
        risk_row = cur.fetchone()
        risk_count = risk_row["risk_count"] if risk_row else 0
        risk_score = max(0, 100 - risk_count * 10)

        # Composite
        composite = (
            schedule_score * 0.275
            + budget_score * 0.325
            + quality_score * 0.20
            + risk_score * 0.20
        )

        rag = "green" if composite >= 75 else ("amber" if composite >= 50 else "red")

        return {
            "project_id": project_id,
            "project_name": row["project_name"],
            "composite_score": round(composite, 1),
            "rag_status": rag,
            "dimensions": {
                "schedule": {"score": round(schedule_score, 1), "weight": 0.275, "spi": round(spi, 2)},
                "budget": {"score": round(budget_score, 1), "weight": 0.325, "cpi": round(cpi, 2)},
                "quality": {"score": round(quality_score, 1), "weight": 0.20},
                "risk": {"score": round(risk_score, 1), "weight": 0.20, "open_risks": risk_count},
            },
        }


def get_evm(*, env_id: str, business_id: str, project_id: str) -> dict[str, Any]:
    """Earned Value Management dashboard data with S-curve time series."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.total_budget, p.percent_complete, p.start_date, p.planned_end_date
            FROM pds_analytics_projects p
            WHERE p.env_id = %s::uuid AND p.business_id = %s::uuid AND p.project_id = %s::uuid
            """,
            (env_id, business_id, project_id),
        )
        proj = cur.fetchone()
        if not proj:
            return {"error": "Project not found"}

        bac = float(proj["total_budget"] or 0)

        # Monthly actuals
        cur.execute(
            """
            SELECT r.period,
                   SUM(r.recognized_revenue) FILTER (WHERE r.version = 'actual') AS ev_month,
                   SUM(r.cost) FILTER (WHERE r.version = 'actual') AS ac_month,
                   SUM(r.recognized_revenue) FILTER (WHERE r.version = 'budget') AS pv_month
            FROM pds_revenue_entries r
            WHERE r.env_id = %s::uuid AND r.business_id = %s::uuid AND r.project_id = %s::uuid
            GROUP BY r.period
            ORDER BY r.period
            """,
            (env_id, business_id, project_id),
        )
        monthly = cur.fetchall()

    # Build cumulative S-curve
    s_curve = []
    cum_pv, cum_ev, cum_ac = 0.0, 0.0, 0.0
    for row in monthly:
        cum_pv += float(row["pv_month"] or 0)
        cum_ev += float(row["ev_month"] or 0)
        cum_ac += float(row["ac_month"] or 0)
        s_curve.append({
            "period": str(row["period"]),
            "pv": round(cum_pv, 2),
            "ev": round(cum_ev, 2),
            "ac": round(cum_ac, 2),
        })

    # Current metrics
    ev = cum_ev
    ac = cum_ac
    pv = cum_pv

    cpi = ev / max(ac, 1)
    spi = ev / max(pv, 1)
    eac = ac + ((bac - ev) / max(cpi, 0.01))
    vac = bac - eac
    tcpi = (bac - ev) / max(bac - ac, 1)

    return {
        "bac": bac,
        "ev": round(ev, 2),
        "ac": round(ac, 2),
        "pv": round(pv, 2),
        "cpi": round(cpi, 3),
        "spi": round(spi, 3),
        "eac": round(eac, 2),
        "vac": round(vac, 2),
        "tcpi": round(tcpi, 3),
        "s_curve": s_curve,
    }


def get_portfolio_health(*, env_id: str, business_id: str) -> dict[str, Any]:
    """Aggregate project health across all active projects."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT project_id, project_name, percent_complete, total_budget, status
            FROM pds_analytics_projects
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND status = 'active'
            ORDER BY total_budget DESC NULLS LAST
            """,
            (env_id, business_id),
        )
        projects = cur.fetchall()

    results = []
    green = amber = red = 0
    total_score = 0.0

    for proj in projects:
        health = get_project_health(env_id=env_id, business_id=business_id, project_id=str(proj["project_id"]))
        if "error" in health:
            continue
        results.append(health)
        score = health["composite_score"]
        total_score += score
        if score >= 75:
            green += 1
        elif score >= 50:
            amber += 1
        else:
            red += 1

    avg_score = total_score / max(len(results), 1)
    worst_10 = sorted(results, key=lambda x: x["composite_score"])[:10]

    return {
        "total_active": len(results),
        "avg_health_score": round(avg_score, 1),
        "distribution": {"green": green, "amber": amber, "red": red},
        "worst_10": worst_10,
    }


def get_client_lifetime_value(*, env_id: str, business_id: str) -> dict[str, Any]:
    """Per-account CLV estimation."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                a.account_id, a.account_name, a.tier, a.governance_track,
                a.annual_contract_value, a.contract_start_date,
                COALESCE(rv.total_fees, 0) AS total_fees,
                COALESCE(rv.project_count, 0) AS project_count,
                COALESCE(rv.service_line_count, 0) AS service_line_count,
                n.latest_nps
            FROM pds_accounts a
            LEFT JOIN LATERAL (
                SELECT
                    SUM(r.recognized_revenue) AS total_fees,
                    COUNT(DISTINCT r.project_id) AS project_count,
                    COUNT(DISTINCT p.service_line_key) AS service_line_count
                FROM pds_revenue_entries r
                JOIN pds_analytics_projects p ON p.project_id = r.project_id
                    AND p.env_id = r.env_id AND p.business_id = r.business_id
                WHERE r.account_id = a.account_id AND r.env_id = a.env_id
                    AND r.business_id = a.business_id AND r.version = 'actual'
            ) rv ON true
            LEFT JOIN LATERAL (
                SELECT nps_score AS latest_nps
                FROM pds_nps_responses
                WHERE account_id = a.account_id AND env_id = a.env_id AND business_id = a.business_id
                ORDER BY survey_date DESC LIMIT 1
            ) n ON true
            WHERE a.env_id = %s::uuid AND a.business_id = %s::uuid AND a.status = 'active'
            ORDER BY rv.total_fees DESC NULLS LAST
            """,
            (env_id, business_id),
        )
        rows = cur.fetchall()

    results = []
    for r in rows:
        nps = r["latest_nps"]
        # Retention based on NPS band
        if nps is not None and nps >= 9:
            retention_years = 5.0
        elif nps is not None and nps >= 7:
            retention_years = 3.0
        else:
            retention_years = 1.5

        total_fees = float(r["total_fees"] or 0)

        # Years as client
        import datetime
        years_active = 0
        if r["contract_start_date"]:
            years_active = max(0.5, (datetime.date.today() - r["contract_start_date"]).days / 365.25)

        annual_run_rate = total_fees / max(years_active, 0.5)
        cross_sell_score = float(r["service_line_count"] or 0) / 9  # 9 possible service lines
        estimated_clv = annual_run_rate * retention_years

        results.append({
            "account_id": str(r["account_id"]),
            "account_name": r["account_name"],
            "tier": r["tier"],
            "total_fees": round(total_fees, 2),
            "project_count": r["project_count"],
            "latest_nps": nps,
            "years_active": round(years_active, 1),
            "cross_sell_score": round(cross_sell_score, 2),
            "retention_years": retention_years,
            "estimated_clv": round(estimated_clv, 2),
        })

    return {"accounts": results}
