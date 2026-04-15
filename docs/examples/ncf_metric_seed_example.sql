-- docs/examples/ncf_metric_seed_example.sql
--
-- NOT a migration. Example script to seed ONE real governed metric row into
-- ncf_metric so the /lab/env/{envId}/ncf/executive page lights up a live card
-- with full provenance: value, lens, source, owner, lineage.
--
-- Run AFTER the NCF env has been provisioned via the v2 create pipeline
-- (POST /v2/environments with template_key='client_delivery', slug='ncf').
--
-- Replace ':env_slug' with the NCF slug and ':business_slug' with the matching
-- business slug (default: 'national-christian-foundation' derived by v2 pipeline;
-- verify with SELECT slug FROM app.businesses).
--
-- Idempotent: ON CONFLICT on the unique key (env_id, business_id, metric_key,
-- reporting_lens, period_start, period_end) does nothing.

WITH target AS (
  SELECT
    e.env_id,
    b.business_id
  FROM app.environments e
  JOIN app.env_business_bindings bb ON bb.env_id = e.env_id
  JOIN business b ON b.business_id = bb.business_id
  WHERE e.slug = 'ncf'
  LIMIT 1
)
INSERT INTO ncf_metric (
  env_id,
  business_id,
  metric_key,
  value_numeric,
  value_text,
  period_start,
  period_end,
  reporting_lens,
  source_table,
  source_query_hash,
  owner_role,
  lineage_notes,
  refreshed_at
)
SELECT
  target.env_id,
  target.business_id,
  'grants_paid',
  842000000,           -- $842M
  NULL,
  date '2026-01-01',
  date '2026-03-31',
  'financial_reporting',
  'ncf_grant WHERE stage = ''paid'' AND reporting_lens = ''financial_reporting''',
  'sha256:ba05e...c230',
  'Finance · Consolidated Reporting',
  '[
    "Does not include recommendations still in qualification or approval.",
    "Backlog drift between recommended and paid is surfaced in Data Health.",
    "Audited close for Q1 2026."
  ]'::jsonb,
  now()
FROM target
ON CONFLICT (env_id, business_id, metric_key, reporting_lens, period_start, period_end)
DO NOTHING;

-- Verify:
-- SELECT metric_key, value_numeric, reporting_lens, owner_role, refreshed_at
--   FROM ncf_metric
--  WHERE env_id = (SELECT env_id FROM app.environments WHERE slug = 'ncf');
