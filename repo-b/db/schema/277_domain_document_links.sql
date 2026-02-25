-- 277_domain_document_links.sql
-- Expand document entity links for multi-domain command workspaces.

CREATE TABLE IF NOT EXISTS app.document_entity_links (
  document_entity_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id             uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  env_id                  uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  entity_type             text NOT NULL,
  entity_id               uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, env_id, entity_type, entity_id)
);

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app'
      AND t.relname = 'document_entity_links'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%entity_type%'
  LOOP
    EXECUTE format('ALTER TABLE app.document_entity_links DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE app.document_entity_links
  ADD CONSTRAINT chk_document_entity_links_entity_type
  CHECK (
    entity_type IN (
      'fund',
      'investment',
      'asset',
      'pds_project',
      'pds_program',
      'credit_case',
      'legal_matter',
      'medical_property',
      'medical_tenant'
    )
  );

CREATE INDEX IF NOT EXISTS idx_doc_entity_links_lookup
  ON app.document_entity_links (env_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doc_entity_links_doc_id
  ON app.document_entity_links (document_id, created_at DESC);
