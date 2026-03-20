-- 407_ai_decision_audit_log.sql
-- Per-decision governance log for all Winston AI tool calls and responses.
-- Foundation for Accuracy Scorecard (D5 grounding_score column).

CREATE TABLE IF NOT EXISTS ai_decision_audit_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         uuid NOT NULL,
    env_id              text,
    conversation_id     uuid,
    message_id          uuid,
    actor               text NOT NULL DEFAULT 'winston',
    decision_type       text NOT NULL DEFAULT 'tool_call'
      CHECK (decision_type IN ('tool_call', 'response', 'classification', 'fast_path')),
    tool_name           text,
    input_summary       jsonb,
    output_summary      jsonb,
    model_used          text,
    prompt_tokens       int,
    completion_tokens   int,
    latency_ms          int,
    confidence          numeric(5,4),
    grounding_score     numeric(5,4),
    grounding_sources   jsonb,
    error_message       text,
    success             boolean NOT NULL DEFAULT true,
    tags                text[] DEFAULT '{}',
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_decision_audit_biz
    ON ai_decision_audit_log (business_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_audit_conv
    ON ai_decision_audit_log (conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_audit_tool
    ON ai_decision_audit_log (tool_name);
CREATE INDEX IF NOT EXISTS idx_ai_decision_audit_created
    ON ai_decision_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decision_audit_type
    ON ai_decision_audit_log (decision_type);
