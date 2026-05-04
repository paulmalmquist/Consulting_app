-- 540_ai_message_attachments.sql
-- Adds audit linkage from ai_messages to documents the user attached to a turn.
--
-- Two events, two audit trails:
--   1. Upload event: file lands in app.documents / app.document_versions.
--      Workspace/user-scoped. Model has not seen the file yet.
--   2. Model exposure event: a document_id appears in this column for a specific
--      user message. Only when this row is written has the model "seen" the file.
--
-- V1 audit linkage uses a UUID array for speed. Migrate to a join table
-- (ai_message_attachments) if attachment-level audit, permissions,
-- processing state, ordinal, or cross-message reuse become needed.

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS attachment_document_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN ai_messages.attachment_document_ids IS
  'V1 audit linkage: document_ids (app.documents) the user attached to this turn. '
  'Authoritative answer to "did Winston ever see document X". '
  'Migrate to a join table if attachment-level metadata is needed later.';

CREATE INDEX IF NOT EXISTS idx_ai_messages_attachment_doc_ids
  ON ai_messages USING GIN (attachment_document_ids);
