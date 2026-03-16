"""PDS Technology Adoption analytics service.

Queries pds_technology_adoption + pds_nps_responses + pds_accounts
to produce adoption overview, per-account health, composite health scores,
and adoption trend time-series.
"""
from __future__ import annotations

from typing import Any

from app.db import get_cursor

# Health score weights
_W_PRODUCT_USAGE = 0.35
_W_NPS = 0.20
_W_PRODUCT_SETUP = 0.20
_W_CSM_QUALITATIVE = 0.25
_CSM_DEFAULT = 70  # default qualitative score when unavailable


def _health_rag(score: float) -> str:
    """Map composite health score (0-100) to RAG."""
    if score >= 80:
        return "green"
    if score >= 60:
        return "yellow"
    return "red"


# ---------------------------------------------------------------------------
# GET /overview
# ---------------------------------------------------------------------------

def get_overview(
    *,
    env_id: str,
    business_id: str,
    account_id: str | None = None,
    tool_name: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Per-tool aggregated metrics."""
    clauses = ["t.env_id = %s::uuid", "t.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if account_id:
        clauses.append("t.account_id = %s::uuid")
        params.append(account_id)
    if tool_name:
        clauses.append("t.tool_name = %s")
        params.append(tool_name)
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
                t.tool_name,
                SUM(t.licensed_users)    AS total_licensed,
                SUM(t.active_users)      AS total_active,
                CASE
                    WHEN SUM(t.licensed_users) > 0
                    THEN ROUND(SUM(t.active_users)::numeric
                               / SUM(t.licensed_users) * 100, 2)
                    ELSE 0
                END AS adoption_rate,
                ROUND(AVG(CASE WHEN t.mau > 0 THEN t.dau::numeric / t.mau ELSE NULL END), 4) AS avg_dau_mau_ratio,
                ROUND(AVG(CASE WHEN t.features_available > 0 THEN t.features_adopted::numeric / t.features_available * 100 ELSE NULL END), 2) AS avg_feature_adoption
            FROM pds_technology_adoption t
            WHERE {where}
            GROUP BY t.tool_name
            ORDER BY adoption_rate DESC
            """,
            params,
        )
        rows = cur.fetchall()

    return {"tools": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# GET /by-account
# ---------------------------------------------------------------------------

def get_by_account(
    *,
    env_id: str,
    business_id: str,
    account_id: str | None = None,
) -> dict[str, Any]:
    """Per-account technology health summary."""
    clauses = ["t.env_id = %s::uuid", "t.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if account_id:
        clauses.append("t.account_id = %s::uuid")
        params.append(account_id)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                a.account_id,
                a.account_name,
                COUNT(DISTINCT t.tool_name) AS tools_deployed,
                CASE
                    WHEN SUM(t.licensed_users) > 0
                    THEN ROUND(SUM(t.active_users)::numeric
                               / SUM(t.licensed_users) * 100, 2)
                    ELSE 0
                END AS avg_adoption_rate,
                ROUND(AVG(CASE WHEN t.mau > 0 THEN t.dau::numeric / t.mau ELSE NULL END), 4) AS avg_dau_mau_ratio,
                ROUND(AVG(CASE WHEN t.features_available > 0 THEN t.features_adopted::numeric / t.features_available * 100 ELSE NULL END), 2) AS feature_breadth_score,
                ROUND(AVG(t.onboarding_completion_pct)::numeric, 2) AS onboarding_completion_avg
            FROM pds_technology_adoption t
            JOIN pds_accounts a
                ON a.account_id = t.account_id
                AND a.env_id = t.env_id AND a.business_id = t.business_id
            WHERE {where}
            GROUP BY a.account_id, a.account_name
            ORDER BY avg_adoption_rate DESC
            """,
            params,
        )
        rows = cur.fetchall()

    return {"accounts": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# GET /health-score
# ---------------------------------------------------------------------------

def get_health_score(
    *,
    env_id: str,
    business_id: str,
    account_id: str | None = None,
) -> dict[str, Any]:
    """Composite health score per account (0-100, RAG).

    Weighted: product_usage 35%, nps 20%, product_setup 20%, csm_qualitative 25%.
    """
    clauses = ["t.env_id = %s::uuid", "t.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if account_id:
        clauses.append("t.account_id = %s::uuid")
        params.append(account_id)

    where = " AND ".join(clauses)

    with get_cursor() as cur:
        # Product usage + setup scores from adoption table
        cur.execute(
            f"""
            SELECT
                t.account_id,
                a.account_name,
                CASE
                    WHEN SUM(t.licensed_users) > 0
                    THEN ROUND(SUM(t.active_users)::numeric
                               / SUM(t.licensed_users) * 100, 2)
                    ELSE 0
                END AS product_usage_score,
                ROUND(AVG(t.onboarding_completion_pct)::numeric, 2) AS product_setup_score
            FROM pds_technology_adoption t
            JOIN pds_accounts a
                ON a.account_id = t.account_id
                AND a.env_id = t.env_id AND a.business_id = t.business_id
            WHERE {where}
            GROUP BY t.account_id, a.account_name
            """,
            params,
        )
        adoption_rows = cur.fetchall()

        # NPS scores per account
        cur.execute(
            """
            SELECT
                account_id,
                nps
            FROM v_pds_nps_summary
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            """,
            (env_id, business_id),
        )
        nps_rows = cur.fetchall()

    nps_map: dict[str, float] = {}
    for r in nps_rows:
        # Normalize NPS (-100..100) to 0-100 scale
        raw = float(r["nps"] or 0)
        nps_map[str(r["account_id"])] = round((raw + 100) / 2, 2)

    scores = []
    for r in adoption_rows:
        acct_id = str(r["account_id"])
        usage = min(float(r["product_usage_score"] or 0), 100)
        setup = min(float(r["product_setup_score"] or 0), 100)
        nps_norm = nps_map.get(acct_id, 50)  # default to neutral
        csm = _CSM_DEFAULT

        composite = round(
            usage * _W_PRODUCT_USAGE
            + nps_norm * _W_NPS
            + setup * _W_PRODUCT_SETUP
            + csm * _W_CSM_QUALITATIVE,
            2,
        )

        scores.append({
            "account_id": r["account_id"],
            "account_name": r["account_name"],
            "product_usage_score": usage,
            "nps_score_normalized": nps_norm,
            "product_setup_score": setup,
            "csm_qualitative_score": csm,
            "composite_score": composite,
            "rag": _health_rag(composite),
        })

    scores.sort(key=lambda x: x["composite_score"], reverse=True)
    return {"health_scores": scores}


# ---------------------------------------------------------------------------
# GET /trends
# ---------------------------------------------------------------------------

def get_trends(
    *,
    env_id: str,
    business_id: str,
    tool_name: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """Monthly time series per tool: dau_mau_ratio, active_users, feature_adoption."""
    clauses = ["t.env_id = %s::uuid", "t.business_id = %s::uuid"]
    params: list[Any] = [env_id, business_id]

    if tool_name:
        clauses.append("t.tool_name = %s")
        params.append(tool_name)
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
                t.tool_name,
                t.period,
                SUM(t.active_users) AS active_users,
                ROUND(AVG(CASE WHEN t.mau > 0 THEN t.dau::numeric / t.mau ELSE NULL END), 4) AS dau_mau_ratio,
                ROUND(AVG(CASE WHEN t.features_available > 0 THEN t.features_adopted::numeric / t.features_available * 100 ELSE NULL END), 2) AS feature_adoption
            FROM pds_technology_adoption t
            WHERE {where}
            GROUP BY t.tool_name, t.period
            ORDER BY t.tool_name, t.period
            """,
            params,
        )
        rows = cur.fetchall()

    return {"trends": [dict(r) for r in rows]}
