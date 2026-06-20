-- 10021_nv_enterprise_memory_items.sql
-- Enterprise Memory Index (plan PR 15, Phase 6) — a scoped RETRIEVAL/INDEX layer.
--
-- This layer RETRIEVES RECORDS WITH CITATIONS (item_type, source_id, title, indexed_at).
-- It NEVER answers questions and contains NO LLM. pgvector is the HOT similarity index;
-- BigQuery / object storage is the FUTURE archive path (guardrail note only — no archive
-- code ships in PR 15). Review the archive strategy when item count or query latency
-- crosses a threshold; Postgres must not become a warehouse.
--
-- env_id is intentionally NULLABLE here (the ONE documented exception to the env_id NOT NULL
-- house rule): a NULL env_id is an ORG-GLOBAL record (e.g. an ADR) visible read-only to every
-- environment; a non-null env_id is env-scoped. business_id stays NOT NULL so tenancy is never
-- fully open. Writing a global (null-env) row is admin/system-only, enforced in service code.
--
-- embedding is NULLABLE and filled ASYNCHRONOUSLY (the /index request never calls the provider).
-- A NULL embedding is a valid state: 'pending' (queued), 'no_provider' (fail closed — key absent),
-- or 'error'. A zero/fake vector is NEVER stored — rows without a real embedding are simply not
-- rankable by the vector search and are surfaced honestly via embedding_status / null_reason.
--
-- Approved prefix: nv_. Owning module: backend/app/services/enterprise_memory.py.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS nv_enterprise_memory_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id           text,                         -- NULLABLE: null = org-global (ADRs etc.)
    business_id      uuid NOT NULL,
    item_type        text NOT NULL
                     CHECK (item_type IN ('adr', 'investigation', 'card', 'decision', 'workflow')),
    source_id        text NOT NULL,                -- citation: the source record's id
    title            text NOT NULL,                -- citation: human-readable title
    summary          text,
    content_text     text NOT NULL,                -- the indexed body (embedded)
    embedding        vector(1536),                 -- NULL until embedded; never a fake vector
    embedding_model  text,                         -- stamped when embedded (text-embedding-3-small)
    embedding_status text NOT NULL DEFAULT 'pending'
                     CHECK (embedding_status IN ('pending', 'indexed', 'no_provider', 'error')),
    null_reason      text,                         -- why embedding is absent (fail-closed diagnostics)
    source_ref       jsonb NOT NULL DEFAULT '{}',  -- provenance pointers
    metadata         jsonb NOT NULL DEFAULT '{}',
    indexed_at       timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotent re-index: one row per (item_type, source_id) within a scope. A table-level
-- UNIQUE cannot hold an expression, so the nullable env_id is handled by two partial unique
-- indexes — one for env-scoped rows, one for global (null-env) rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nv_enterprise_memory_env
    ON nv_enterprise_memory_items (item_type, source_id, business_id, env_id)
    WHERE env_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_nv_enterprise_memory_global
    ON nv_enterprise_memory_items (item_type, source_id, business_id)
    WHERE env_id IS NULL;

ALTER TABLE nv_enterprise_memory_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    -- GLOBAL-AWARE tenant policy. The standard `env_id = current_setting(...)` form would hide
    -- every global (null-env) row because `NULL = 'env-x'` is NULL/false. The IS NULL branch
    -- makes org-global records visible to every env (read); env rows stay isolated to their env.
    CREATE POLICY nv_enterprise_memory_items_tenant ON nv_enterprise_memory_items
        USING (env_id IS NULL OR env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id IS NULL OR env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Workload: env-scoped (and global) list/filter by type.
CREATE INDEX IF NOT EXISTS ix_nv_enterprise_memory_env_type
    ON nv_enterprise_memory_items (env_id, item_type);
-- Workload: the manual backfill sweep selects rows whose embedding is still pending.
CREATE INDEX IF NOT EXISTS ix_nv_enterprise_memory_pending
    ON nv_enterprise_memory_items (embedding_status) WHERE embedding_status = 'pending';
-- Workload: approximate-nearest-neighbour vector search (cosine). Matches rag_chunks (316).
CREATE INDEX IF NOT EXISTS ix_nv_enterprise_memory_embedding
    ON nv_enterprise_memory_items USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE nv_enterprise_memory_items IS
    'Enterprise Memory hot index (plan PR 15). Scoped RETRIEVAL with citations; NEVER answers, '
    'NO LLM. env_id NULL = org-global (ADRs etc.), non-null = env-scoped; global writes are '
    'admin/system-only. embedding NULL = pending|no_provider|error (fail closed, never a fake '
    'vector). pgvector = hot index; BigQuery/object-storage = future archive (note only). '
    'Owning module: enterprise_memory.py.';
