-- 523_operator_runtime_columns.sql
-- Dual-runtime support for the Winston chat surface.
-- Adds first-class Anthropic Managed Agent session ownership to ai_conversations,
-- a per-turn receipts ledger for cost / routing decisions, and a durable pending-confirmation
-- registry that survives backend restarts and supports multiple in-flight tool confirmations
-- per Anthropic session.

-- 1. Runtime classification + first-class Anthropic session ownership on ai_conversations.
ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS runtime text NOT NULL DEFAULT 'gateway'
    CHECK (runtime IN ('gateway', 'managed_agent')),
  ADD COLUMN IF NOT EXISTS anthropic_session_id      text,
  ADD COLUMN IF NOT EXISTS anthropic_agent_id        text,
  ADD COLUMN IF NOT EXISTS anthropic_agent_version   integer,
  ADD COLUMN IF NOT EXISTS anthropic_environment_id  text,
  ADD COLUMN IF NOT EXISTS anthropic_vault_id        text,
  ADD COLUMN IF NOT EXISTS session_health_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_health_status     text
    CHECK (session_health_status IS NULL OR session_health_status IN ('healthy', 'expired', 'invalidated', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_ai_conversations_business_runtime
  ON ai_conversations (business_id, runtime, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_anthropic_session
  ON ai_conversations (anthropic_session_id) WHERE anthropic_session_id IS NOT NULL;

COMMENT ON COLUMN ai_conversations.runtime IS
  'Which Winston runtime owns this conversation: gateway (OpenAI/FastAPI) or managed_agent (Operator / Anthropic Managed Agent).';
COMMENT ON COLUMN ai_conversations.anthropic_session_id IS
  'Anthropic Managed Agent session id. First-class so health can be validated before each turn without scanning message_meta.';
COMMENT ON COLUMN ai_conversations.session_health_status IS
  'Result of the most recent client.beta.sessions.retrieve check; drives transparent re-provisioning when expired or invalidated.';

-- 2. Per-turn receipts ledger.
-- Captures runtime decision, model, token usage, tool count, and stop reason for every turn.
-- Owned by the operator_agent service initially; gateway can backfill rows later for unified cost views.
CREATE TABLE IF NOT EXISTS ai_runtime_receipts (
  receipt_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      uuid NOT NULL REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE,
  message_id           uuid REFERENCES ai_messages(message_id) ON DELETE SET NULL,
  business_id          uuid NOT NULL,
  env_id               uuid,
  runtime              text NOT NULL CHECK (runtime IN ('gateway', 'managed_agent')),
  model                text,
  tokens_in            integer,
  tokens_out           integer,
  tool_calls           integer,
  session_runtime_ms   integer,
  routing_decision     text,
    -- 'manual_gateway' | 'manual_operator' | 'auto_gateway' | 'auto_operator' | 'query_param'
  routing_reason       text,
    -- e.g. 'explicit_toggle', 'keyword_heuristic', 'auto_resolved_client'
  anthropic_session_id text,
  stop_reason_type     text,
  errors               jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_runtime_receipts_business_created
  ON ai_runtime_receipts (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runtime_receipts_conversation
  ON ai_runtime_receipts (conversation_id, created_at DESC);

COMMENT ON TABLE ai_runtime_receipts IS
  'Per-turn receipts for runtime decisions, cost tracking, and future auto-router training data. Owned by operator_agent service.';

-- 3. Durable pending-confirmation registry.
-- Survives backend restarts; supports multiple in-flight confirmations within one Anthropic session.
-- Keyed by (anthropic_session_id, tool_call_id) so confirmations cannot be cross-wired.
CREATE TABLE IF NOT EXISTS operator_pending_confirmations (
  pending_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anthropic_session_id text NOT NULL,
  tool_call_id         text NOT NULL,
  conversation_id      uuid NOT NULL REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL,
  env_id               uuid,
  tool_name            text NOT NULL,
  tool_input           jsonb NOT NULL,
  status               text NOT NULL DEFAULT 'awaiting'
    CHECK (status IN ('awaiting', 'allowed', 'denied', 'expired', 'aborted')),
  decision_reason      text,
  decided_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  decided_at           timestamptz,
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  UNIQUE (anthropic_session_id, tool_call_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_pending_confirmations_status_expires
  ON operator_pending_confirmations (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_operator_pending_confirmations_session
  ON operator_pending_confirmations (anthropic_session_id, created_at DESC);

COMMENT ON TABLE operator_pending_confirmations IS
  'Durable pending tool-confirmation registry for Operator runtime. Sweep task expires awaiting rows past expires_at.';
