-- Winston REPE capability, eval, and change-set contracts.
-- Current-series migration number used because 334 already exists in this repo.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS repe;

-- ---------------------------------------------------------------------------
-- Capability registry and read-side eval tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS repe_capabilities (
  capability_key text PRIMARY KEY,
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  description text NOT NULL,
  required_source_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_source_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_metric_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_params jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparison_window_policy text,
  release_state_required text,
  allowed_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  mutation_class text NOT NULL DEFAULT 'read'
    CHECK (mutation_class IN ('read', 'stage_only', 'commit_only', 'read_and_commit')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winston_eval_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  domain text NOT NULL DEFAULT 'repe',
  scenario_key text NOT NULL UNIQUE,
  prompt text NOT NULL,
  expected_capability text REFERENCES repe_capabilities(capability_key),
  expected_params_shape jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_source_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_metric_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_period_policy text,
  expected_failure_mode text,
  deterministic_expected_result jsonb,
  tolerance_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winston_eval_sql_assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  scenario_id uuid NOT NULL REFERENCES winston_eval_scenarios(id) ON DELETE CASCADE,
  assertion_name text NOT NULL,
  sql_text text NOT NULL,
  expected_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  tolerance_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winston_eval_metric_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  metric_key text NOT NULL,
  domain text NOT NULL DEFAULT 'repe',
  allowed_source_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_source_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_dimensions jsonb NOT NULL DEFAULT '[]'::jsonb,
  period_grain text NOT NULL DEFAULT 'quarter',
  release_state_required text NOT NULL DEFAULT 'released',
  null_policy text NOT NULL DEFAULT 'preserve_null_with_reason',
  calculation_owner text NOT NULL DEFAULT 'authoritative_snapshot_engine',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, metric_key)
);

