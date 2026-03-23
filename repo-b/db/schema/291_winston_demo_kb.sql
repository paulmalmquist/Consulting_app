-- 291_winston_demo_kb.sql
-- Winston institutional knowledge, governance, and audit demo surfaces.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS kb_document_metadata (
  document_id          uuid PRIMARY KEY REFERENCES app.documents(document_id) ON DELETE CASCADE,
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  doc_type             text NOT NULL,
  linked_entities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  author               text,
  verification_status  text NOT NULL DEFAULT 'draft'
    CHECK (verification_status IN ('draft', 'verified')),
  source_type          text NOT NULL DEFAULT 'generated'
    CHECK (source_type IN ('upload', 'generated', 'imported')),
  metadata_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_document_metadata_env
  ON kb_document_metadata (env_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_document_metadata_doc_type
  ON kb_document_metadata (doc_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_document_metadata_verification
  ON kb_document_metadata (verification_status, created_at DESC);

CREATE TABLE IF NOT EXISTS kb_document_version_analysis (
  version_id                  uuid PRIMARY KEY REFERENCES app.document_versions(version_id) ON DELETE CASCADE,
  processing_status           text NOT NULL DEFAULT 'processing'
    CHECK (processing_status IN ('processing', 'ready', 'error')),
  detected_definitions_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_tables_json        jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_metrics_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_structured_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  processed_at                timestamptz
);

CREATE TABLE IF NOT EXISTS kb_document_chunk (
  chunk_id        uuid PRIMARY KEY REFERENCES app.document_chunks(chunk_id) ON DELETE CASCADE,
  version_id      uuid NOT NULL REFERENCES app.document_versions(version_id) ON DELETE CASCADE,
  page_number     int,
  anchor_label    text NOT NULL,
  citation_href   text NOT NULL,
  char_start      int NOT NULL DEFAULT 0,
  char_end        int NOT NULL DEFAULT 0,
  embedding       jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_tsv      tsvector,
  metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_document_chunk_version
  ON kb_document_chunk (version_id, page_number, char_start);
CREATE INDEX IF NOT EXISTS idx_kb_document_chunk_search
  ON kb_document_chunk USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_kb_document_chunk_embedding
  ON kb_document_chunk USING GIN (embedding jsonb_path_ops);

CREATE TABLE IF NOT EXISTS kb_definition (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  term                 text NOT NULL,
  definition_text      text NOT NULL,
  formula_text         text,
  structured_metric_key text,
  owner                text NOT NULL,
  status               text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'retired')),
  version              int NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  approved_at          timestamptz,
  UNIQUE (env_id, term, version)
);

CREATE INDEX IF NOT EXISTS idx_kb_definition_env_term
  ON kb_definition (env_id, term, version DESC);
CREATE INDEX IF NOT EXISTS idx_kb_definition_metric_key
  ON kb_definition (structured_metric_key);

CREATE TABLE IF NOT EXISTS kb_definition_sources (
  definition_id   uuid NOT NULL REFERENCES kb_definition(id) ON DELETE CASCADE,
  document_id     uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE CASCADE,
  chunk_id        uuid NOT NULL REFERENCES app.document_chunks(chunk_id) ON DELETE CASCADE,
  quoted_snippet  text NOT NULL,
  PRIMARY KEY (definition_id, chunk_id)
);

CREATE TABLE IF NOT EXISTS kb_definition_dependency (
  definition_id            uuid NOT NULL REFERENCES kb_definition(id) ON DELETE CASCADE,
  dependent_object_type    text NOT NULL,
  dependent_object_id      text NOT NULL,
  PRIMARY KEY (definition_id, dependent_object_type, dependent_object_id)
);

CREATE TABLE IF NOT EXISTS kb_definition_change_request (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id             uuid NOT NULL REFERENCES kb_definition(id) ON DELETE CASCADE,
  proposed_definition_text  text NOT NULL,
  proposed_formula_text     text,
  created_by                text NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  status                    text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'rejected', 'approved')),
  impact_summary_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by               text,
  approved_at               timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kb_definition_change_request_definition
  ON kb_definition_change_request (definition_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kb_dependency_staleness (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  definition_id  uuid NOT NULL REFERENCES kb_definition(id) ON DELETE CASCADE,
  object_type    text NOT NULL,
  object_id      text NOT NULL,
  reason         text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  cleared_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kb_dependency_staleness_active
  ON kb_dependency_staleness (env_id, is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS system_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id        uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  actor         text NOT NULL,
  action_type   text NOT NULL CHECK (action_type IN (
    'doc_upload', 'query', 'scenario_update', 'definition_change',
    'definition_change_request', 'assistant_ask', 'seed_demo', 'document_process'
  )),
  object_type   text NOT NULL,
  object_id     text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_log_env_ts
  ON system_audit_log (env_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_action
  ON system_audit_log (action_type, timestamp DESC);

CREATE OR REPLACE VIEW asset_metrics_qtr AS
SELECT
  eb.env_id,
  f.business_id,
  f.fund_id,
  d.deal_id,
  a.asset_id,
  a.name AS asset_name,
  pa.property_type,
  qs.quarter,
  qs.noi,
  qs.asset_value,
  qs.debt_balance,
  CASE
    WHEN qs.debt_service IS NOT NULL AND qs.debt_service <> 0 THEN qs.noi / qs.debt_service
    ELSE NULL
  END AS dscr,
  (pa.units)::numeric AS units
FROM repe_fund f
JOIN repe_deal d ON d.fund_id = f.fund_id
JOIN repe_asset a ON a.deal_id = d.deal_id
LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN re_asset_quarter_state qs ON qs.asset_id = a.asset_id
JOIN app.env_business_bindings eb ON eb.business_id = f.business_id;

CREATE OR REPLACE VIEW fund_metrics_qtr AS
SELECT
  eb.env_id,
  f.business_id,
  s.fund_id,
  f.name AS fund_name,
  s.quarter,
  s.portfolio_nav,
  s.total_committed,
  s.total_called,
  s.total_distributed,
  s.dpi,
  s.rvpi,
  s.tvpi,
  s.gross_irr,
  s.net_irr
FROM re_fund_quarter_state s
JOIN repe_fund f ON f.fund_id = s.fund_id
JOIN app.env_business_bindings eb ON eb.business_id = f.business_id;

CREATE OR REPLACE VIEW document_catalog AS
SELECT
  md.env_id,
  d.business_id,
  d.document_id,
  d.title,
  md.doc_type,
  md.verification_status,
  md.source_type,
  d.status::text AS document_status,
  dv.version_id,
  dv.version_number,
  dv.mime_type,
  dv.created_at
FROM app.documents d
JOIN kb_document_metadata md ON md.document_id = d.document_id
LEFT JOIN LATERAL (
  SELECT version_id, version_number, mime_type, created_at
  FROM app.document_versions
  WHERE document_id = d.document_id
  ORDER BY version_number DESC
  LIMIT 1
) dv ON TRUE;

CREATE OR REPLACE VIEW definition_registry AS
SELECT
  kd.env_id,
  kd.id AS definition_id,
  kd.term,
  kd.version,
  kd.owner,
  kd.status,
  kd.structured_metric_key,
  kd.created_at,
  kd.approved_at,
  COALESCE(dep.dep_count, 0) AS dependency_count
FROM kb_definition kd
LEFT JOIN (
  SELECT definition_id, COUNT(*)::int AS dep_count
  FROM kb_definition_dependency
  GROUP BY definition_id
) dep ON dep.definition_id = kd.id;
