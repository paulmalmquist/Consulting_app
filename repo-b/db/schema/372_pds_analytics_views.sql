-- 372_pds_analytics_views.sql
-- Convenience views for PDS analytics dashboards.
-- These pre-join and aggregate common query patterns to simplify
-- backend service queries and the SQL agent catalog.

-- ─────────────────────────────────────────────
-- v_pds_utilization_monthly
-- Joins timecards with employees, computes billable / available hours
-- per employee per month.
-- ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_pds_utilization_monthly AS
SELECT
  e.env_id,
  e.business_id,
  e.employee_id,
  e.full_name,
  e.role_level,
  e.region,
  e.department,
  date_trunc('month', t.work_date)::date                       AS period,
  SUM(t.hours)                                                  AS total_hours,
  SUM(t.hours) FILTER (WHERE t.is_billable)                     AS billable_hours,
  SUM(t.hours) FILTER (WHERE NOT t.is_billable)                 AS non_billable_hours,
  -- Available hours: standard weekly hours × work weeks in month, minus 10% PTO estimate
  (e.standard_hours_per_week * 4.33 * 0.90)                    AS available_hours,
  CASE
    WHEN (e.standard_hours_per_week * 4.33 * 0.90) > 0
    THEN ROUND(
      SUM(t.hours) FILTER (WHERE t.is_billable)
      / (e.standard_hours_per_week * 4.33 * 0.90) * 100, 2
    )
    ELSE 0
  END                                                           AS utilization_pct
FROM pds_analytics_employees e
JOIN pds_analytics_timecards t
  ON t.employee_id = e.employee_id
  AND t.env_id = e.env_id
  AND t.business_id = e.business_id
WHERE e.is_active = true
GROUP BY
  e.env_id, e.business_id, e.employee_id, e.full_name,
  e.role_level, e.region, e.department,
  date_trunc('month', t.work_date)::date,
  e.standard_hours_per_week;

COMMENT ON VIEW v_pds_utilization_monthly IS 'Monthly utilization per employee: billable hours / available hours';

-- ─────────────────────────────────────────────
-- v_pds_revenue_variance
-- Pivots revenue_entries to show actual vs budget vs forecast
-- side-by-side per project per period.
-- ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_pds_revenue_variance AS
SELECT
  r.env_id,
  r.business_id,
  r.project_id,
  p.project_name,
  p.account_id,
  p.governance_track,
  p.service_line_key,
  r.period,
  MAX(r.recognized_revenue) FILTER (WHERE r.version = 'actual')        AS actual_revenue,
  MAX(r.recognized_revenue) FILTER (WHERE r.version = 'budget')        AS budget_revenue,
  MAX(r.recognized_revenue) FILTER (WHERE r.version = 'forecast_6_6')  AS forecast_6_6_revenue,
  MAX(r.recognized_revenue) FILTER (WHERE r.version = 'plan')          AS plan_revenue,
  MAX(r.cost)               FILTER (WHERE r.version = 'actual')        AS actual_cost,
  MAX(r.margin_pct)         FILTER (WHERE r.version = 'actual')        AS actual_margin_pct,
  -- Variance calculations
  COALESCE(
    MAX(r.recognized_revenue) FILTER (WHERE r.version = 'actual'), 0
  ) - COALESCE(
    MAX(r.recognized_revenue) FILTER (WHERE r.version = 'budget'), 0
  )                                                                     AS budget_vs_actual_delta,
  CASE
    WHEN COALESCE(MAX(r.recognized_revenue) FILTER (WHERE r.version = 'budget'), 0) != 0
    THEN ROUND((
      COALESCE(MAX(r.recognized_revenue) FILTER (WHERE r.version = 'actual'), 0)
      - MAX(r.recognized_revenue) FILTER (WHERE r.version = 'budget')
    ) / MAX(r.recognized_revenue) FILTER (WHERE r.version = 'budget') * 100, 2)
    ELSE NULL
  END                                                                   AS budget_vs_actual_pct
FROM pds_revenue_entries r
JOIN pds_analytics_projects p ON p.project_id = r.project_id
  AND p.env_id = r.env_id AND p.business_id = r.business_id
GROUP BY
  r.env_id, r.business_id, r.project_id,
  p.project_name, p.account_id, p.governance_track, p.service_line_key,
  r.period;

