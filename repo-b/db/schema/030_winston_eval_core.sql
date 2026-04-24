-- 030_winston_eval_core.sql
-- Winston autonomous eval loop: run metadata, per-case results, and
-- last-known-good baselines. Sibling of the ai_* observability tables.
-- Owned by ai-copilot.

-- ── winston_eval_runs: one row per eval run (cron, manual, or post-deploy) ──
CREATE TABLE IF NOT EXISTS winston_eval_runs (
  run_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL,
  env_id              uuid,

  trigger             text NOT NULL CHECK (trigger IN ('schedule','manual','post_deploy')),
  suite               text NOT NULL,                       -- 'smoke' | 'full' | custom
  git_sha             text,

  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  status              text NOT NULL DEFAULT 'running'      -- 'running' | 'passed' | 'failed' | 'errored'
                       CHECK (status IN ('running','passed','failed','errored')),

  total_cases         int  NOT NULL DEFAULT 0,
  passed_count        int  NOT NULL DEFAULT 0,
  failed_count        int  NOT NULL DEFAULT 0,
  errored_count       int  NOT NULL DEFAULT 0,
  regressions_count   int  NOT NULL DEFAULT 0,

  summary             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE winston_eval_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY winston_eval_runs_tenant_isolation ON winston_eval_runs
    USING (business_id = current_setting('app.current_business_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_winston_eval_runs_business_started
  ON winston_eval_runs (business_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_winston_eval_runs_status
  ON winston_eval_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_winston_eval_runs_suite
  ON winston_eval_runs (suite, started_at DESC);

COMMENT ON TABLE winston_eval_runs IS 'One row per Winston eval run (cron, manual, post-deploy). Owned by ai-copilot.';


-- ── winston_eval_results: one row per case per run ────────────────────
CREATE TABLE IF NOT EXISTS winston_eval_results (
  result_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid NOT NULL REFERENCES winston_eval_runs(run_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL,
  env_id              uuid,

  case_id             text NOT NULL,
  contract_version    int  NOT NULL DEFAULT 1,
  expected_lane       text,                                -- case-declared expected lane
  observed_lane       text,                                -- actual lane used (A_FAST/B_LOOKUP/C_ANALYSIS/F/unknown)

  status              text NOT NULL                         -- 'pass' | 'fail' | 'error' | 'unavailable' | 'skipped'
                       CHECK (status IN ('pass','fail','error','unavailable','skipped')),
  failure_category    text,                                -- from failure_taxonomy.py

  latency_ms          int,
  ttft_ms             int,
  tool_count          int,
  token_count         int,

  response_excerpt    text,                                -- first ~500 chars, for report grep
  assertion_failures  jsonb NOT NULL DEFAULT '[]'::jsonb,
  trace_summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_gateway_log_id   uuid REFERENCES ai_gateway_logs(id) ON DELETE SET NULL,

  is_regression       boolean NOT NULL DEFAULT false,      -- pass->fail vs baseline
  baseline_delta      jsonb,                               -- structured diff vs baseline when regression

  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE winston_eval_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY winston_eval_results_tenant_isolation ON winston_eval_results
    USING (business_id = current_setting('app.current_business_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_winston_eval_results_run
  ON winston_eval_results (run_id, status);

CREATE INDEX IF NOT EXISTS idx_winston_eval_results_case_history
  ON winston_eval_results (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_winston_eval_results_failures
  ON winston_eval_results (failure_category, created_at DESC)
  WHERE status IN ('fail','error');

CREATE INDEX IF NOT EXISTS idx_winston_eval_results_regressions
  ON winston_eval_results (created_at DESC)
  WHERE is_regression = true;

COMMENT ON TABLE winston_eval_results IS 'One row per case per Winston eval run. Joins to ai_gateway_logs for full trace. Owned by ai-copilot.';


-- ── winston_eval_baselines: last-known-good per composite case_key ────
-- Composite key: (case_id, env_id, contract_version, expected_lane)
-- Bumping contract_version in the case file invalidates old baseline naturally.
CREATE TABLE IF NOT EXISTS winston_eval_baselines (
  baseline_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          uuid NOT NULL,
  env_id               uuid,

  case_id              text NOT NULL,
  contract_version     int  NOT NULL DEFAULT 1,
  expected_lane        text,

  last_pass_run_id     uuid REFERENCES winston_eval_runs(run_id) ON DELETE SET NULL,
  last_pass_result_id  uuid REFERENCES winston_eval_results(result_id) ON DELETE SET NULL,
  last_pass_at         timestamptz NOT NULL,
  last_pass_latency_ms int,
  last_pass_ttft_ms    int,
  last_pass_response_shape_hash text,

  invalidated_at       timestamptz,
  invalidated_reason   text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (business_id, case_id, env_id, contract_version, expected_lane)
);

ALTER TABLE winston_eval_baselines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY winston_eval_baselines_tenant_isolation ON winston_eval_baselines
    USING (business_id = current_setting('app.current_business_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_winston_eval_baselines_case
  ON winston_eval_baselines (case_id, env_id, contract_version);

CREATE INDEX IF NOT EXISTS idx_winston_eval_baselines_active
  ON winston_eval_baselines (business_id, case_id, contract_version)
  WHERE invalidated_at IS NULL;

COMMENT ON TABLE winston_eval_baselines IS 'Last-known-good Winston eval result per (case_id, env_id, contract_version, expected_lane). Used for regression diff. Owned by ai-copilot.';
