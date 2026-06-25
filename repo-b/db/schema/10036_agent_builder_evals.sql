-- 10036_agent_builder_evals.sql
-- Deterministic Agent Builder eval lifecycle and staged publish gate.
--
-- Additive and idempotent. Production execution remains disabled: this migration
-- only persists eval evidence, regression memory, and staged publication metadata.

ALTER TABLE ai_agent_workflow_versions
    ADD COLUMN IF NOT EXISTS published_by text,
    ADD COLUMN IF NOT EXISTS published_at timestamptz,
    ADD COLUMN IF NOT EXISTS publish_blockers jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS ai_agent_eval_suites (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                text NOT NULL,
    business_id           uuid NOT NULL,
    workflow_id           uuid NOT NULL REFERENCES ai_agent_workflows(id) ON DELETE CASCADE,
    workflow_version_id   uuid NOT NULL REFERENCES ai_agent_workflow_versions(id) ON DELETE CASCADE,
    name                  text NOT NULL DEFAULT 'Publish readiness',
    status                text NOT NULL DEFAULT 'active',
    required_classes      text[] NOT NULL DEFAULT ARRAY[
                            'graph_lint', 'tool_contract', 'permission',
                            'fail_closed', 'cost', 'regression',
                            'replay_determinism'
                          ]::text[],
    created_by            text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_version_id, name)
);

CREATE TABLE IF NOT EXISTS ai_agent_eval_cases (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                text NOT NULL,
    business_id           uuid NOT NULL,
    suite_id              uuid NOT NULL REFERENCES ai_agent_eval_suites(id) ON DELETE CASCADE,
    case_key              text NOT NULL,
    eval_class            text NOT NULL,
    title                 text NOT NULL,
    input_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
    expected_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
    source                text NOT NULL DEFAULT 'generated',
    active                boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (suite_id, case_key)
);

CREATE TABLE IF NOT EXISTS ai_agent_eval_runs (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                text NOT NULL,
    business_id           uuid NOT NULL,
    suite_id              uuid NOT NULL REFERENCES ai_agent_eval_suites(id),
    workflow_id           uuid NOT NULL REFERENCES ai_agent_workflows(id),
    workflow_version_id   uuid NOT NULL REFERENCES ai_agent_workflow_versions(id),
    actor_user_id         text,
    status                text NOT NULL DEFAULT 'running',
    overall_status        text NOT NULL DEFAULT 'blocked',
    summary_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at            timestamptz NOT NULL DEFAULT now(),
    finished_at           timestamptz
);

CREATE TABLE IF NOT EXISTS ai_agent_eval_results (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                text NOT NULL,
    business_id           uuid NOT NULL,
    eval_run_id           uuid NOT NULL REFERENCES ai_agent_eval_runs(id) ON DELETE CASCADE,
    eval_case_id          uuid NOT NULL REFERENCES ai_agent_eval_cases(id),
    eval_class            text NOT NULL,
    status                text NOT NULL,
    input_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
    expected_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
    actual_json           jsonb NOT NULL DEFAULT '{}'::jsonb,
    failed_assertion      text,
    trace_run_id          uuid REFERENCES ai_agent_runs(id),
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (eval_run_id, eval_case_id)
);