COMMENT ON VIEW v_pds_revenue_variance IS 'Side-by-side actual vs budget vs forecast revenue per project per period';

-- ─────────────────────────────────────────────
-- v_pds_account_health
-- Aggregates latest NPS, revenue trend, utilization, project RAG
-- across accounts.
-- ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_pds_account_health AS
WITH latest_nps AS (
  SELECT DISTINCT ON (env_id, business_id, account_id)
    env_id, business_id, account_id,
    nps_score,
    overall_satisfaction,
    survey_date AS latest_survey_date
  FROM pds_nps_responses
  WHERE account_id IS NOT NULL
  ORDER BY env_id, business_id, account_id, survey_date DESC
),
revenue_ytd AS (
  SELECT
    r.env_id, r.business_id, p.account_id,
    SUM(r.recognized_revenue) AS ytd_revenue,
    AVG(r.margin_pct)         AS avg_margin
  FROM pds_revenue_entries r
  JOIN pds_analytics_projects p ON p.project_id = r.project_id
    AND p.env_id = r.env_id AND p.business_id = r.business_id
  WHERE r.version = 'actual'
    AND r.period >= date_trunc('year', CURRENT_DATE)::date
  GROUP BY r.env_id, r.business_id, p.account_id
),
project_counts AS (
  SELECT
    env_id, business_id, account_id,
    COUNT(*) AS total_projects,
    COUNT(*) FILTER (WHERE status = 'active') AS active_projects
  FROM pds_analytics_projects
  WHERE account_id IS NOT NULL
  GROUP BY env_id, business_id, account_id
)
SELECT
  a.env_id,
  a.business_id,
  a.account_id,
  a.account_name,
  a.tier,
  a.governance_track,
  a.annual_contract_value,
  n.nps_score                AS latest_nps,
  n.overall_satisfaction     AS latest_satisfaction,
  n.latest_survey_date,
  rv.ytd_revenue,
  rv.avg_margin,
  pc.total_projects,
  pc.active_projects,
  CASE
    WHEN n.nps_score >= 9 THEN 'green'
    WHEN n.nps_score >= 7 THEN 'amber'
    WHEN n.nps_score IS NOT NULL THEN 'red'
    ELSE 'unknown'
  END                        AS nps_health,
  CASE
    WHEN rv.avg_margin >= 0.30 THEN 'green'
    WHEN rv.avg_margin >= 0.20 THEN 'amber'
    WHEN rv.avg_margin IS NOT NULL THEN 'red'
    ELSE 'unknown'
  END                        AS margin_health
FROM pds_accounts a
LEFT JOIN latest_nps n
  ON n.account_id = a.account_id AND n.env_id = a.env_id AND n.business_id = a.business_id
LEFT JOIN revenue_ytd rv
  ON rv.account_id = a.account_id AND rv.env_id = a.env_id AND rv.business_id = a.business_id
LEFT JOIN project_counts pc
  ON pc.account_id = a.account_id AND pc.env_id = a.env_id AND pc.business_id = a.business_id
WHERE a.status = 'active';

COMMENT ON VIEW v_pds_account_health IS 'Account health dashboard: latest NPS, YTD revenue, margin, project counts';

-- ─────────────────────────────────────────────
-- v_pds_nps_summary
-- Computes NPS score (promoters% - detractors%), counts per account per quarter.
-- ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_pds_nps_summary AS
SELECT
  env_id,
  business_id,
  account_id,
  COUNT(*)                                                     AS response_count,
  MAX(survey_date)                                             AS last_survey_date,
  ROUND(AVG(overall_satisfaction), 2)                         AS avg_satisfaction,
  ROUND(
    (COUNT(*) FILTER (WHERE nps_score >= 9)::numeric / NULLIF(COUNT(*), 0) * 100)
    - (COUNT(*) FILTER (WHERE nps_score <= 6)::numeric / NULLIF(COUNT(*), 0) * 100)
  , 1)                                                         AS nps
FROM pds_nps_responses
WHERE nps_score IS NOT NULL
GROUP BY env_id, business_id, account_id;

COMMENT ON VIEW v_pds_nps_summary IS 'Per-account NPS summary: promoter% - detractor%, avg satisfaction, response count, last survey date';
