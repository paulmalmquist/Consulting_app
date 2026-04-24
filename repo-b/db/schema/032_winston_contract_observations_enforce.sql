-- 032_winston_contract_observations_enforce.sql
-- Additive migration: adds Phase 3a enforcement tracking columns to
-- ai_contract_observations. No data loss; all new columns default safely.
--
-- Enforcement semantics:
--   enforced=true        → wrapper suppressed ≥1 upstream event
--   emitted_fallback=true → wrapper synthesized a canonical error+done pair
--   enforcement_reason   → the violation category that triggered enforcement
--   fallback_code        → stable error code in the emitted error payload

ALTER TABLE ai_contract_observations
  ADD COLUMN IF NOT EXISTS enforced           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enforcement_reason text,
  ADD COLUMN IF NOT EXISTS emitted_fallback   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_code      text;

-- Index: query "how many enforcements in the last 24h?" efficiently.
CREATE INDEX IF NOT EXISTS idx_ai_contract_obs_enforced
  ON ai_contract_observations (created_at DESC)
  WHERE enforced = true;

COMMENT ON COLUMN ai_contract_observations.enforced IS 'True when enforce mode suppressed ≥1 upstream SSE event (Phase 3a+).';
COMMENT ON COLUMN ai_contract_observations.enforcement_reason IS 'Violation category that triggered enforcement (e.g. no_terminal_state, tokens_after_terminal).';
COMMENT ON COLUMN ai_contract_observations.emitted_fallback IS 'True when wrapper emitted a canonical error+done fallback to the client.';
COMMENT ON COLUMN ai_contract_observations.fallback_code IS 'Stable error code carried in the emitted fallback error payload (MISSING_TERMINAL_EVENT, INVALID_RESPONSE_SEQUENCE, …).';
