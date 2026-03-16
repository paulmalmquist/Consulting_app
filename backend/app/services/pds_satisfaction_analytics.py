"""PDS Client Satisfaction analytics service.

Queries pds_nps_responses + pds_accounts + v_pds_nps_summary
to produce NPS summary, driver analysis, per-account satisfaction,
verbatim comments, and at-risk identification.
"""
from __future__ import annotations

from typing import Any

from app.db import get_cursor

# The 8 satisfaction dimensions scored in each NPS response
_DIMENSIONS = [
    "schedule_adherence",
    "budget_management",
    "communication_quality",
    "team_responsiveness",
    "problem_resolution",
    "vendor_management",
    "safety_performance",
    "innovation_value_engineering",
]


# ---------------------------------------------------------------------------
# GET /nps-summary
# ---------------------------------------------------------------------------

def get_nps_summary(
    *,
    env_id: str,
    business_id: str,
    account_id: str | None = None,
    region: str | None = None,
    governance_track: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Quarterly NPS = %Promoters - %Detractors."""
    clauses = ["n.env_id = %s::uuid", "n.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if account_id:
        clauses.append("n.account_id = %s::uuid")
        params.append(account_id)
    if region:
        clauses.append("a.region = %s")
        params.append(region)
    if governance_track and governance_track != "all":
        clauses.append("a.governance_track = %s")
        params.append(governance_track)
    if date_from:
        clauses.append("n.survey_date >= %s::date")
        params.append(date_from)
    if date_to:
        clauses.append("n.survey_date <= %s::date")
        params.append(date_to)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                date_trunc('quarter', n.survey_date)::date AS quarter,
                COUNT(*) AS response_count,
                ROUND(
                    SUM(CASE WHEN n.nps_score >= 9 THEN 1 ELSE 0 END)::numeric
                    / NULLIF(COUNT(*), 0) * 100, 2
                ) AS promoter_pct,
                ROUND(
                    SUM(CASE WHEN n.nps_score <= 6 THEN 1 ELSE 0 END)::numeric
                    / NULLIF(COUNT(*), 0) * 100, 2
                ) AS detractor_pct,
                ROUND(
                    (SUM(CASE WHEN n.nps_score >= 9 THEN 1 ELSE 0 END)
                     - SUM(CASE WHEN n.nps_score <= 6 THEN 1 ELSE 0 END))::numeric
                    / NULLIF(COUNT(*), 0) * 100, 2
                ) AS nps
            FROM pds_nps_responses n
            JOIN pds_accounts a
                ON a.account_id = n.account_id
                AND a.env_id = n.env_id AND a.business_id = n.business_id
            WHERE {where}
            GROUP BY date_trunc('quarter', n.survey_date)
            ORDER BY quarter
            """,
            params,
        )
        rows = cur.fetchall()

    return {"nps_quarterly": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# GET /drivers
# ---------------------------------------------------------------------------

def get_drivers(
    *,
    env_id: str,
    business_id: str,
    account_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Key driver analysis across 8 satisfaction dimensions."""
    clauses = ["n.env_id = %s::uuid", "n.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if account_id:
        clauses.append("n.account_id = %s::uuid")
        params.append(account_id)
    if date_from:
        clauses.append("n.survey_date >= %s::date")
        params.append(date_from)
    if date_to:
        clauses.append("n.survey_date <= %s::date")
        params.append(date_to)

    where = " AND ".join(clauses)

    # Build column expressions for each dimension
    dim_avgs = ", ".join(
        f"AVG(n.{d}) AS avg_{d}" for d in _DIMENSIONS
    )
    # Approximate correlation: corr(dimension, overall_satisfaction)
    dim_corrs = ", ".join(
        f"ROUND(CORR(n.{d}, n.overall_satisfaction)::numeric, 4) AS corr_{d}"
        for d in _DIMENSIONS
    )

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                AVG(n.overall_satisfaction) AS avg_overall,
                COUNT(*) AS response_count,
                {dim_avgs},
                {dim_corrs}
            FROM pds_nps_responses n
            WHERE {where}
            """,
            params,
        )
        row = cur.fetchone()

    if not row:
        return {"drivers": [], "avg_overall": None}

    r = dict(row)
    drivers = []
    for d in _DIMENSIONS:
        drivers.append({
            "dimension": d,
            "avg_score": float(r.get(f"avg_{d}") or 0),
            "correlation": float(r.get(f"corr_{d}") or 0),
        })

    # Rank by absolute correlation descending
    drivers.sort(key=lambda x: abs(x["correlation"]), reverse=True)
    for rank, drv in enumerate(drivers, 1):
        drv["importance_rank"] = rank

    return {
        "avg_overall": float(r["avg_overall"] or 0),
        "response_count": r["response_count"],
        "drivers": drivers,
    }


# ---------------------------------------------------------------------------
# GET /by-account
# ---------------------------------------------------------------------------

def get_by_account(
    *,
    env_id: str,
    business_id: str,
    region: str | None = None,
) -> dict[str, Any]:
    """Per-account: latest NPS, overall_satisfaction avg, lowest dimension, etc."""
    clauses = ["v.env_id = %s::uuid", "v.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if region:
        clauses.append("a.region = %s")
        params.append(region)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            WITH latest AS (
                SELECT
                    n.account_id,
                    AVG(n.overall_satisfaction) AS avg_satisfaction,
                    COUNT(*) AS response_count,
                    MAX(n.survey_date) AS last_survey_date,
                    {', '.join(f'AVG(n.{d}) AS avg_{d}' for d in _DIMENSIONS)}
                FROM pds_nps_responses n
                WHERE n.env_id = %s::uuid AND n.business_id = %s::uuid
                GROUP BY n.account_id
            )
            SELECT
                a.account_id,
                a.account_name,
                v.nps,
                latest.avg_satisfaction,
                latest.response_count,
                latest.last_survey_date,
                {', '.join(f'latest.avg_{d}' for d in _DIMENSIONS)}
            FROM v_pds_nps_summary v
            JOIN pds_accounts a
                ON a.account_id = v.account_id
                AND a.env_id = v.env_id AND a.business_id = v.business_id
            JOIN latest ON latest.account_id = v.account_id
            WHERE {where}
            ORDER BY v.nps ASC
            """,
            [env_id, business_id] + params,
        )
        rows = cur.fetchall()

    accounts = []
    for r in rows:
        rd = dict(r)
        # Find lowest-scoring dimension
        lowest_dim = None
        lowest_score = None
        for d in _DIMENSIONS:
            score = rd.get(f"avg_{d}")
            if score is not None and (lowest_score is None or float(score) < lowest_score):
                lowest_score = float(score)
                lowest_dim = d
        accounts.append({
            "account_id": rd["account_id"],
            "account_name": rd["account_name"],
            "nps": rd["nps"],
            "avg_satisfaction": rd["avg_satisfaction"],
            "lowest_dimension": lowest_dim,
            "lowest_dimension_score": lowest_score,
            "response_count": rd["response_count"],
            "last_survey_date": rd["last_survey_date"],
        })

    return {"accounts": accounts}


# ---------------------------------------------------------------------------
# GET /verbatims
# ---------------------------------------------------------------------------

def get_verbatims(
    *,
    env_id: str,
    business_id: str,
    account_id: str | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Open-text comments with NPS score, account, project, date."""
    clauses = [
        "n.env_id = %s::uuid",
        "n.business_id = %s::uuid",
        "n.comment IS NOT NULL",
        "n.comment != ''",
    ]
    params: list[Any] = [env_id, business_id]

    if account_id:
        clauses.append("n.account_id = %s::uuid")
        params.append(account_id)
    if search:
        clauses.append("n.comment ILIKE %s")
        params.append(f"%%{search}%%")
    if date_from:
        clauses.append("n.survey_date >= %s::date")
        params.append(date_from)
    if date_to:
        clauses.append("n.survey_date <= %s::date")
        params.append(date_to)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                n.response_id,
                n.nps_score,
                n.overall_satisfaction,
                n.comment,
                n.survey_date,
                a.account_name,
                n.account_id,
                n.project_id
            FROM pds_nps_responses n
            JOIN pds_accounts a
                ON a.account_id = n.account_id
                AND a.env_id = n.env_id AND a.business_id = n.business_id
            WHERE {where}
            ORDER BY n.survey_date DESC
            LIMIT 200
            """,
            params,
        )
        rows = cur.fetchall()

    return {"verbatims": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# GET /at-risk
# ---------------------------------------------------------------------------

def get_at_risk(
    *,
    env_id: str,
    business_id: str,
) -> dict[str, Any]:
    """Accounts where NPS < 0 or overall_satisfaction < 3.0."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                a.account_id,
                a.account_name,
                a.region,
                a.governance_track,
                v.nps,
                v.avg_satisfaction,
                v.response_count,
                v.last_survey_date,
                CASE
                    WHEN v.nps < 0 AND v.avg_satisfaction < 3.0 THEN 'critical'
                    WHEN v.nps < 0 THEN 'nps_negative'
                    ELSE 'low_satisfaction'
                END AS risk_reason
            FROM v_pds_nps_summary v
            JOIN pds_accounts a
                ON a.account_id = v.account_id
                AND a.env_id = v.env_id AND a.business_id = v.business_id
            WHERE v.env_id = %s::uuid AND v.business_id = %s::uuid
              AND (v.nps < 0 OR v.avg_satisfaction < 3.0)
            ORDER BY v.nps ASC, v.avg_satisfaction ASC
            """,
            (env_id, business_id),
        )
        rows = cur.fetchall()

    return {"at_risk": [dict(r) for r in rows]}
