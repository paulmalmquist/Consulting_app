-- 1004_ai_pending_actions.sql
-- Durable pending action records for Winston confirmation workflow.
-- When Winston proposes an action requiring user confirmation, a row is
-- created here. On the next user turn the gateway resolves the pending
-- action BEFORE normal intent routing.

CREATE TABLE IF NOT EXISTS ai_pending_actions (
  pending_action_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid NOT NULL REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE,
  message_id          uuid REFERENCES ai_messages(message_id) ON DELETE SET NULL,
  business_id         uuid NOT NULL,
  env_id              uuid,
  actor               text NOT NULL DEFAULT 'anonymous',

  -- Action definition
  skill_id            text,                            -- e.g. 'finance.create_fund'
  action_type         text NOT NULL,                   -- tool name or action category
  params_json         jsonb NOT NULL DEFAULT '{}'::jsonb, -- parameters collected so far
  missing_fields      jsonb,                           -- array of field names still needed

  -- State machine
  status              text NOT NULL DEFAULT 'awaiting_confirmation'
                      CHECK (status IN (
                        'awaiting_confirmation',
                        'confirmed',
                        'cancelled',
                        'superseded',
                        'expired',
                        'executed',
                        'failed'
                      )),
  resolution_message  text,                            -- user message that resolved this action

  -- Scope metadata
  scope_type          text,                            -- fund, asset, deal, environment, etc.
  scope_id            text,
  scope_label         text,

  -- Expiration
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),

  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz
);

ALTER TABLE ai_pending_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ai_pending_actions_tenant_isolation ON ai_pending_actions
    USING (business_id = current_setting('app.current_business_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_conversation
  ON ai_pending_actions (conversation_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_business
  ON ai_pending_actions (business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_expires
  ON ai_pending_actions (expires_at)
  WHERE status = 'awaiting_confirmation';

COMMENT ON TABLE ai_pending_actions IS 'Durable pending action records for Winston two-phase confirmation workflow. Owned by ai-copilot.';
