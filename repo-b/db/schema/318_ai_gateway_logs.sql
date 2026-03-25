-- 318_ai_gateway_logs.sql
-- Per-request log for Winston AI gateway: routing decisions, model usage, tool calls, RAG, cost.
-- Queryable audit trail for debugging conversation flows and optimizing the pipeline.

CREATE TABLE IF NOT EXISTS ai_gateway_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid REFERENCES ai_conversations(conversation_id) ON DELETE SET NULL,
  session_id          text,
  business_id         uuid,
  env_id              uuid,
  actor               text NOT NULL DEFAULT 'anonymous',

  -- Request
  message_preview     text,                          -- first 500 chars of user message
  route_lane          text NOT NULL,                  -- A, B, C, D
  route_model         text NOT NULL,                  -- effective model used
  is_write            boolean NOT NULL DEFAULT false,
  workflow_override   boolean NOT NULL DEFAULT false,  -- true if route was overridden for active workflow

  -- Model
  prompt_tokens       int NOT NULL DEFAULT 0,
  completion_tokens   int NOT NULL DEFAULT 0,
  cached_tokens       int NOT NULL DEFAULT 0,
  reasoning_effort    text,

  -- Tools
  tool_call_count     int NOT NULL DEFAULT 0,
  tool_calls_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_skipped       boolean NOT NULL DEFAULT false,

  -- RAG
  rag_chunks_raw      int NOT NULL DEFAULT 0,         -- before threshold/rerank
  rag_chunks_used     int NOT NULL DEFAULT 0,         -- after threshold/rerank
  rag_rerank_method   text,
  rag_scores          jsonb,                          -- array of floats

  -- Cost
  cost_total          numeric(10,6) NOT NULL DEFAULT 0,
  cost_model          numeric(10,6) NOT NULL DEFAULT 0,
  cost_embedding      numeric(10,6) NOT NULL DEFAULT 0,
  cost_rerank         numeric(10,6) NOT NULL DEFAULT 0,

  -- Timings
  elapsed_ms          int,
  ttft_ms             int,                            -- time to first token
  model_ms            int,

  -- Outcome
  fallback_used       boolean NOT NULL DEFAULT false,
  error_message       text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_gateway_logs_business
  ON ai_gateway_logs (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gateway_logs_conversation
  ON ai_gateway_logs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gateway_logs_lane
  ON ai_gateway_logs (route_lane, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gateway_logs_recent
  ON ai_gateway_logs (created_at DESC);
