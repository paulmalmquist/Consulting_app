-- Migration 10030: Environment capability bindings (Dispatch 0004 — Phase 3a)
--
-- Adds app.environment_capabilities: the authoritative per-env record of which
-- capabilities an environment actually has bound (NOT what its template merely
-- advertises). This is the table the EnvironmentContract verifier resolves
-- required_capabilities against; until it existed, the verifier hard-coded
-- capability.binding_implemented = not_available/blocking (fail-closed) and no
-- environment could reach 'released'.
--
-- Scope is deliberately narrow: one row per (env_id, capability_key), bound from
-- the environment's template.enabled_modules at provision time. NOT a capability
-- marketplace, module registry, or template refactor.
--
-- app.* internal system schema (alongside app.environments / app.environment_contract):
-- env_id-keyed, exempt from the public-prefix rule, does NOT use the public.*
-- env_id TEXT + business_id UUID + RLS template. Mirrors app.environment_contract
-- style (incl. the shared updated_at touch idiom declared in 10004).
--
-- Additive only. ZERO BROAD BACKFILL: this migration creates the table and binds
-- NOTHING for any existing environment. Absence of capability rows = the env has
-- no bound capabilities = the verifier fails closed for any env whose contract
-- requires capabilities. No existing environment is made promotable by applying
-- this migration. Existing v2 envs only gain bindings when re-provisioned through
-- the v2 pipeline, or via an explicit (separately-ticketed) opt-in backfill.
-- Dispatch: docs/plans/03-implementation-plans/active/0004-environment-contract-promotion-gate.md

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.environment_capabilities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL
                        REFERENCES app.environments(env_id) ON DELETE CASCADE,
  capability_key      text NOT NULL,
  capability_version  text,
  source              text NOT NULL DEFAULT 'template'
                        CHECK (source IN ('template', 'manual', 'backfill')),
  enabled             boolean NOT NULL DEFAULT true,
  metadata            jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, capability_key)
);

CREATE INDEX IF NOT EXISTS idx_environment_capabilities_env
  ON app.environment_capabilities (env_id);

-- Workload: the verifier resolves a contract's required_capabilities by capability
-- across enabled bindings; partial predicate keeps the index to live bindings.
CREATE INDEX IF NOT EXISTS idx_environment_capabilities_key
  ON app.environment_capabilities (capability_key)
  WHERE enabled = true;

-- Reuse the established updated_at touch idiom (declared in migration 10004).
DO $$ BEGIN
  CREATE TRIGGER trg_environment_capabilities_updated_at
    BEFORE UPDATE ON app.environment_capabilities
    FOR EACH ROW EXECUTE FUNCTION app.environment_contract_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE app.environment_capabilities IS
  'Authoritative per-env bound capabilities (NOT template advertisement). One row '
  'per (env_id, capability_key), bound from template.enabled_modules at provision '
  'time. Resolved by the EnvironmentContract verifier. Absence = no bound '
  'capabilities (fail-closed). No broad backfill. Owning module: '
  'backend/app/services/environment_pipeline_v2.py + environment_contract_v2.py.';

COMMENT ON COLUMN app.environment_capabilities.enabled IS
  'A disabled binding is NOT a satisfied capability — the verifier treats a '
  'required capability whose binding row is disabled as a blocking failure.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification queries (run after apply):
--
--   SELECT to_regclass('app.environment_capabilities') IS NOT NULL AS cap_tbl_ok;
--
--   -- ZERO broad backfill: no binding exists immediately after apply
--   SELECT count(*) AS capability_rows FROM app.environment_capabilities; -- expect 0
--
--   -- no existing env's lifecycle_state / promotion_state changed
--   -- (this migration only creates a table + indexes + trigger)
-- ═══════════════════════════════════════════════════════════════════════════════
