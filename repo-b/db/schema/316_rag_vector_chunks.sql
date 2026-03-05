-- 316_rag_vector_chunks.sql
-- Production RAG table with pgvector for cosine similarity search.
-- Supports parent-child chunk retrieval: search child (granular) chunks,
-- return parent (broader context) chunks to avoid truncated answers.

-- Enable pgvector if available (graceful no-op if not installed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS rag_chunks (
  chunk_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid NOT NULL,
  version_id        uuid NOT NULL,
  business_id       uuid NOT NULL,
  env_id            uuid,
  entity_type       text,            -- fund | asset | investment | pds_project | etc.
  entity_id         uuid,
  chunk_index       int NOT NULL,
  chunk_text        text NOT NULL,
  token_count       int NOT NULL DEFAULT 0,
  page_number       int,

  -- Parent-child hierarchy: child chunks are searched, parent chunks are returned
  parent_chunk_id   uuid REFERENCES rag_chunks(chunk_id) ON DELETE CASCADE,
  chunk_type        text NOT NULL DEFAULT 'child',  -- 'parent' | 'child'

  -- Section context for citation traceability
  section_heading   text,            -- e.g. "INVESTMENT THESIS", "ARTICLE 5"
  section_path      text,            -- e.g. "IC Memo > Key Risks > Interest Rate"

  -- Character offsets in the source document
  char_start        int,
  char_end          int,

  -- Source provenance
  source_filename   text,
  fiscal_period     text,            -- e.g. "2025-Q4", "FY2025"
  is_current_version boolean NOT NULL DEFAULT true,
  content_type_hint text,            -- e.g. "ic_memo", "operating_agreement", "uw_model"

  -- Flexible metadata for anything that doesn't fit typed columns
  metadata_json     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Vector embedding
  embedding         vector(1536),    -- text-embedding-3-small output dimension
  embedding_model   text NOT NULL DEFAULT 'text-embedding-3-small',
  indexed_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (version_id, chunk_index)
);

-- HNSW index for approximate nearest-neighbor cosine search
-- HNSW: better recall, no training phase, supports incremental inserts
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
  ON rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Scoped retrieval indexes
CREATE INDEX IF NOT EXISTS rag_chunks_business_idx
  ON rag_chunks (business_id, indexed_at DESC);
CREATE INDEX IF NOT EXISTS rag_chunks_document_idx
  ON rag_chunks (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS rag_chunks_entity_idx
  ON rag_chunks (entity_type, entity_id) WHERE entity_type IS NOT NULL;

-- Filtered retrieval: common pattern is "current version chunks for this entity"
CREATE INDEX IF NOT EXISTS rag_chunks_filtered_retrieval_idx
  ON rag_chunks (business_id, entity_type, entity_id, is_current_version)
  WHERE is_current_version = true;

-- Parent-child lookup: fetch parent when child matches
CREATE INDEX IF NOT EXISTS rag_chunks_parent_idx
  ON rag_chunks (parent_chunk_id) WHERE parent_chunk_id IS NOT NULL;

-- Child chunk search: only search children (not parents)
CREATE INDEX IF NOT EXISTS rag_chunks_type_idx
  ON rag_chunks (chunk_type) WHERE chunk_type = 'child';

-- Full-text search fallback (when pgvector unavailable)
ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED;
CREATE INDEX IF NOT EXISTS rag_chunks_fts_idx
  ON rag_chunks USING GIN (search_tsv);

-- Row-level security (mirrors existing app.documents pattern)
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;

-- AI Gateway session audit (AI-specific metadata: tokens, tool calls, RAG chunks)
CREATE TABLE IF NOT EXISTS ai_gateway_sessions (
  session_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid,
  env_id            uuid,
  actor             text NOT NULL,
  model             text NOT NULL,
  prompt_tokens     int,
  completion_tokens int,
  tool_calls_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  rag_chunk_ids     uuid[] NOT NULL DEFAULT '{}',
  duration_ms       int,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_gateway_sessions_business_idx
  ON ai_gateway_sessions (business_id, created_at DESC);
