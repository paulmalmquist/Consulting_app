"""PDS Utilization analytics service.

Queries pds_analytics_timecards + pds_analytics_employees + pds_analytics_assignments
to produce utilization summary, heatmap, capacity-demand, bench, and distribution data.
"""
from __future__ import annotations

from typing import Any

from app.db import get_cursor

# ---------------------------------------------------------------------------
# Role-adjusted utilization targets (midpoint of band)
# ---------------------------------------------------------------------------
_ROLE_TARGETS: dict[str, tuple[float, float]] = {
    "junior":         (80, 90),
    "mid":            (75, 85),
    "senior_manager": (65, 75),
    "director":       (50, 65),
    "executive":      (40, 50),
}

# Available hours multiplier: weeks × weekly hours × billable fraction
_AVAIL_FACTOR = 4.33 * 0.90  # applied to standard_hours_per_week


def _rag_color(pct: float) -> str:
    """Map utilization percentage to RAG color."""
    if pct < 50:
        return "gray"
    if pct < 70:
        return "yellow"
    if pct < 90:
        return "green"
    if pct <= 110:
        return "orange"
    return "red"


# ---------------------------------------------------------------------------
# GET /summary
# ---------------------------------------------------------------------------

def get_utilization_summary(
    *,
    env_id: str,
    business_id: str,
    region: str | None = None,
    role_level: str | None = None,
    governance_track: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Aggregated utilization by month."""
    clauses = ["t.env_id = %s::uuid", "t.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if region:
        clauses.append("e.region = %s")
        params.append(region)
    if role_level:
        clauses.append("e.role_level = %s")
        params.append(role_level)
    if governance_track and governance_track != "all":
        clauses.append("t.governance_track = %s")
        params.append(governance_track)
    if date_from:
        clauses.append("t.period >= %s::date")
        params.append(date_from)
    if date_to:
        clauses.append("t.period <= %s::date")
        params.append(date_to)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                t.period,
                COUNT(DISTINCT t.employee_id)            AS headcount,
                SUM(t.billable_hours)                    AS total_billable,
                SUM(e.standard_hours_per_week * {_AVAIL_FACTOR}) AS total_available,
                CASE
                    WHEN SUM(e.standard_hours_per_week * {_AVAIL_FACTOR}) > 0
                    THEN ROUND(
                        SUM(t.billable_hours)
                        / SUM(e.standard_hours_per_week * {_AVAIL_FACTOR}) * 100, 2
                    )
                    ELSE 0
                END AS utilization_pct
            FROM pds_analytics_timecards t
            JOIN pds_analytics_employees e
                ON e.employee_id = t.employee_id
                AND e.env_id = t.env_id AND e.business_id = t.business_id
            WHERE {where}
            GROUP BY t.period
            ORDER BY t.period
            """,
            params,
        )
        rows = cur.fetchall()

    return {"summary": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# GET /heatmap
# ---------------------------------------------------------------------------

def get_utilization_heatmap(
    *,
    env_id: str,
    business_id: str,
    region: str | None = None,
    role_level: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Employee x month matrix with utilization_pct and RAG status."""
    clauses = ["t.env_id = %s::uuid", "t.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if region:
        clauses.append("e.region = %s")
        params.append(region)
    if role_level:
        clauses.append("e.role_level = %s")
        params.append(role_level)
    if date_from:
        clauses.append("t.period >= %s::date")
        params.append(date_from)
    if date_to:
        clauses.append("t.period <= %s::date")
        params.append(date_to)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                e.employee_id,
                e.employee_name,
                e.role_level,
                t.period,
                SUM(t.billable_hours) AS billable_hours,
                e.standard_hours_per_week * {_AVAIL_FACTOR} AS available_hours,
                CASE
                    WHEN e.standard_hours_per_week * {_AVAIL_FACTOR} > 0
                    THEN ROUND(
                        SUM(t.billable_hours)
                        / (e.standard_hours_per_week * {_AVAIL_FACTOR}) * 100, 2
                    )
                    ELSE 0
                END AS utilization_pct
            FROM pds_analytics_timecards t
            JOIN pds_analytics_employees e
                ON e.employee_id = t.employee_id
                AND e.env_id = t.env_id AND e.business_id = t.business_id
            WHERE {where}
            GROUP BY e.employee_id, e.employee_name, e.role_level,
                     e.standard_hours_per_week, t.period
            ORDER BY e.employee_name, t.period
            """,
            params,
        )
        rows = cur.fetchall()

    cells = []
    for r in rows:
        pct = float(r["utilization_pct"] or 0)
        role = r["role_level"] or "mid"
        target_low, target_high = _ROLE_TARGETS.get(role, (75, 85))
        cells.append({
            **dict(r),
            "color": _rag_color(pct),
            "target_low": target_low,
            "target_high": target_high,
        })

    return {"heatmap": cells}


# ---------------------------------------------------------------------------
# GET /capacity-demand
# ---------------------------------------------------------------------------

def get_capacity_demand(
    *,
    env_id: str,
    business_id: str,
    region: str | None = None,
    months_ahead: int = 6,
) -> dict[str, Any]:
    """Supply vs demand for rolling months ahead."""
    clauses = ["e.env_id = %s::uuid", "e.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if region:
        clauses.append("e.region = %s")
        params.append(region)

    where_emp = " AND ".join(clauses)

    # Reuse same base params for assignments query
    assign_clauses = ["a.env_id = %s::uuid", "a.business_id = %s::uuid"]
    assign_params: list[Any] = [env_id, business_id, months_ahead]

    if region:
        assign_clauses.append("e2.region = %s")
        assign_params.append(region)

    where_assign = " AND ".join(assign_clauses)

    with get_cursor() as cur:
        # Supply: headcount x standard hours per month
        cur.execute(
            f"""
            SELECT
                gs.month::date AS month,
                COUNT(DISTINCT e.employee_id) AS headcount,
                SUM(e.standard_hours_per_week * {_AVAIL_FACTOR}) AS supply_hours
            FROM pds_analytics_employees e
            CROSS JOIN generate_series(
                date_trunc('month', CURRENT_DATE),
                date_trunc('month', CURRENT_DATE) + (interval '1 month' * %s),
                interval '1 month'
            ) AS gs(month)
            WHERE {where_emp}
              AND e.status = 'active'
            GROUP BY gs.month
            ORDER BY gs.month
            """,
            params + [months_ahead],
        )
        supply_rows = cur.fetchall()

        # Demand: confirmed assignments + pipeline-weighted
        cur.execute(
            f"""
            SELECT
                gs.month::date AS month,
                SUM(
                    CASE WHEN a.status = 'confirmed'
                         THEN a.allocated_hours
                         ELSE a.allocated_hours * COALESCE(a.pipeline_weight, 0.5)
                    END
                ) AS demand_hours
            FROM pds_analytics_assignments a
            LEFT JOIN pds_analytics_employees e2
                ON e2.employee_id = a.employee_id
                AND e2.env_id = a.env_id AND e2.business_id = a.business_id
            CROSS JOIN generate_series(
                date_trunc('month', CURRENT_DATE),
                date_trunc('month', CURRENT_DATE) + (interval '1 month' * %s),
                interval '1 month'
            ) AS gs(month)
            WHERE {where_assign}
              AND a.start_date <= (gs.month + interval '1 month')
              AND a.end_date >= gs.month
            GROUP BY gs.month
            ORDER BY gs.month
            """,
            assign_params,
        )
        demand_rows = cur.fetchall()

    supply_map = {str(r["month"]): dict(r) for r in supply_rows}
    demand_map = {str(r["month"]): dict(r) for r in demand_rows}

    months = sorted(set(supply_map.keys()) | set(demand_map.keys()))
    forecast = []
    for m in months:
        s = supply_map.get(m, {})
        d = demand_map.get(m, {})
        supply_h = float(s.get("supply_hours", 0) or 0)
        demand_h = float(d.get("demand_hours", 0) or 0)
        forecast.append({
            "month": m,
            "headcount": s.get("headcount", 0),
            "supply_hours": supply_h,
            "demand_hours": demand_h,
            "gap_hours": round(supply_h - demand_h, 2),
            "gap_pct": round((supply_h - demand_h) / max(supply_h, 1) * 100, 2),
        })

    return {"forecast": forecast}


# ---------------------------------------------------------------------------
# GET /bench
# ---------------------------------------------------------------------------

def get_bench(
    *,
    env_id: str,
    business_id: str,
    region: str | None = None,
    role_level: str | None = None,
) -> dict[str, Any]:
    """Employees with total allocation_pct < 50% or no active assignments."""
    clauses = ["e.env_id = %s::uuid", "e.business_id = %s::uuid", "e.status = 'active'"]
    params: list[Any] = [env_id, business_id]

    if region:
        clauses.append("e.region = %s")
        params.append(region)
    if role_level:
        clauses.append("e.role_level = %s")
        params.append(role_level)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                e.employee_id,
                e.employee_name,
                e.role_level,
                e.region,
                COALESCE(alloc.total_allocation_pct, 0) AS allocation_pct,
                ROUND(100 - COALESCE(alloc.total_allocation_pct, 0), 2) AS availability_pct,
                alloc.assignment_count
            FROM pds_analytics_employees e
            LEFT JOIN LATERAL (
                SELECT
                    SUM(a.allocation_pct) AS total_allocation_pct,
                    COUNT(*) AS assignment_count
                FROM pds_analytics_assignments a
                WHERE a.employee_id = e.employee_id
                  AND a.env_id = e.env_id AND a.business_id = e.business_id
                  AND a.status = 'confirmed'
                  AND a.start_date <= CURRENT_DATE
                  AND a.end_date >= CURRENT_DATE
            ) alloc ON true
            WHERE {where}
              AND COALESCE(alloc.total_allocation_pct, 0) < 50
            ORDER BY COALESCE(alloc.total_allocation_pct, 0) ASC
            """,
            params,
        )
        rows = cur.fetchall()

    return {"bench": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# GET /distribution
# ---------------------------------------------------------------------------

def get_utilization_distribution(
    *,
    env_id: str,
    business_id: str,
    region: str | None = None,
    role_level: str | None = None,
) -> dict[str, Any]:
    """Histogram bins of utilization for current and trailing 3 months."""
    clauses = ["t.env_id = %s::uuid", "t.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if region:
        clauses.append("e.region = %s")
        params.append(region)
    if role_level:
        clauses.append("e.role_level = %s")
        params.append(role_level)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            WITH employee_util AS (
                SELECT
                    t.employee_id,
                    t.period,
                    CASE
                        WHEN e.standard_hours_per_week * {_AVAIL_FACTOR} > 0
                        THEN SUM(t.billable_hours)
                             / (e.standard_hours_per_week * {_AVAIL_FACTOR}) * 100
                        ELSE 0
                    END AS utilization_pct
                FROM pds_analytics_timecards t
                JOIN pds_analytics_employees e
                    ON e.employee_id = t.employee_id
                    AND e.env_id = t.env_id AND e.business_id = t.business_id
                WHERE {where}
                  AND t.period >= (date_trunc('month', CURRENT_DATE) - interval '3 months')::date
                GROUP BY t.employee_id, t.period, e.standard_hours_per_week
            ),
            binned AS (
                SELECT
                    period,
                    LEAST(FLOOR(utilization_pct / 10) * 10, 110) AS bin_floor,
                    COUNT(*) AS employee_count
                FROM employee_util
                GROUP BY period, LEAST(FLOOR(utilization_pct / 10) * 10, 110)
            )
            SELECT
                period,
                bin_floor,
                CASE
                    WHEN bin_floor >= 110 THEN '110%%+'
                    ELSE bin_floor::int || '%%–' || (bin_floor::int + 10) || '%%'
                END AS bin_label,
                employee_count
            FROM binned
            ORDER BY period, bin_floor
            """,
            params,
        )
        rows = cur.fetchall()

    return {"distribution": [dict(r) for r in rows]}
