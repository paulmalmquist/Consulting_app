-- Migration 10031: Per-env AI behavior contract registry (Dispatch 0004 — Phase 3c)
--
-- Adds app.environment_ai_behavior_contracts: the authoritative record of which
-- AI behavior contract an environment has explicitly declared. This is the table
-- the EnvironmentContract verifier resolves for ai_runtime.behavior_contract_present.
-- Until it existed the verifier hard-coded that check missing/blocking — one of
-- the remaining blockers between a fully-provisioned env and 'released'.
--
-- Scope is deliberately narrow: a presence/validity record, NOT a redesign of the
-- AI runtime, event lifecycle, or streaming contract. It records WHICH behavior
-- contract applies and whether it is enabled and well-formed; contract_enforcer.py
-- and the response-contract types remain the source of truth for runtime behavior.
--
-- app.* internal system schema. env_id-keyed, exempt from the public-prefix rule,
-- does NOT use the public.* env_id TEXT + business_id UUID + RLS template. Mirrors
-- app.environment_capabilities (10030) style, incl. the shared updated_at trigger.
--
-- Additive only. ZERO BACKFILL: creates the table and binds NOTHING for any
-- existing environment. Absence of a row = no declared AI behavior contract = the
-- verifier fails closed (missing/blocking). No existing environment is made
-- promotable by applying this migration. AI behavior contracts are NEVER inferred
-- from enabled_modules / "AI enabled". Rows are created explicitly (source=manual
-- via API/operator) until Phase 5 adds a structured declaration field on
-- app.environment_templates / EnvironmentManifestV2.
-- Dispatch: docs/plans/03-implementation-plans/active/0004-environment-contract-promotion-gate.md

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.environment_ai_behavior_contracts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                   uuid NOT NULL
                             REFERENCES app.environments(env_id) ON DELETE CASCADE,
  contract_key             text NOT NULL,
  contract_version         text NOT NULL DEFAULT 'ai_behavior_v1',
  runtime_contract_key     text,
  required_event_contract  text,
  required_tool_policy     text,
  required_receipt_policy  text,
  source                   text NOT NULL DEFAULT 'template'
                             CHECK (source IN ('template', 'manual', 'backfill')),
  enabled                  boolean NOT NULL DEFAULT true,
  metadata                 jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, contract_key)
);

CREATE INDEX IF NOT EXISTS idx_environment_ai_behavior_contracts_env
  ON app.environment_ai_behavior_contracts (env_id);

-- Workload: the verifier resolves the enabled behavior contract for an env;
-- partial predicate keeps the index to live rows.
CREATE INDEX IF NOT EXISTS idx_environment_ai_behavior_contracts_contract
  ON app.environment_ai_behavior_contracts (contract_key)
  WHERE enabled = true;

-- Reuse the established updated_at touch idiom (declared in 10004).
DO $$ BEGIN
  CREATE TRIGGER trg_environment_ai_behavior_contracts_updated_at
    BEFORE UPDATE ON app.environment_ai_behavior_contracts
    FOR EACH ROW EXECUTE FUNCTION app.environment_contract_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE app.environment_ai_behavior_contracts IS
  'Authoritative per-env AI behavior contract declaration (presence + validity, '
  'NOT an AI-runtime redesign). Resolved by the EnvironmentContract verifier for '
  'ai_runtime.behavior_contract_present. Absence = no declared contract '
  '(fail-closed). Never inferred from enabled_modules / "AI enabled". No broad '
  'backfill. Owning module: backend/app/services/environment_contract_v2.py.';

COMMENT ON COLUMN app.environment_ai_behavior_contracts.contract_version IS
  'Supported version is ai_behavior_v1 (aligned with AI runtime CONTRACT_VERSION). '
  'A row whose version is unsupported is treated as malformed -> blocking fail, '
  'never a silent pass.';

COMMENT ON COLUMN app.environment_ai_behavior_contracts.enabled IS
  'A disabled row is NOT a satisfied behavior contract — the verifier treats it as '
  'a blocking failure (distinct from missing).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification queries (run after apply):
--   SELECT to_regclass('app.environment_ai_behavior_contracts') IS NOT NULL AS tbl_ok;
--   SELECT count(*) AS rows_zero_backfill FROM app.environment_ai_behavior_contracts;
-- ═══════════════════════════════════════════════════════════════════════════════
