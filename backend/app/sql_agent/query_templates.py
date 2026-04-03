"""Deterministic query templates — parameterized SQL for common business questions.

When a template matches, skip the LLM entirely.  This is faster, cheaper,
and produces perfectly reproducible SQL every time.

Each template declares:
  - key: stable identifier (domain.name)
  - description: human-readable explanation
  - sql: parameterized SQL (psycopg %(name)s style)
  - required_params: parameters the caller must supply
  - optional_params: parameters that refine the query
  - default_chart: preferred visualization
  - query_type: the QueryType it serves
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.sql_agent.query_classifier import QueryType


@dataclass(frozen=True)
class QueryTemplate:
    key: str
    description: str
    sql: str
    required_params: frozenset[str]
    optional_params: frozenset[str] = frozenset()
    default_chart: str | None = None  # "line" | "bar" | "table" | etc.
    query_type: QueryType = QueryType.FILTERED_LIST
    domain: str = "general"
    tags: frozenset[str] = frozenset()


# ── REPE Templates ───────────────────────────────────────────────────

_REPE_TEMPLATES: list[QueryTemplate] = [
    QueryTemplate(
        key="repe.noi_movers",
        description="Assets with the largest NOI change between two quarters",
        sql="""\
WITH cur AS (
    SELECT qs.asset_id, a.name AS asset_name, qs.noi
    FROM re_asset_quarter_state qs
    JOIN repe_asset a ON a.asset_id = qs.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE f.business_id = %(business_id)s::uuid
      AND qs.quarter = %(quarter)s
),
prev AS (
    SELECT qs.asset_id, qs.noi
    FROM re_asset_quarter_state qs
    JOIN repe_asset a ON a.asset_id = qs.asset_id
    JOIN repe_deal d ON d.deal_id = a.deal_id
    JOIN repe_fund f ON f.fund_id = d.fund_id
    WHERE f.business_id = %(business_id)s::uuid
      AND qs.quarter = %(prev_quarter)s
)
SELECT cur.asset_name,
       prev.noi AS prior_noi,
       cur.noi AS current_noi,
       cur.noi - prev.noi AS noi_change,
       CASE WHEN prev.noi != 0
            THEN ROUND(((cur.noi - prev.noi) / ABS(prev.noi)) * 100, 1)
            ELSE NULL END AS change_pct
FROM cur
JOIN prev ON prev.asset_id = cur.asset_id
ORDER BY ABS(cur.noi - prev.noi) DESC
LIMIT %(limit)s""",
        required_params=frozenset({"business_id", "quarter", "prev_quarter"}),
        optional_params=frozenset({"limit"}),
        default_chart="bar",
        query_type=QueryType.RANKED_COMPARISON,
        domain="repe",
        tags=frozenset({"noi", "movers"}),
    ),
    QueryTemplate(
        key="repe.noi_trend",
        description="NOI trend by quarter for an asset or all assets",
        sql="""\
SELECT qs.quarter,
       a.name AS asset_name,
       qs.noi,
       qs.revenue,
       qs.opex
FROM re_asset_quarter_state qs
JOIN repe_asset a ON a.asset_id = qs.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
WHERE f.business_id = %(business_id)s::uuid
ORDER BY qs.quarter, a.name
LIMIT %(limit)s""",
        required_params=frozenset({"business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="line",
        query_type=QueryType.TIME_SERIES,
        domain="repe",
        tags=frozenset({"noi", "trend"}),
    ),
    QueryTemplate(
        key="repe.occupancy_trend",
        description="Occupancy rate trend by quarter",
        sql="""\
SELECT oq.quarter,
       a.name AS asset_name,
       oq.occupancy,
       oq.avg_rent,
       oq.units_occupied,
       oq.units_total
FROM re_asset_occupancy_quarter oq
JOIN repe_asset a ON a.asset_id = oq.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
WHERE f.business_id = %(business_id)s::uuid
ORDER BY oq.quarter, a.name
LIMIT %(limit)s""",
        required_params=frozenset({"business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="line",
        query_type=QueryType.TIME_SERIES,
        domain="repe",
        tags=frozenset({"occupancy", "trend"}),
    ),
    QueryTemplate(
        key="repe.occupancy_ranked",
        description="Assets ranked by occupancy rate",
        sql="""\
SELECT a.name AS asset_name,
       pa.property_type,
       pa.market,
       pa.occupancy,
       pa.units,
       pa.current_noi
