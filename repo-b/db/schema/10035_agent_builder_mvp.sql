-- 10035_agent_builder_mvp.sql
-- Governed Agent Builder read-only MVP.
--
-- Primary Postgres/Supabase is the operational source of truth for workflow drafts,
-- immutable versions, synchronous dry-runs, append-only events, receipts, and
-- simulated approvals. Heavy telemetry analytics remain outside these tables.
-- Additive and idempotent. Owning module: AI / Agent Control Tower.

CREATE TABLE IF NOT EXISTS ai_agent_workflows (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    name                text NOT NULL,
    description         text,
    owner_user_id       text,
    status              text NOT NULL DEFAULT 'draft',
    current_version_id  uuid,
    tags                text[] NOT NULL DEFAULT '{}'::text[],
    is_template         boolean NOT NULL DEFAULT false,
    template_key        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, template_key)
);

CREATE TABLE IF NOT EXISTS ai_agent_workflow_versions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                text NOT NULL,
    business_id           uuid NOT NULL,
    workflow_id           uuid NOT NULL REFERENCES ai_agent_workflows(id) ON DELETE CASCADE,
    version_number        integer NOT NULL CHECK (version_number > 0),
    graph_json            jsonb NOT NULL,
    compiled_plan_json    jsonb,
    prompt_versions       jsonb NOT NULL DEFAULT '{}'::jsonb,
    tool_schema_digests   jsonb NOT NULL DEFAULT '{}'::jsonb,
    model_route_policy    jsonb NOT NULL DEFAULT '{}'::jsonb,
    required_permissions  text[] NOT NULL DEFAULT ARRAY['read']::text[],
    validation_status     text NOT NULL DEFAULT 'pending',
    validation_results    jsonb NOT NULL DEFAULT '[]'::jsonb,
    publish_status        text NOT NULL DEFAULT 'draft',
    created_by            text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, version_number)
);

