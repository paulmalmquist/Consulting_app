-- 031_winston_contract_observations.sql
-- Shadow-mode observation log for the Winston response-contract enforcer.
--
-- One row per turn that the enforcer wraps. Records the validator's verdict
-- (valid, terminal_event, final_state, violations, runtime_identity) without
-- modifying the hot-path ai_gateway_logs row.
--
-- Append-only. Queryable by (business_id, created_at DESC) for shadow soak
-- dashboards; by (category, created_at DESC) for per-category trend lines.
--
-- Phase 2 policy: WRITE-ONLY from the enforcer. No blocking, no alerts.
-- Phase 3 flips to enforce mode — critical violations short-circuit the
-- stream and emit a structured error/done pair.

CREATE TABLE IF NOT EXISTS ai_contract_observations (
  observation_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid,
  env_id              uuid,

  request_id          text,
  conversation_id     uuid REFERENCES ai_conversations(conversation_id) ON DELETE SET NULL,
  session_id          text,
  ai_gateway_log_id   uuid REFERENCES ai_gateway_logs(id) ON DELETE SET NULL,

  contract_version              text NOT NULL,
  request_lifecycle_version     text NOT NULL,
  mode                text NOT NULL DEFAULT 'shadow'   -- 'shadow' | 'enforce' (Phase 3)
                       CHECK (mode IN ('shadow', 'enforce')),

  -- Verdict
  valid                 boolean NOT NULL,
  terminal_event        text,                          -- 'done' | 'error' | null
  final_state           text NOT NULL,                 -- LifecyclePhase value
  violation_count       int NOT NULL DEFAULT 0,
  critical_violations   int NOT NULL DEFAULT 0,
  top_category          text,                          -- first violation's category
  violations            jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Identity
  runtime_path          text,                          -- canonical | fallback | fast
  runtime_lane          text,                          -- A_FAST / B_LOOKUP / C_ANALYSIS / F / unknown
  response_shape_hash   text NOT NULL,

  -- Shape
  event_count           int NOT NULL DEFAULT 0,
  event_type_sequence   text[],                        -- truncated to first 40 for auditability

  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_contract_observations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ai_contract_observations_tenant_isolation ON ai_contract_observations
    USING (business_id = current_setting('app.current_business_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ai_contract_obs_business_created
  ON ai_contract_observations (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_contract_obs_invalid
  ON ai_contract_observations (created_at DESC)
  WHERE valid = false;

CREATE INDEX IF NOT EXISTS idx_ai_contract_obs_category
  ON ai_contract_observations (top_category, created_at DESC)
  WHERE top_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_contract_obs_path
  ON ai_contract_observations (runtime_path, created_at DESC)
  WHERE runtime_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_contract_obs_conversation
  ON ai_contract_observations (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

COMMENT ON TABLE ai_contract_observations IS 'Per-turn Winston response-contract verdict. Write-only from contract_enforcer during shadow mode. Owned by ai-copilot.';
COMMENT ON COLUMN ai_contract_observations.mode IS 'shadow = observation-only (Phase 2); enforce = critical violations short-circuit the stream (Phase 3).';
COMMENT ON COLUMN ai_contract_observations.valid IS 'Overall verdict from validate_turn(). False if any critical-severity violation.';
COMMENT ON COLUMN ai_contract_observations.event_type_sequence IS 'Ordered event-type strings, truncated to first 40 for auditability.';