FROM repe_property_asset pa
JOIN repe_asset a ON a.asset_id = pa.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
WHERE f.business_id = %(business_id)s::uuid
ORDER BY pa.occupancy ASC
LIMIT %(limit)s""",
        required_params=frozenset({"business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="bar",
        query_type=QueryType.RANKED_COMPARISON,
        domain="repe",
        tags=frozenset({"occupancy", "ranked"}),
    ),
    QueryTemplate(
        key="repe.fund_returns",
        description="Fund return metrics (IRR, TVPI, DPI) by quarter",
        sql="""\
SELECT f.name AS fund_name,
       fs.quarter,
       fs.gross_irr,
       fs.net_irr,
       fs.tvpi,
       fs.dpi,
       fs.rvpi,
       fs.portfolio_nav
FROM re_fund_quarter_state fs
JOIN repe_fund f ON f.fund_id = fs.fund_id
WHERE f.business_id = %(business_id)s::uuid
ORDER BY f.name, fs.quarter DESC
LIMIT %(limit)s""",
        required_params=frozenset({"business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="table",
        query_type=QueryType.TIME_SERIES,
        domain="repe",
        tags=frozenset({"fund", "returns", "irr", "tvpi"}),
    ),
    QueryTemplate(
        key="repe.covenant_status",
        description="Covenant compliance status for all loans",
        sql="""\
SELECT a.name AS asset_name,
       l.loan_amount,
       l.interest_rate,
       l.maturity_date,
       cr.quarter,
       cr.covenant_type,
       cr.actual_value,
       cr.threshold_value,
       cr.in_compliance
FROM re_loan_covenant_result_qtr cr
JOIN re_loan l ON l.loan_id = cr.loan_id
JOIN repe_asset a ON a.asset_id = l.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
WHERE f.business_id = %(business_id)s::uuid
ORDER BY cr.in_compliance ASC, cr.quarter DESC
LIMIT %(limit)s""",
        required_params=frozenset({"business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="table",
        query_type=QueryType.FILTERED_LIST,
        domain="repe",
        tags=frozenset({"covenant", "compliance", "dscr", "ltv"}),
    ),
    QueryTemplate(
        key="repe.loans_maturing",
        description="Loans maturing within a date range",
        sql="""\
SELECT a.name AS asset_name,
       f.name AS fund_name,
       l.loan_amount,
       l.interest_rate,
       l.maturity_date,
       l.loan_type,
       l.maturity_date - CURRENT_DATE AS days_to_maturity
FROM re_loan l
JOIN repe_asset a ON a.asset_id = l.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
WHERE f.business_id = %(business_id)s::uuid
  AND l.maturity_date <= CURRENT_DATE + INTERVAL '%(months_ahead)s months'
ORDER BY l.maturity_date ASC
LIMIT %(limit)s""",
        required_params=frozenset({"business_id"}),
        optional_params=frozenset({"months_ahead", "limit"}),
        default_chart="table",
        query_type=QueryType.FILTERED_LIST,
        domain="repe",
        tags=frozenset({"loan", "maturity"}),
    ),
]

# ── PDS Templates ────────────────────────────────────────────────────

_PDS_TEMPLATES: list[QueryTemplate] = [
    QueryTemplate(
        key="pds.utilization_trend",
        description="Utilization rate trend over time",
        sql="""\
SELECT period,
       AVG(utilization_pct) AS avg_utilization,
       COUNT(*) AS employee_count
FROM v_pds_utilization_monthly
WHERE env_id = %(env_id)s::uuid
  AND business_id = %(business_id)s::uuid
GROUP BY period
ORDER BY period
LIMIT %(limit)s""",
        required_params=frozenset({"env_id", "business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="line",
        query_type=QueryType.TIME_SERIES,
        domain="pds",
        tags=frozenset({"utilization", "trend"}),
    ),
    QueryTemplate(
        key="pds.utilization_by_group",
        description="Utilization broken down by region or role",
        sql="""\
SELECT region,
       role_level,
       AVG(utilization_pct) AS avg_utilization,
       COUNT(DISTINCT employee_id) AS headcount
FROM v_pds_utilization_monthly
WHERE env_id = %(env_id)s::uuid
  AND business_id = %(business_id)s::uuid
GROUP BY region, role_level
ORDER BY avg_utilization DESC
LIMIT %(limit)s""",
        required_params=frozenset({"env_id", "business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="bar",
        query_type=QueryType.GROUPED_AGGREGATION,
        domain="pds",
        tags=frozenset({"utilization", "grouped"}),
    ),
    QueryTemplate(
        key="pds.revenue_variance",
        description="Revenue actual vs budget by service line",
        sql="""\
