-- 317_ai_conversations.sql
-- Persistent conversation storage for Winston AI assistant.
-- Conversations are scoped to business_id and support multi-turn history.

CREATE TABLE IF NOT EXISTS ai_conversations (
  conversation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL,
  env_id            uuid,
  title             text,                          -- auto-generated from first message
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived          boolean NOT NULL DEFAULT false,
  actor             text NOT NULL DEFAULT 'anonymous'
);

CREATE TABLE IF NOT EXISTS ai_messages (
  message_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE,
  role              text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content           text NOT NULL,
  tool_calls        jsonb,                         -- tool calls made during this turn
  citations         jsonb,                         -- RAG citations referenced
  token_count       int,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_business
  ON ai_conversations (business_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON ai_messages (conversation_id, created_at ASC);
