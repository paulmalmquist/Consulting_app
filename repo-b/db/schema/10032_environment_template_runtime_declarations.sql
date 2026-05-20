-- Migration 10032: runtime_mode + AI behavior contract declaration fields
-- (Dispatch 0004 — Phase 5 closure)
--
-- Adds the structured declaration channel that lets v2 pipeline-provisioned
-- environments derive runtime_mode and bind an AI behavior contract WITHOUT
-- manual contract stubbing and WITHOUT unsafe inference.
--
-- Three nullable columns on app.environment_templates:
--   runtime_mode                  static | interactive | agentic | headless
--   ai_behavior_contract_key      e.g. 'default', 'repe_v1', 'pds_v1'
--   ai_behavior_contract_version  defaults to 'ai_behavior_v1' (aligned with
--                                 environment_contract_v2._SUPPORTED_AI_BEHAVIOR_VERSIONS,
--                                 which is itself pinned to AI runtime CONTRACT_VERSION)
--
-- Additive only. ZERO BROAD BACKFILL: existing template rows keep NULL in all
-- three columns. Existing envs whose templates declare nothing remain blocked
-- exactly as before (runtime.mode_explicit = unknown; behavior_contract_present
-- = missing). No env becomes promotable by applying this migration.
--
-- These are STRUCTURED columns, NOT manifest_overflow keys. Routing, auth,
-- capabilities, and runtime declarations all use structured columns per
-- Dispatch 0004 / migration 515 rules.
-- Dispatch: docs/plans/03-implementation-plans/active/0004-environment-contract-promotion-gate.md

ALTER TABLE app.environment_templates
  ADD COLUMN IF NOT EXISTS runtime_mode                  text
    CHECK (runtime_mode IS NULL OR runtime_mode IN
      ('static', 'interactive', 'agentic', 'headless')),
  ADD COLUMN IF NOT EXISTS ai_behavior_contract_key      text,
  ADD COLUMN IF NOT EXISTS ai_behavior_contract_version  text;

COMMENT ON COLUMN app.environment_templates.runtime_mode IS
  'Declared runtime mode for envs created from this template. The verifier reads '
  'this via _derive_contract_fields (manifest override -> template -> NULL). NULL '
  'leaves runtime.mode_explicit blocking — never inferred.';

COMMENT ON COLUMN app.environment_templates.ai_behavior_contract_key IS
  'Declared AI behavior contract key for envs created from this template. The v2 '
  'pipeline binds one row into app.environment_ai_behavior_contracts when this is '
  'non-null. NULL leaves ai_runtime.behavior_contract_present blocking — never '
  'inferred from enabled_modules / "AI enabled".';

COMMENT ON COLUMN app.environment_templates.ai_behavior_contract_version IS
  'Defaults to ai_behavior_v1 at bind time (read by the v2 pipeline). Pinned to '
  'environment_contract_v2._SUPPORTED_AI_BEHAVIOR_VERSIONS; an unsupported value '
  'is treated as malformed by the verifier (blocking fail).';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification queries (run after apply):
--
--   -- columns present
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='app' AND table_name='environment_templates'
--      AND column_name IN ('runtime_mode','ai_behavior_contract_key',
--                          'ai_behavior_contract_version');
--
--   -- no template row has been populated by this migration (zero backfill)
--   SELECT count(*) AS declared_runtime_mode
--     FROM app.environment_templates WHERE runtime_mode IS NOT NULL;  -- expect 0
--   SELECT count(*) AS declared_ai_behavior
--     FROM app.environment_templates
--    WHERE ai_behavior_contract_key IS NOT NULL;                      -- expect 0
-- ═══════════════════════════════════════════════════════════════════════════════