SELECT p.service_line_key,
       SUM(r.recognized_revenue) FILTER (WHERE r.version = 'actual') AS actual,
       SUM(r.recognized_revenue) FILTER (WHERE r.version = 'budget') AS budget,
       SUM(r.recognized_revenue) FILTER (WHERE r.version = 'actual')
         - SUM(r.recognized_revenue) FILTER (WHERE r.version = 'budget') AS variance
FROM pds_revenue_entries r
JOIN pds_analytics_projects p
  ON p.project_id = r.project_id
  AND p.env_id = r.env_id
  AND p.business_id = r.business_id
WHERE r.env_id = %(env_id)s::uuid
  AND r.business_id = %(business_id)s::uuid
GROUP BY p.service_line_key
ORDER BY actual DESC NULLS LAST
LIMIT %(limit)s""",
        required_params=frozenset({"env_id", "business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="bar",
        query_type=QueryType.VARIANCE_ANALYSIS,
        domain="pds",
        tags=frozenset({"revenue", "variance", "budget"}),
    ),
    QueryTemplate(
        key="pds.nps_summary",
        description="NPS scores by account and quarter",
        sql="""\
SELECT account_id,
       quarter,
       nps_score,
       total_responses,
       promoters,
       detractors
FROM v_pds_nps_summary
WHERE env_id = %(env_id)s::uuid
  AND business_id = %(business_id)s::uuid
ORDER BY nps_score DESC NULLS LAST
LIMIT %(limit)s""",
        required_params=frozenset({"env_id", "business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="bar",
        query_type=QueryType.RANKED_COMPARISON,
        domain="pds",
        tags=frozenset({"nps", "satisfaction"}),
    ),
    QueryTemplate(
        key="pds.bench_report",
        description="Employees currently on the bench (low allocation)",
        sql="""\
SELECT e.full_name,
       e.role_level,
       e.region,
       COALESCE(SUM(asgn.allocation_pct), 0) AS total_allocation
FROM pds_analytics_employees e
LEFT JOIN pds_analytics_assignments asgn
  ON asgn.employee_id = e.employee_id
  AND asgn.env_id = e.env_id
  AND asgn.business_id = e.business_id
  AND (asgn.end_date IS NULL OR asgn.end_date >= CURRENT_DATE)
WHERE e.env_id = %(env_id)s::uuid
  AND e.business_id = %(business_id)s::uuid
  AND e.is_active = true
GROUP BY e.employee_id, e.full_name, e.role_level, e.region
HAVING COALESCE(SUM(asgn.allocation_pct), 0) < 50
ORDER BY total_allocation
LIMIT %(limit)s""",
        required_params=frozenset({"env_id", "business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="table",
        query_type=QueryType.FILTERED_LIST,
        domain="pds",
        tags=frozenset({"bench", "resource"}),
    ),
    QueryTemplate(
        key="pds.tech_adoption",
        description="Technology adoption rates over time",
        sql="""\
SELECT tech.tool_name,
       tech.period,
       tech.active_users,
       tech.licensed_users,
       ROUND(tech.active_users::numeric / NULLIF(tech.licensed_users, 0) * 100, 1) AS adoption_rate_pct
FROM pds_technology_adoption tech
WHERE tech.env_id = %(env_id)s::uuid
  AND tech.business_id = %(business_id)s::uuid
ORDER BY tech.tool_name, tech.period
LIMIT %(limit)s""",
        required_params=frozenset({"env_id", "business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="line",
        query_type=QueryType.TIME_SERIES,
        domain="pds",
        tags=frozenset({"adoption", "technology"}),
    ),
]

# ── CRM Templates ────────────────────────────────────────────────────

_CRM_TEMPLATES: list[QueryTemplate] = [
    QueryTemplate(
        key="crm.stale_opportunities",
        description="Opportunities that have not progressed in N days",
        sql="""\
SELECT o.title,
       a.name AS account_name,
       ps.label AS stage,
       o.amount,
       o.expected_close_date,
       CURRENT_DATE - COALESCE(
           (SELECT MAX(h.transitioned_at)::date FROM crm_opportunity_stage_history h WHERE h.opportunity_id = o.opportunity_id),
           o.created_at::date
       ) AS days_stale
