-- 10018_workflow_registry.sql
-- Workflow Registry for the Automated Data Engineering governed fabric (plan PR 2).
--
-- A workflow is a named, reusable execution sequence (e.g. Ticket->PR, the
-- Source->Bronze->Silver->Gold data-engineering loop, a telemetry investigation).
-- PR 2 ships the catalog/definitions layer only: there is NO execution engine and
-- NO run-history table. Hot run state is two columns on the definition row
-- (run_count, last_run_at). Future workflow run/history analytics belong in
-- BigQuery (Resource Selection Doctrine), not in additional Postgres tables.
--
-- Owning module: backend/app/services/workflow_registry.py. Surfaced read+write
-- via /api/ade/workflows. Per-environment business data: full RLS + env_id/business_id.
-- Approved prefix: nv_ (Novendor platform-core; no new prefix introduced).

CREATE TABLE IF NOT EXISTS nv_workflow_definitions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id        text NOT NULL,
    business_id   uuid NOT NULL,
    slug          text NOT NULL,
    name          text NOT NULL,
    description   text,
    domain        text NOT NULL DEFAULT 'data_engineering'
                  CHECK (domain IN ('data_engineering', 'telemetry', 'investigation', 'devops')),
    steps         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{step_name, tool_name, inputs, outputs}]
    input_schema  jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    owner         text,
    last_run_at   timestamptz,                          -- hot state; NOT a run-history table
    run_count     int NOT NULL DEFAULT 0 CHECK (run_count >= 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, slug)
);

ALTER TABLE nv_workflow_definitions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    CREATE POLICY nv_workflow_definitions_tenant ON nv_workflow_definitions
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

COMMENT ON TABLE nv_workflow_definitions IS
    'Workflow Registry definitions for the ADE governed fabric (plan PR 2). Catalog only: '
    'no execution engine, no run-history table. run_count/last_run_at are hot counters; '
    'durable run/history analytics go to BigQuery. Owning module: workflow_registry.py.';