DO $$
BEGIN
    ALTER TABLE ai_agent_workflows
        ADD CONSTRAINT ai_agent_workflows_current_version_fk
        FOREIGN KEY (current_version_id)
        REFERENCES ai_agent_workflow_versions(id)
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_agent_runs (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                text NOT NULL,
    business_id           uuid NOT NULL,
    workflow_id           uuid NOT NULL REFERENCES ai_agent_workflows(id),
    workflow_version_id   uuid NOT NULL REFERENCES ai_agent_workflow_versions(id),
    actor_user_id         text,
    runtime_mode          text NOT NULL DEFAULT 'dry_run',
    status                text NOT NULL,
    terminal_reason       text,
    started_at            timestamptz NOT NULL DEFAULT now(),
    finished_at           timestamptz,
    input_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_json           jsonb,
    error_json            jsonb,
    cost_estimate         numeric(14, 6) NOT NULL DEFAULT 0,
    actual_cost           numeric(14, 6) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_agent_run_steps (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    run_id          uuid NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    node_id         text NOT NULL,
    node_type       text NOT NULL,
    status          text NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    input_hash      text,
    output_hash     text,
    input_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_json     jsonb,
    tool_name       text,
    model_name      text,
    error_json      jsonb,
    receipt_id      uuid,
    UNIQUE (run_id, node_id)
);

CREATE TABLE IF NOT EXISTS ai_agent_run_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    run_id          uuid NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    step_id         uuid REFERENCES ai_agent_run_steps(id),
    node_id         text,
    sequence_number bigint NOT NULL,
    event_type      text NOT NULL,
    status          text,
    payload_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS ai_agent_receipts (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id            text NOT NULL,
    business_id       uuid NOT NULL,
    workflow_id       uuid NOT NULL REFERENCES ai_agent_workflows(id),
    workflow_version_id uuid NOT NULL REFERENCES ai_agent_workflow_versions(id),
    run_id            uuid NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    step_id           uuid REFERENCES ai_agent_run_steps(id),
    node_id           text NOT NULL,
    receipt_type      text NOT NULL,
    actor             text,
    input_hash        text,
    output_hash       text,
    tools_called      jsonb NOT NULL DEFAULT '[]'::jsonb,
    model_used        text,
    cost_estimate     numeric(14, 6) NOT NULL DEFAULT 0,
    terminal_status   text NOT NULL,
    failure_reason    text,
    receipt_json      jsonb NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    ALTER TABLE ai_agent_run_steps
        ADD CONSTRAINT ai_agent_run_steps_receipt_fk
        FOREIGN KEY (receipt_id) REFERENCES ai_agent_receipts(id)
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_agent_approvals (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id            text NOT NULL,
    business_id       uuid NOT NULL,
    run_id            uuid NOT NULL REFERENCES ai_agent_runs(id) ON DELETE CASCADE,
    node_id           text NOT NULL,
    requested_by      text,
    approved_by       text,
    approval_status   text NOT NULL DEFAULT 'simulated_pending',
    approval_reason   text,
    requested_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_workflows_tenant_updated
    ON ai_agent_workflows (env_id, business_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_versions_tenant_workflow
    ON ai_agent_workflow_versions (env_id, business_id, workflow_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_tenant_started
    ON ai_agent_runs (env_id, business_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_steps_run
    ON ai_agent_run_steps (env_id, business_id, run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_ai_agent_events_run_sequence
    ON ai_agent_run_events (env_id, business_id, run_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_ai_agent_receipts_run
    ON ai_agent_receipts (env_id, business_id, run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_agent_approvals_run
    ON ai_agent_approvals (env_id, business_id, run_id, requested_at);

ALTER TABLE ai_agent_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_approvals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'ai_agent_workflows',
        'ai_agent_workflow_versions',
        'ai_agent_runs',
        'ai_agent_run_steps',
        'ai_agent_run_events',
        'ai_agent_receipts',
        'ai_agent_approvals'
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

CREATE OR REPLACE FUNCTION ai_agent_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS ai_agent_run_events_append_only ON ai_agent_run_events;
CREATE TRIGGER ai_agent_run_events_append_only
    BEFORE UPDATE OR DELETE ON ai_agent_run_events
    FOR EACH ROW EXECUTE FUNCTION ai_agent_reject_mutation();

DROP TRIGGER IF EXISTS ai_agent_receipts_append_only ON ai_agent_receipts;
CREATE TRIGGER ai_agent_receipts_append_only
    BEFORE UPDATE OR DELETE ON ai_agent_receipts
    FOR EACH ROW EXECUTE FUNCTION ai_agent_reject_mutation();

COMMENT ON TABLE ai_agent_workflows IS
  'Agent Builder workflow identity and mutable pointer to the current immutable draft version. Tenant-scoped operational truth.';
COMMENT ON TABLE ai_agent_workflow_versions IS
  'Immutable Agent Builder graph versions with prompt/tool/model-route pins and validation evidence.';
COMMENT ON TABLE ai_agent_runs IS
  'Agent Builder synchronous execution records. MVP runtime_mode is dry_run only.';
COMMENT ON TABLE ai_agent_run_steps IS
  'Per-node Agent Builder execution trace with redacted payloads and canonical SHA-256 hashes.';
COMMENT ON TABLE ai_agent_run_events IS
  'Append-only ordered Agent Builder run events used for UI state, trace, and replay evidence.';
COMMENT ON TABLE ai_agent_receipts IS
  'Append-only Agent Builder audit receipts for tool, model, approval, and workflow steps.';
COMMENT ON TABLE ai_agent_approvals IS
  'Agent Builder approval requests. MVP writes simulated_pending rows and does not resume execution.';

DO $$
DECLARE
    table_count int;
    rls_count int;
    trigger_count int;
BEGIN
    SELECT count(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'ai_agent_workflows', 'ai_agent_workflow_versions', 'ai_agent_runs',
        'ai_agent_run_steps', 'ai_agent_run_events', 'ai_agent_receipts',
        'ai_agent_approvals'
      );

    SELECT count(*) INTO rls_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = true
      AND tablename IN (
        'ai_agent_workflows', 'ai_agent_workflow_versions', 'ai_agent_runs',
        'ai_agent_run_steps', 'ai_agent_run_events', 'ai_agent_receipts',
        'ai_agent_approvals'
      );

    SELECT count(*) INTO trigger_count
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN ('ai_agent_run_events_append_only', 'ai_agent_receipts_append_only');

    IF table_count <> 7 OR rls_count <> 7 OR trigger_count <> 2 THEN
        RAISE EXCEPTION
          'agent builder 10035 incomplete: tables %, RLS %, append-only triggers %',
          table_count, rls_count, trigger_count;
    END IF;
    RAISE NOTICE 'agent builder 10035 ready: 7 tables, 7 RLS policies, 2 append-only guards';
END $$;