FROM crm_opportunity o
JOIN crm_account a ON a.account_id = o.account_id AND a.tenant_id = o.tenant_id
JOIN crm_pipeline_stage ps ON ps.stage_id = o.stage_id AND ps.tenant_id = o.tenant_id
WHERE o.tenant_id = %(tenant_id)s
  AND o.business_id = %(business_id)s::uuid
  AND o.status = 'open'
  AND CURRENT_DATE - COALESCE(
      (SELECT MAX(h.transitioned_at)::date FROM crm_opportunity_stage_history h WHERE h.opportunity_id = o.opportunity_id),
      o.created_at::date
  ) > %(stale_days)s
ORDER BY days_stale DESC
LIMIT %(limit)s""",
        required_params=frozenset({"tenant_id", "business_id"}),
        optional_params=frozenset({"stale_days", "limit"}),
        default_chart="table",
        query_type=QueryType.FILTERED_LIST,
        domain="crm",
        tags=frozenset({"stale", "opportunity"}),
    ),
    QueryTemplate(
        key="crm.pipeline_summary",
        description="Pipeline value by stage",
        sql="""\
SELECT ps.label AS stage,
       ps.stage_order,
       COUNT(*) AS deal_count,
       SUM(o.amount) AS total_value,
       AVG(o.amount) AS avg_deal_size
FROM crm_opportunity o
JOIN crm_pipeline_stage ps ON ps.stage_id = o.stage_id AND ps.tenant_id = o.tenant_id
WHERE o.tenant_id = %(tenant_id)s
  AND o.business_id = %(business_id)s::uuid
  AND o.status = 'open'
GROUP BY ps.label, ps.stage_order
ORDER BY ps.stage_order
LIMIT %(limit)s""",
        required_params=frozenset({"tenant_id", "business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="bar",
        query_type=QueryType.GROUPED_AGGREGATION,
        domain="crm",
        tags=frozenset({"pipeline", "stage"}),
    ),
    QueryTemplate(
        key="crm.win_rate",
        description="Win rate by period",
        sql="""\
SELECT DATE_TRUNC('month', o.updated_at)::date AS month,
       COUNT(*) FILTER (WHERE o.status = 'won') AS wins,
       COUNT(*) FILTER (WHERE o.status IN ('won', 'lost')) AS closed,
       ROUND(
           COUNT(*) FILTER (WHERE o.status = 'won')::numeric
           / NULLIF(COUNT(*) FILTER (WHERE o.status IN ('won', 'lost')), 0) * 100, 1
       ) AS win_rate_pct
FROM crm_opportunity o
WHERE o.tenant_id = %(tenant_id)s
  AND o.business_id = %(business_id)s::uuid
  AND o.status IN ('won', 'lost')
GROUP BY month
ORDER BY month DESC
LIMIT %(limit)s""",
        required_params=frozenset({"tenant_id", "business_id"}),
        optional_params=frozenset({"limit"}),
        default_chart="line",
        query_type=QueryType.TIME_SERIES,
        domain="crm",
        tags=frozenset({"win", "rate"}),
    ),
]

# ── Template registry ────────────────────────────────────────────────

_ALL_TEMPLATES: dict[str, QueryTemplate] = {}

for _t in _REPE_TEMPLATES + _PDS_TEMPLATES + _CRM_TEMPLATES:
    _ALL_TEMPLATES[_t.key] = _t


def get_template(key: str) -> QueryTemplate | None:
    """Look up a template by its stable key."""
    return _ALL_TEMPLATES.get(key)


def list_templates(domain: str | None = None) -> list[QueryTemplate]:
    """List all templates, optionally filtered by domain."""
    if domain:
        return [t for t in _ALL_TEMPLATES.values() if t.domain == domain]
    return list(_ALL_TEMPLATES.values())


def render_template(
    key: str,
    params: dict[str, Any],
    *,
    default_limit: int = 500,
) -> tuple[str, dict[str, Any]]:
    """Render a template into (sql, params) with defaults applied.

    Returns the SQL text and a clean params dict ready for psycopg execution.
    """
    template = _ALL_TEMPLATES.get(key)
    if not template:
        raise ValueError(f"Unknown template: {key}")

    # Apply defaults
    clean_params = dict(params)
    if "limit" not in clean_params:
        clean_params["limit"] = default_limit

    # Validate required params
    missing = template.required_params - set(clean_params.keys())
    if missing:
        raise ValueError(f"Missing required params for {key}: {missing}")

    return template.sql, clean_params