CREATE TABLE IF NOT EXISTS ai_agent_failure_memory (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                text NOT NULL,
    business_id           uuid NOT NULL,
    workflow_id           uuid NOT NULL REFERENCES ai_agent_workflows(id) ON DELETE CASCADE,
    workflow_version_id   uuid NOT NULL REFERENCES ai_agent_workflow_versions(id),
    source_run_id         uuid NOT NULL REFERENCES ai_agent_runs(id),
    eval_case_id          uuid REFERENCES ai_agent_eval_cases(id),
    failure_signature     text NOT NULL,
    input_hash            text NOT NULL,
    input_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
    expected_behavior     jsonb NOT NULL DEFAULT '{}'::jsonb,
    actual_behavior       jsonb NOT NULL DEFAULT '{}'::jsonb,
    failure_reason        text,
    created_by            text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_run_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_eval_suites_tenant_workflow
    ON ai_agent_eval_suites (env_id, business_id, workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_eval_cases_tenant_suite
    ON ai_agent_eval_cases (env_id, business_id, suite_id, eval_class, active);
CREATE INDEX IF NOT EXISTS idx_ai_agent_eval_runs_tenant_workflow
    ON ai_agent_eval_runs (env_id, business_id, workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_eval_results_tenant_run
    ON ai_agent_eval_results (env_id, business_id, eval_run_id, eval_class);
CREATE INDEX IF NOT EXISTS idx_ai_agent_failure_memory_tenant_workflow
    ON ai_agent_failure_memory (env_id, business_id, workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_failure_memory_input
    ON ai_agent_failure_memory (workflow_id, input_hash, created_at DESC);

ALTER TABLE ai_agent_eval_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_eval_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_eval_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_failure_memory ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'ai_agent_eval_suites',
        'ai_agent_eval_cases',
        'ai_agent_eval_runs',
        'ai_agent_eval_results',
        'ai_agent_failure_memory'
    ]
    LOOP
        BEGIN
            EXECUTE format(
                'CREATE POLICY %I ON %I
                 USING (
                    env_id = current_setting(''app.env_id'', true)
                    AND (
                        nullif(current_setting(''app.business_id'', true), '''') IS NULL
                        OR business_id::text = current_setting(''app.business_id'', true)
                    )
                 )
                 WITH CHECK (
                    env_id = current_setting(''app.env_id'', true)
                    AND (
                        nullif(current_setting(''app.business_id'', true), '''') IS NULL
                        OR business_id::text = current_setting(''app.business_id'', true)
                    )
                 )',
                table_name || '_tenant',
                table_name
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END LOOP;
END $$;

DROP TRIGGER IF EXISTS ai_agent_eval_results_append_only ON ai_agent_eval_results;
CREATE TRIGGER ai_agent_eval_results_append_only
    BEFORE UPDATE OR DELETE ON ai_agent_eval_results
    FOR EACH ROW EXECUTE FUNCTION ai_agent_reject_mutation();

DROP TRIGGER IF EXISTS ai_agent_failure_memory_append_only ON ai_agent_failure_memory;
CREATE TRIGGER ai_agent_failure_memory_append_only
    BEFORE UPDATE OR DELETE ON ai_agent_failure_memory
    FOR EACH ROW EXECUTE FUNCTION ai_agent_reject_mutation();

COMMENT ON TABLE ai_agent_eval_suites IS
  'Version-pinned Agent Builder publish-readiness suite and required deterministic eval classes.';
COMMENT ON TABLE ai_agent_eval_cases IS
  'First-class generated and regression Agent Builder eval cases.';
COMMENT ON TABLE ai_agent_eval_runs IS
  'Persisted evaluation executions for one immutable workflow version.';
COMMENT ON TABLE ai_agent_eval_results IS
  'Append-only per-case eval evidence with expected, actual, assertion, and trace linkage.';
COMMENT ON TABLE ai_agent_failure_memory IS
  'Append-only promoted failed runs used to prevent regressions on later workflow versions.';

DO $$
DECLARE
    table_count int;
    rls_count int;
    trigger_count int;
    version_column_count int;
BEGIN
    SELECT count(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'ai_agent_eval_suites', 'ai_agent_eval_cases', 'ai_agent_eval_runs',
        'ai_agent_eval_results', 'ai_agent_failure_memory'
      );

    SELECT count(*) INTO rls_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = true
      AND tablename IN (
        'ai_agent_eval_suites', 'ai_agent_eval_cases', 'ai_agent_eval_runs',
        'ai_agent_eval_results', 'ai_agent_failure_memory'
      );

    SELECT count(*) INTO trigger_count
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'ai_agent_eval_results_append_only',
        'ai_agent_failure_memory_append_only'
      );

    SELECT count(*) INTO version_column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_agent_workflow_versions'
      AND column_name IN ('published_by', 'published_at', 'publish_blockers');

    IF table_count <> 5 OR rls_count <> 5 OR trigger_count <> 2 OR version_column_count <> 3 THEN
        RAISE EXCEPTION
          'agent builder 10036 incomplete: tables %, RLS %, append-only triggers %, version columns %',
          table_count, rls_count, trigger_count, version_column_count;
    END IF;
    RAISE NOTICE 'agent builder 10036 ready: 5 eval tables, 5 RLS policies, 2 append-only guards';
END $$;
