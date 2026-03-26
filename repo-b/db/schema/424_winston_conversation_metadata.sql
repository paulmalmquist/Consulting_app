ALTER TABLE ai_conversations
  ADD COLUMN IF NOT EXISTS thread_kind text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS scope_id text,
  ADD COLUMN IF NOT EXISTS scope_label text,
  ADD COLUMN IF NOT EXISTS launch_source text,
  ADD COLUMN IF NOT EXISTS context_summary text,
  ADD COLUMN IF NOT EXISTS last_route text;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_business_thread_kind
  ON ai_conversations (business_id, thread_kind, updated_at DESC);
