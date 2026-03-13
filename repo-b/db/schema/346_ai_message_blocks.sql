-- 346_ai_message_blocks.sql
-- Extend Winston AI message persistence for canonical response blocks.

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS response_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS message_meta jsonb NOT NULL DEFAULT '{}'::jsonb;
