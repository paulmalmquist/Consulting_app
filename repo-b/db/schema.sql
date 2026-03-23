CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TYPE IF NOT EXISTS app.document_classification AS ENUM (
  'evidence',
  'policy',
  'output',
  'other'
);

CREATE TYPE IF NOT EXISTS app.document_status AS ENUM (
  'draft',
  'review',
  'approved',
  'superseded',
  'archived'
);

CREATE TYPE IF NOT EXISTS app.document_version_state AS ENUM (
  'uploading',
  'available',
  'quarantined',
  'rejected',
  'deleted'
);

CREATE TYPE IF NOT EXISTS app.document_link_type AS ENUM (
  'input_evidence',
  'output_artifact',
  'reference',
  'other'
);

CREATE TYPE IF NOT EXISTS app.ingest_status AS ENUM (
  'queued',
  'processing',
  'done',
  'error'
);

CREATE TABLE IF NOT EXISTS app.tenants (
  tenant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.users (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  external_subject text NULL,
  email text NULL,
  display_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_external_subject_idx
  ON app.users (tenant_id, external_subject)
  WHERE external_subject IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_tenant_id_idx
  ON app.users (tenant_id);

CREATE TABLE IF NOT EXISTS app.documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  domain text NOT NULL,
  classification app.document_classification NOT NULL,
  title text NOT NULL,
  description text NULL,
  virtual_path text NULL,
  status app.document_status NOT NULL,
  retention_until date NULL,
  created_by uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_tenant_id_idx
  ON app.documents (tenant_id);

CREATE INDEX IF NOT EXISTS documents_tenant_domain_idx
  ON app.documents (tenant_id, domain);

CREATE INDEX IF NOT EXISTS documents_tenant_classification_idx
  ON app.documents (tenant_id, classification);

CREATE INDEX IF NOT EXISTS documents_tenant_status_idx
  ON app.documents (tenant_id, status);

CREATE TABLE IF NOT EXISTS app.document_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  document_id uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  version_number int NOT NULL,
  state app.document_version_state NOT NULL,
  bucket text NOT NULL,
  object_key text NOT NULL,
  original_filename text NULL,
  mime_type text NULL,
  size_bytes bigint NULL,
  content_hash text NULL,
  created_by uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz NULL,
  UNIQUE (document_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS document_versions_tenant_bucket_object_idx
  ON app.document_versions (tenant_id, bucket, object_key);

CREATE INDEX IF NOT EXISTS document_versions_tenant_id_idx
  ON app.document_versions (tenant_id);

CREATE INDEX IF NOT EXISTS document_versions_tenant_document_created_idx
  ON app.document_versions (tenant_id, document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS document_versions_tenant_state_idx
  ON app.document_versions (tenant_id, state);

CREATE TABLE IF NOT EXISTS app.document_links (
  link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  document_id uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  version_id uuid NULL REFERENCES app.document_versions(version_id) ON DELETE SET NULL,
  link_type app.document_link_type NOT NULL,
  run_id uuid NULL,
  action_id uuid NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_links_tenant_id_idx
  ON app.document_links (tenant_id);

CREATE INDEX IF NOT EXISTS document_links_tenant_run_idx
  ON app.document_links (tenant_id, run_id);

CREATE INDEX IF NOT EXISTS document_links_tenant_action_idx
  ON app.document_links (tenant_id, action_id);

CREATE INDEX IF NOT EXISTS document_links_tenant_entity_idx
  ON app.document_links (tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS app.roles (
  role_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  name text NOT NULL,
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS roles_tenant_id_idx
  ON app.roles (tenant_id);

CREATE TABLE IF NOT EXISTS app.user_roles (
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  user_id uuid NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES app.roles(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS user_roles_tenant_id_idx
  ON app.user_roles (tenant_id);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx
  ON app.user_roles (user_id);

CREATE TABLE IF NOT EXISTS app.document_acl (
  acl_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  document_id uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES app.roles(role_id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  UNIQUE (document_id, role_id)
);

CREATE INDEX IF NOT EXISTS document_acl_tenant_id_idx
  ON app.document_acl (tenant_id);

CREATE TABLE IF NOT EXISTS app.document_text (
  text_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  version_id uuid NOT NULL REFERENCES app.document_versions(version_id) ON DELETE CASCADE,
  extracted_text text NOT NULL,
  language text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id)
);

CREATE INDEX IF NOT EXISTS document_text_tenant_id_idx
  ON app.document_text (tenant_id);

CREATE TABLE IF NOT EXISTS app.document_chunks (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  version_id uuid NOT NULL REFERENCES app.document_versions(version_id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  token_count int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_tenant_id_idx
  ON app.document_chunks (tenant_id);

CREATE TABLE IF NOT EXISTS app.document_ingest_queue (
  queue_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(tenant_id),
  version_id uuid NOT NULL REFERENCES app.document_versions(version_id) ON DELETE CASCADE,
  status app.ingest_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_ingest_queue_tenant_id_idx
  ON app.document_ingest_queue (tenant_id);

CREATE INDEX IF NOT EXISTS document_ingest_queue_status_created_idx
  ON app.document_ingest_queue (status, created_at);

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'documents_set_updated_at'
  ) THEN
    CREATE TRIGGER documents_set_updated_at
      BEFORE UPDATE ON app.documents
      FOR EACH ROW
      EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'document_ingest_queue_set_updated_at'
  ) THEN
    CREATE TRIGGER document_ingest_queue_set_updated_at
      BEFORE UPDATE ON app.document_ingest_queue
      FOR EACH ROW
      EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.set_request_context(
  p_tenant_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  PERFORM set_config('app.user_id', p_user_id::text, true);
END;
$$;



CREATE TABLE IF NOT EXISTS app.extracted_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES app.document_versions(version_id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.extracted_field (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_document_id uuid NOT NULL REFERENCES app.extracted_document(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_value_json jsonb NOT NULL,
  confidence numeric(5,4),
  evidence_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.extraction_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_document_id uuid NOT NULL REFERENCES app.extracted_document(id) ON DELETE CASCADE,
  run_hash text NOT NULL,
  engine_version text NOT NULL,
  status text NOT NULL,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS extracted_document_doc_idx ON app.extracted_document(document_id, document_version_id);
CREATE INDEX IF NOT EXISTS extracted_field_doc_idx ON app.extracted_field(extracted_document_id, field_key);
CREATE INDEX IF NOT EXISTS extraction_run_doc_idx ON app.extraction_run(extracted_document_id, started_at DESC);

ALTER TABLE IF EXISTS app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.document_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.document_text ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app.document_ingest_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS tenants_tenant_isolation
  ON app.tenants
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS users_tenant_isolation
  ON app.users
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS documents_tenant_isolation
  ON app.documents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS document_versions_tenant_isolation
  ON app.document_versions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS document_links_tenant_isolation
  ON app.document_links
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS roles_tenant_isolation
  ON app.roles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS user_roles_tenant_isolation
  ON app.user_roles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS document_acl_tenant_isolation
  ON app.document_acl
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS document_text_tenant_isolation
  ON app.document_text
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS document_chunks_tenant_isolation
  ON app.document_chunks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS document_ingest_queue_tenant_isolation
  ON app.document_ingest_queue
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY IF NOT EXISTS documents_read_acl
  ON app.documents
  FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM app.user_roles ur
      JOIN app.document_acl acl ON acl.role_id = ur.role_id
      WHERE ur.user_id = current_setting('app.user_id', true)::uuid
        AND ur.tenant_id = app.documents.tenant_id
        AND acl.document_id = app.documents.document_id
        AND acl.can_read
    )
  );

CREATE POLICY IF NOT EXISTS documents_insert_acl
  ON app.documents
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND current_setting('app.user_id', true) IS NOT NULL
  );

CREATE POLICY IF NOT EXISTS documents_modify_acl
  ON app.documents
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM app.user_roles ur
      JOIN app.document_acl acl ON acl.role_id = ur.role_id
      WHERE ur.user_id = current_setting('app.user_id', true)::uuid
        AND ur.tenant_id = app.documents.tenant_id
        AND acl.document_id = app.documents.document_id
        AND (acl.can_write OR acl.can_approve)
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY IF NOT EXISTS documents_delete_acl
  ON app.documents
  FOR DELETE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM app.user_roles ur
      JOIN app.document_acl acl ON acl.role_id = ur.role_id
      WHERE ur.user_id = current_setting('app.user_id', true)::uuid
        AND ur.tenant_id = app.documents.tenant_id
        AND acl.document_id = app.documents.document_id
        AND (acl.can_write OR acl.can_approve)
    )
  );

CREATE POLICY IF NOT EXISTS document_versions_read_acl
  ON app.document_versions
  FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM app.user_roles ur
      JOIN app.document_acl acl ON acl.role_id = ur.role_id
      WHERE ur.user_id = current_setting('app.user_id', true)::uuid
        AND ur.tenant_id = app.document_versions.tenant_id
        AND acl.document_id = app.document_versions.document_id
        AND acl.can_read
    )
  );

CREATE POLICY IF NOT EXISTS document_versions_insert_acl
  ON app.document_versions
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND current_setting('app.user_id', true) IS NOT NULL
  );

CREATE POLICY IF NOT EXISTS document_versions_modify_acl
  ON app.document_versions
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM app.user_roles ur
      JOIN app.document_acl acl ON acl.role_id = ur.role_id
      WHERE ur.user_id = current_setting('app.user_id', true)::uuid
        AND ur.tenant_id = app.document_versions.tenant_id
        AND acl.document_id = app.document_versions.document_id
        AND (acl.can_write OR acl.can_approve)
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY IF NOT EXISTS document_versions_delete_acl
  ON app.document_versions
  FOR DELETE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1
      FROM app.user_roles ur
      JOIN app.document_acl acl ON acl.role_id = ur.role_id
      WHERE ur.user_id = current_setting('app.user_id', true)::uuid
        AND ur.tenant_id = app.document_versions.tenant_id
        AND acl.document_id = app.document_versions.document_id
        AND (acl.can_write OR acl.can_approve)
    )
  );