CREATE TABLE IF NOT EXISTS winston_eval_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  run_id uuid REFERENCES winston_eval_runs(run_id) ON DELETE CASCADE,
  scenario_id uuid REFERENCES winston_eval_scenarios(id) ON DELETE SET NULL,
  question text NOT NULL,
  capability_called text,
  capability_params_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  answer_text text,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  sql_queries jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_tables_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_table_touched boolean NOT NULL DEFAULT false,
  snapshot_ids_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_snapshot_hash text,
  comparison_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  periods_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics_returned jsonb NOT NULL DEFAULT '{}'::jsonb,
  unavailable_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  pass_fail text CHECK (pass_fail IN ('pass', 'fail', 'skip')),
  failure_category text,
  capability_correctness_status text,
  numeric_accuracy_status text,
  scope_status text,
  provenance_status text,
  no_fake_zero_status text,
  latency_ms integer,
  raw_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  mutation_requested boolean NOT NULL DEFAULT false,
  mutation_allowed boolean,
  staged_change_set_id uuid,
  committed_change_set_id uuid,
  target_tables jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_status text,
  approval_gate_status text,
  impact_preview_status text,
  audit_receipt_status text,
  rollback_status text,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_deleted integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Change-set lifecycle tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS re_change_sets (
  change_set_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  period text,
  target_table text NOT NULL,
  source_prompt text NOT NULL,
  tool_trace jsonb NOT NULL DEFAULT '[]'::jsonb,
  capability_key text REFERENCES repe_capabilities(capability_key),
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('draft', 'staged', 'validated', 'impact_computed', 'approval_pending', 'approved', 'committed', 'rolled_back', 'rejected')),
  created_by uuid,
  approved_by uuid,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_change_items (
  change_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  change_set_id uuid NOT NULL REFERENCES re_change_sets(change_set_id) ON DELETE CASCADE,
  target_pk jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_column text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  value_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_change_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  change_item_id uuid NOT NULL REFERENCES re_change_items(change_item_id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'skip')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_change_impact_preview (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  change_set_id uuid NOT NULL REFERENCES re_change_sets(change_set_id) ON DELETE CASCADE,
  affected_metric_key text NOT NULL,
  affected_entity_type text NOT NULL,
  affected_entity_id uuid,
  affected_period text,
  before_value numeric,
  after_value numeric,
  delta numeric,
  compute_engine text NOT NULL CHECK (compute_engine IN ('accounting', 'risk', 'compliance', 'reporting')),
  engine_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_change_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  change_set_id uuid NOT NULL REFERENCES re_change_sets(change_set_id) ON DELETE CASCADE,
  approval_level text NOT NULL DEFAULT 'standard',
  approver_user_id uuid,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_change_audit_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id text NOT NULL,
  business_id uuid NOT NULL,
  change_set_id uuid NOT NULL REFERENCES re_change_sets(change_set_id) ON DELETE CASCADE,
  committed_by uuid,
  committed_at timestamptz NOT NULL DEFAULT now(),
  previous_row_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_row_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  downstream_recalculation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  rollback_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE winston_eval_observations
  ADD CONSTRAINT fk_winston_eval_observations_staged_change_set
  FOREIGN KEY (staged_change_set_id) REFERENCES re_change_sets(change_set_id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE winston_eval_observations
  ADD CONSTRAINT fk_winston_eval_observations_committed_change_set
  FOREIGN KEY (committed_change_set_id) REFERENCES re_change_sets(change_set_id)
  ON DELETE SET NULL
  NOT VALID;

-- ---------------------------------------------------------------------------
-- RLS and comments
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'repe_capabilities',
    'winston_eval_scenarios',
    'winston_eval_sql_assertions',
    'winston_eval_metric_contracts',
    'winston_eval_observations',
    're_change_sets',
    're_change_items',
    're_change_validations',
    're_change_impact_preview',
    're_change_approvals',
    're_change_audit_receipts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (env_id = current_setting(''app.env_id'', true)) WITH CHECK (env_id = current_setting(''app.env_id'', true))',
      t || '_env_isolation',
      t
    );
  END LOOP;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

COMMENT ON TABLE repe_capabilities IS 'Registered REPE capabilities available to Winston. Owned by mcp-winston.';
COMMENT ON TABLE winston_eval_scenarios IS 'Declarative Winston REPE eval scenarios. Owned by ai-copilot-winston.';
COMMENT ON TABLE winston_eval_sql_assertions IS 'Per-scenario deterministic SQL assertions for Winston evals. Owned by ai-copilot-winston.';
COMMENT ON TABLE winston_eval_metric_contracts IS 'Canonical REPE metric contracts used by Winston eval grading. Owned by ai-copilot-winston.';
COMMENT ON TABLE winston_eval_observations IS 'Per-run Winston REPE observation and grading detail. Owned by ai-copilot-winston.';
COMMENT ON TABLE re_change_sets IS 'Top-level REPE mutation change-set requests. Owned by mcp-winston.';
COMMENT ON TABLE re_change_items IS 'Column-level items staged inside a REPE change set. Owned by mcp-winston.';
COMMENT ON TABLE re_change_validations IS 'Deterministic validation results for REPE change items. Owned by mcp-winston.';
COMMENT ON TABLE re_change_impact_preview IS 'Computed downstream impact preview for staged REPE change sets. Owned by mcp-winston.';
COMMENT ON TABLE re_change_approvals IS 'Explicit approval decisions for REPE change sets. Owned by mcp-winston.';
COMMENT ON TABLE re_change_audit_receipts IS 'Immutable commit receipts for REPE change sets. Owned by mcp-winston.';

-- ---------------------------------------------------------------------------
-- Deterministic read helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION repe.fn_period_to_quarter(p_period date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT concat(extract(year from p_period)::int, 'Q', extract(quarter from p_period)::int);
$$;

CREATE OR REPLACE FUNCTION repe.fn_quarter_start(p_quarter text)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT make_date(
    substring(p_quarter from 1 for 4)::int,
    ((substring(p_quarter from 'Q([1-4])')::int - 1) * 3) + 1,
    1
  );
$$;

CREATE OR REPLACE FUNCTION repe.fn_metric_numeric(p_metrics jsonb, p_metric_key text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_metric_key
    WHEN 'nav' THEN COALESCE(
      NULLIF(p_metrics->>'portfolio_nav', '')::numeric,
      NULLIF(p_metrics->>'ending_nav', '')::numeric,
      NULLIF(p_metrics->>'nav', '')::numeric
    )
    WHEN 'gross_irr' THEN NULLIF(p_metrics->>'gross_irr', '')::numeric
    WHEN 'net_irr' THEN NULLIF(p_metrics->>'net_irr', '')::numeric
    WHEN 'tvpi' THEN NULLIF(p_metrics->>'tvpi', '')::numeric
    WHEN 'dpi' THEN NULLIF(p_metrics->>'dpi', '')::numeric
    WHEN 'noi' THEN NULLIF(p_metrics->>'noi', '')::numeric
    WHEN 'dscr' THEN NULLIF(p_metrics->>'dscr', '')::numeric
    WHEN 'ltv' THEN NULLIF(p_metrics->>'ltv', '')::numeric
    WHEN 'occupancy' THEN NULLIF(p_metrics->>'occupancy', '')::numeric
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION repe.fn_eligible_metric_history(
  p_env_id text,
  p_metric_key text,
  p_fund_id uuid DEFAULT NULL
) RETURNS TABLE (
  fund_id uuid,
  eligible_periods date[],
  start_period date,
  end_period date,
  start_value numeric,
  end_value numeric,
  exclusion_reason text,
  snapshot_ids uuid[]
)
LANGUAGE sql
STABLE
AS $$
  WITH scoped_funds AS (
    SELECT DISTINCT COALESCE(s.fund_id, f.fund_id) AS fund_id
    FROM re_authoritative_fund_state_qtr s
    FULL JOIN repe_fund f ON f.fund_id = s.fund_id
    WHERE (p_fund_id IS NULL OR COALESCE(s.fund_id, f.fund_id) = p_fund_id)
      AND (s.env_id = p_env_id OR p_fund_id IS NOT NULL)
  ),
  released AS (
    SELECT
      s.fund_id,
      repe.fn_quarter_start(s.quarter) AS period_start,
      repe.fn_metric_numeric(s.canonical_metrics, p_metric_key) AS metric_value,
      s.id AS snapshot_id
    FROM re_authoritative_fund_state_qtr s
    JOIN scoped_funds f ON f.fund_id = s.fund_id
    WHERE s.env_id = p_env_id
      AND s.promotion_state = 'released'
  ),
  ordered AS (
    SELECT
      r.*,
      lag(r.period_start) OVER (PARTITION BY r.fund_id ORDER BY r.period_start) AS prev_period
    FROM released r
    WHERE r.metric_value IS NOT NULL
  ),
  grouped AS (
    SELECT
      f.fund_id,
      array_agg(o.period_start ORDER BY o.period_start) FILTER (WHERE o.period_start IS NOT NULL) AS periods,
      array_agg(o.metric_value ORDER BY o.period_start) FILTER (WHERE o.period_start IS NOT NULL) AS values,
      array_agg(o.snapshot_id ORDER BY o.period_start) FILTER (WHERE o.snapshot_id IS NOT NULL) AS ids,
      count(r.snapshot_id) AS released_snapshot_count,
      count(o.snapshot_id) AS non_null_metric_count,
      bool_or(o.prev_period IS NOT NULL AND o.period_start > (o.prev_period + interval '3 months')::date) AS has_gap
    FROM scoped_funds f
    LEFT JOIN released r ON r.fund_id = f.fund_id
    LEFT JOIN ordered o ON o.snapshot_id = r.snapshot_id
    GROUP BY f.fund_id
  )
  SELECT
    g.fund_id,
    COALESCE(g.periods, ARRAY[]::date[]) AS eligible_periods,
    CASE WHEN array_length(g.periods, 1) >= 1 THEN g.periods[1] ELSE NULL END AS start_period,
    CASE WHEN array_length(g.periods, 1) >= 1 THEN g.periods[array_length(g.periods, 1)] ELSE NULL END AS end_period,
    CASE WHEN array_length(g.values, 1) >= 1 THEN g.values[1] ELSE NULL END AS start_value,
    CASE WHEN array_length(g.values, 1) >= 1 THEN g.values[array_length(g.values, 1)] ELSE NULL END AS end_value,
    CASE
      WHEN g.released_snapshot_count = 0 THEN 'no_released_snapshot'
      WHEN g.non_null_metric_count = 0 THEN 'null_metric'
      WHEN g.non_null_metric_count < 2 THEN 'insufficient_history'
      WHEN COALESCE(g.has_gap, false) THEN 'gap_exceeds_policy'
      ELSE NULL
    END AS exclusion_reason,
    COALESCE(g.ids, ARRAY[]::uuid[]) AS snapshot_ids
  FROM grouped g;
$$;

CREATE OR REPLACE FUNCTION repe.fn_classify_unavailable_metric(
  p_env_id text,
  p_metric_key text,
  p_entity_type text,
  p_entity_id uuid,
  p_period date
) RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_quarter text := repe.fn_period_to_quarter(p_period);
  v_supported boolean;
  v_released_count integer;
  v_draft_count integer;
  v_metric numeric;
BEGIN
  v_supported := p_metric_key = ANY(ARRAY['nav','gross_irr','net_irr','tvpi','dpi','noi','dscr','ltv','occupancy']);
  IF NOT v_supported THEN
    RETURN 'unsupported_metric';
  END IF;

  IF p_entity_type <> 'fund' THEN
    RETURN 'unsupported_metric';
  END IF;

  SELECT count(*)
  INTO v_released_count
  FROM re_authoritative_fund_state_qtr
  WHERE env_id = p_env_id
    AND fund_id = p_entity_id
    AND quarter = v_quarter
    AND promotion_state = 'released';

  IF v_released_count = 0 THEN
    SELECT count(*)
    INTO v_draft_count
    FROM re_authoritative_fund_state_qtr
    WHERE env_id = p_env_id
      AND fund_id = p_entity_id
      AND quarter = v_quarter
      AND promotion_state <> 'released';

    IF v_draft_count > 0 THEN
      RETURN 'draft_only_snapshot';
    END IF;

    IF EXISTS (SELECT 1 FROM repe_fund WHERE fund_id = p_entity_id) THEN
      RETURN 'no_released_snapshot';
    END IF;

    RETURN 'scope_violation';
  END IF;

  SELECT repe.fn_metric_numeric(canonical_metrics, p_metric_key)
  INTO v_metric
  FROM re_authoritative_fund_state_qtr
  WHERE env_id = p_env_id
    AND fund_id = p_entity_id
    AND quarter = v_quarter
    AND promotion_state = 'released'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_metric IS NULL THEN
    RETURN 'null_metric';
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Canonical write guardrails
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION repe.fn_forbid_direct_canonical_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(current_setting('app.change_set_committing', true), '') IS NULL THEN
    RAISE EXCEPTION 'forbidden_direct_write_canonical_table';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    're_authoritative_fund_state_qtr',
    're_authoritative_investment_state_qtr',
    're_authoritative_asset_state_qtr'
  ]
  LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_re_winston_no_direct_write_' || t, t);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION repe.fn_forbid_direct_canonical_write()',
        'trg_re_winston_no_direct_write_' || t,
        t
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION repe.fn_forbid_released_snapshot_run_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.released_at IS NOT NULL
     AND NULLIF(current_setting('app.change_set_committing', true), '') IS NULL THEN
    RAISE EXCEPTION 'forbidden_direct_write_canonical_table';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('re_authoritative_snapshot_run') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_re_winston_no_direct_write_snapshot_run ON re_authoritative_snapshot_run;
    CREATE TRIGGER trg_re_winston_no_direct_write_snapshot_run
      BEFORE UPDATE OR DELETE ON re_authoritative_snapshot_run
      FOR EACH ROW EXECUTE FUNCTION repe.fn_forbid_released_snapshot_run_write();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Seed capabilities, metric contracts, and scenarios
-- ---------------------------------------------------------------------------

WITH seed_context AS (
  SELECT
    'a1b2c3d4-0001-0001-0003-000000000001'::text AS env_id,
    'a1b2c3d4-0001-0001-0001-000000000001'::uuid AS business_id
),
capabilities AS (
  SELECT * FROM (VALUES
    ('repe.rank_funds_by_metric_change', 'Rank funds by deterministic metric change', '["re_authoritative_fund_state_qtr"]'::jsonb, '["re_fund_quarter_state","re_fund_metrics_qtr"]'::jsonb, '["nav","gross_irr","net_irr","tvpi","dpi"]'::jsonb, '["metric_key","ranking_basis","comparison_window_policy"]'::jsonb, '{"comparison_result":true,"snapshot_ids_used":true,"data_snapshot_hash":true}'::jsonb, 'min_to_max_released_no_gaps', 'released', 'read'),
    ('repe.get_authoritative_fund_snapshots', 'Fetch released authoritative fund snapshots', '["re_authoritative_fund_state_qtr"]'::jsonb, '["re_fund_quarter_state","re_fund_metrics_qtr"]'::jsonb, '[]'::jsonb, '["env_id","business_id"]'::jsonb, '{"snapshots":true}'::jsonb, NULL, 'released', 'read'),
    ('repe.get_metric_provenance', 'Fetch metric provenance from authoritative snapshots', '["re_authoritative_fund_state_qtr","re_authoritative_snapshot_run"]'::jsonb, '["re_fund_quarter_state","re_fund_metrics_qtr"]'::jsonb, '[]'::jsonb, '["metric_key","entity_id","period"]'::jsonb, '{"provenance":true}'::jsonb, NULL, 'released', 'read'),
    ('repe.explain_unavailable_metric', 'Classify unavailable metric state using SQL taxonomy', '["re_authoritative_fund_state_qtr"]'::jsonb, '["re_fund_quarter_state","re_fund_metrics_qtr"]'::jsonb, '[]'::jsonb, '["metric_key","entity_type","entity_id","period"]'::jsonb, '{"reason_code":true}'::jsonb, NULL, 'released', 'read'),
    ('repe.resolve_repe_context', 'Resolve canonical REPE entities in environment scope', '["repe_fund","repe_deal","repe_asset","repe_entity"]'::jsonb, '["re_fund_quarter_state","re_fund_metrics_qtr"]'::jsonb, '[]'::jsonb, '["query"]'::jsonb, '{"entities":true}'::jsonb, NULL, NULL, 'read'),
    ('repe.stage_change', 'Stage a REPE mutation as a change set', '["re_change_sets","re_change_items"]'::jsonb, '["re_authoritative_fund_state_qtr","re_authoritative_investment_state_qtr","re_authoritative_asset_state_qtr"]'::jsonb, '[]'::jsonb, '["target_table","entity_type","entity_id","changes"]'::jsonb, '{"change_set_id":true,"status":"staged"}'::jsonb, NULL, NULL, 'stage_only'),
    ('repe.validate_change', 'Validate a staged REPE change set', '["re_change_sets","re_change_items","re_change_validations"]'::jsonb, '["re_authoritative_fund_state_qtr","re_authoritative_investment_state_qtr","re_authoritative_asset_state_qtr"]'::jsonb, '[]'::jsonb, '["change_set_id"]'::jsonb, '{"validations":true}'::jsonb, NULL, NULL, 'stage_only'),
    ('repe.compute_change_impact', 'Compute downstream impact for a staged REPE change set', '["re_change_sets","re_change_impact_preview"]'::jsonb, '["re_authoritative_fund_state_qtr","re_authoritative_investment_state_qtr","re_authoritative_asset_state_qtr"]'::jsonb, '[]'::jsonb, '["change_set_id"]'::jsonb, '{"impact_preview":true}'::jsonb, NULL, NULL, 'stage_only'),
    ('repe.approve_change', 'Record explicit approval for a REPE change set', '["re_change_approvals"]'::jsonb, '["re_authoritative_fund_state_qtr","re_authoritative_investment_state_qtr","re_authoritative_asset_state_qtr"]'::jsonb, '[]'::jsonb, '["change_set_id","decision"]'::jsonb, '{"approval":true}'::jsonb, NULL, NULL, 'commit_only'),
    ('repe.commit_change', 'Commit an approved REPE change set with audit receipt', '["re_change_sets","re_change_items","re_change_audit_receipts"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '["change_set_id"]'::jsonb, '{"audit_receipt":true}'::jsonb, NULL, NULL, 'commit_only'),
    ('repe.rollback_change', 'Roll back a committed REPE change set from receipt data', '["re_change_sets","re_change_audit_receipts"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '["change_set_id"]'::jsonb, '{"rollback":true}'::jsonb, NULL, NULL, 'commit_only')
  ) AS c(capability_key, description, required_source_tables, forbidden_source_tables, required_metric_keys, required_params, output_contract, comparison_window_policy, release_state_required, mutation_class)
)
INSERT INTO repe_capabilities (
  capability_key,
  env_id,
  business_id,
  description,
  required_source_tables,
  forbidden_source_tables,
  required_metric_keys,
  required_params,
  output_contract,
  comparison_window_policy,
  release_state_required,
  allowed_roles,
  mutation_class
)
SELECT
  c.capability_key,
  s.env_id,
  s.business_id,
  c.description,
  c.required_source_tables,
  c.forbidden_source_tables,
  c.required_metric_keys,
  c.required_params,
  c.output_contract,
  c.comparison_window_policy,
  c.release_state_required,
  '["admin","operator","analyst"]'::jsonb,
  c.mutation_class
FROM capabilities c
CROSS JOIN seed_context s
ON CONFLICT (capability_key) DO UPDATE SET
  description = EXCLUDED.description,
  required_source_tables = EXCLUDED.required_source_tables,
  forbidden_source_tables = EXCLUDED.forbidden_source_tables,
  required_metric_keys = EXCLUDED.required_metric_keys,
  required_params = EXCLUDED.required_params,
  output_contract = EXCLUDED.output_contract,
  comparison_window_policy = EXCLUDED.comparison_window_policy,
  release_state_required = EXCLUDED.release_state_required,
  mutation_class = EXCLUDED.mutation_class,
  updated_at = now();

WITH seed_context AS (
  SELECT
    'a1b2c3d4-0001-0001-0003-000000000001'::text AS env_id,
    'a1b2c3d4-0001-0001-0001-000000000001'::uuid AS business_id
),
metrics AS (
  SELECT * FROM (VALUES
    ('nav'), ('gross_irr'), ('net_irr'), ('tvpi'), ('dpi'), ('noi'), ('dscr'), ('ltv'), ('occupancy')
  ) AS m(metric_key)
)
INSERT INTO winston_eval_metric_contracts (
  env_id,
  business_id,
  metric_key,
  allowed_source_tables,
  forbidden_source_tables,
  required_dimensions,
  period_grain,
  release_state_required,
  null_policy,
  calculation_owner,
  notes
)
SELECT
  s.env_id,
  s.business_id,
  m.metric_key,
  '["re_authoritative_fund_state_qtr","re_authoritative_investment_state_qtr","re_authoritative_asset_state_qtr"]'::jsonb,
  '["re_fund_quarter_state","re_fund_metrics_qtr"]'::jsonb,
  '["env_id","business_id","quarter"]'::jsonb,
  'quarter',
  'released',
  'preserve_null_with_reason',
  'authoritative_snapshot_engine',
  'Seeded by Winston REPE eval extension.'
FROM metrics m
CROSS JOIN seed_context s
ON CONFLICT (env_id, metric_key) DO UPDATE SET
  forbidden_source_tables = EXCLUDED.forbidden_source_tables,
  release_state_required = EXCLUDED.release_state_required,
  updated_at = now();

WITH seed_context AS (
  SELECT
    'a1b2c3d4-0001-0001-0003-000000000001'::text AS env_id,
    'a1b2c3d4-0001-0001-0001-000000000001'::uuid AS business_id
),
scenarios AS (
  SELECT * FROM (VALUES
    ('repe.rank_funds_by_nav_change', 'which fund''s nav has increased over time the most', 'repe.rank_funds_by_metric_change', '["nav"]'::jsonb, 'min_to_max_released_no_gaps', NULL, '["read","ranking","nav"]'::jsonb),
    ('repe.rank_funds_by_nav_change_all_null', 'which fund''s nav has increased over time the most', 'repe.rank_funds_by_metric_change', '["nav"]'::jsonb, 'min_to_max_released_no_gaps', 'null_metric', '["read","all_null","brutal"]'::jsonb),
    ('repe.rank_assets_by_noi_qoq', 'which asset had the largest NOI decline last quarter', 'repe.explain_unavailable_metric', '["noi"]'::jsonb, 'min_to_max_released_no_gaps', NULL, '["read","asset","noi"]'::jsonb),
    ('repe.explain_carry_unavailable', 'how much carry has been accrued', 'repe.explain_unavailable_metric', '[]'::jsonb, NULL, 'out_of_scope_requires_waterfall', '["read","waterfall","fail_closed"]'::jsonb),
    ('repe.cross_env_violation', 'rank NAV for a fund in another environment', 'repe.resolve_repe_context', '["nav"]'::jsonb, NULL, 'scope_violation', '["read","scope"]'::jsonb),
    ('repe.legacy_table_attempt', 'read from legacy fund quarter state', 'repe.rank_funds_by_metric_change', '["nav"]'::jsonb, 'min_to_max_released_no_gaps', 'legacy_source_violation', '["read","legacy_block"]'::jsonb),
    ('repe.write.stage_occupancy_valid', 'Update Oakwood''s Q2 occupancy to 91%.', 'repe.stage_change', '["occupancy"]'::jsonb, NULL, NULL, '["write","stage"]'::jsonb),
    ('repe.write.validation_blocks_invalid', 'Set Oakwood occupancy to 180%.', 'repe.validate_change', '["occupancy"]'::jsonb, NULL, 'validation_failed', '["write","validator"]'::jsonb),
    ('repe.write.commit_after_stage', 'Commit the occupancy change.', 'repe.commit_change', '["occupancy"]'::jsonb, NULL, NULL, '["write","commit"]'::jsonb),
    ('repe.write.released_nav_blocked', 'Change Fund VII NAV to $1.5B.', 'repe.stage_change', '["nav"]'::jsonb, NULL, 'forbidden_direct_write_canonical_table', '["write","canonical_block"]'::jsonb),
    ('repe.write.gl_mapping_stages', 'Add this GL account mapping to Repairs & Maintenance.', 'repe.stage_change', '[]'::jsonb, NULL, NULL, '["write","mapping"]'::jsonb),
    ('repe.write.actuals_ingest_no_close', 'Upload these actuals and refresh the report.', 'repe.stage_change', '[]'::jsonb, NULL, NULL, '["write","actuals"]'::jsonb),
    ('repe.write.downside_model_overlay', 'Create a downside model with exit cap +50 bps.', 'repe.stage_change', '[]'::jsonb, NULL, NULL, '["write","model_overlay"]'::jsonb),
    ('repe.write.delete_asset_blocked', 'Delete this asset.', 'repe.stage_change', '[]'::jsonb, NULL, 'elevated_approval_required', '["write","delete_block"]'::jsonb),
    ('repe.write.scope_cross_env', 'Update an asset from another environment.', 'repe.stage_change', '[]'::jsonb, NULL, 'scope_violation', '["write","scope"]'::jsonb),
    ('repe.write.rollback_round_trip', 'Stage, validate, commit, and roll back the occupancy change.', 'repe.rollback_change', '["occupancy"]'::jsonb, NULL, NULL, '["write","rollback"]'::jsonb)
  ) AS s(scenario_key, prompt, expected_capability, expected_metric_keys, expected_period_policy, expected_failure_mode, tags)
)
INSERT INTO winston_eval_scenarios (
  env_id,
  business_id,
  scenario_key,
  prompt,
  expected_capability,
  expected_params_shape,
  expected_source_tables,
  expected_metric_keys,
  expected_period_policy,
  expected_failure_mode,
  tolerance_json,
  tags
)
SELECT
  c.env_id,
  c.business_id,
  s.scenario_key,
  s.prompt,
  s.expected_capability,
  '{}'::jsonb,
  '["re_authoritative_fund_state_qtr"]'::jsonb,
  s.expected_metric_keys,
  s.expected_period_policy,
  s.expected_failure_mode,
  '{"numeric_abs":0.01}'::jsonb,
  s.tags
FROM scenarios s
CROSS JOIN seed_context c
ON CONFLICT (scenario_key) DO UPDATE SET
  prompt = EXCLUDED.prompt,
  expected_capability = EXCLUDED.expected_capability,
  expected_metric_keys = EXCLUDED.expected_metric_keys,
  expected_period_policy = EXCLUDED.expected_period_policy,
  expected_failure_mode = EXCLUDED.expected_failure_mode,
  tags = EXCLUDED.tags,
  updated_at = now();

CREATE INDEX IF NOT EXISTS idx_repe_capabilities_env_active
  ON repe_capabilities (env_id, active, mutation_class);
CREATE INDEX IF NOT EXISTS idx_winston_eval_scenarios_env_active
  ON winston_eval_scenarios (env_id, active, domain);
CREATE INDEX IF NOT EXISTS idx_winston_eval_observations_run
  ON winston_eval_observations (run_id, scenario_id);
CREATE INDEX IF NOT EXISTS idx_winston_eval_observations_failure
  ON winston_eval_observations (env_id, pass_fail, failure_category);
CREATE INDEX IF NOT EXISTS idx_re_change_sets_env_status
  ON re_change_sets (env_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_re_change_items_change_set
  ON re_change_items (change_set_id);
