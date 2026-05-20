-- 613_outreach_personalizer_scaffold_env.sql
-- Outreach Personalizer Phase 3: explicit scaffolded_env_id link on
-- cro_outreach_target so the operator can provision a prospect-demo
-- environment via environment_pipeline_v2.create_environment_v2() with
-- per-target idempotency. The v2 pipeline is itself slug-idempotent
-- (defense-in-depth); the operator contract is enforced by this column.
--
-- Pre-check (mandatory; performed in the Phase 3 plan):
--   • column does NOT exist on origin/main 611+612 (confirmed via grep)
--   • column does NOT exist on live Supabase (confirmed via
--     information_schema.columns query)
-- If a later session needs to rerun this migration, the IF NOT EXISTS guard
-- makes the ADD COLUMN a no-op on rerun. A type mismatch would surface as an
-- error rather than silently corrupt the schema.
--
-- Additive only. Cross-schema FK is valid Postgres; ON DELETE SET NULL so
-- deleting the env in v2 simply detaches the target rather than cascading
-- destructively into outreach state.
--
-- Depends on: 515_environments_v2_columns (app.environments),
--             611_outreach_personalizer, 612_outreach_personalizer_opportunity_link.

BEGIN;

ALTER TABLE cro_outreach_target
    ADD COLUMN IF NOT EXISTS scaffolded_env_id uuid
    REFERENCES app.environments(env_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cro_outreach_target_scaffolded_env
    ON cro_outreach_target (scaffolded_env_id)
    WHERE scaffolded_env_id IS NOT NULL;

COMMENT ON COLUMN cro_outreach_target.scaffolded_env_id IS
  'Explicit FK to the app.environments row scaffolded for this target via environment_pipeline_v2.create_environment_v2. Single-env-per-target operator idempotency; set once, cleared via SET NULL only if the env row is deleted. Phase 3.';

COMMIT;
