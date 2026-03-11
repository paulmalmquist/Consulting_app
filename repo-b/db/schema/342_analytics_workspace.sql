-- 342_analytics_workspace.sql
-- Analytics Workspace: saved queries, execution log, semantic cache, collections.
-- Provides the persistence layer for the NL→SQL→Viz workflow.
-- Depends on: none (standalone)
-- Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING

-- =============================================================================
-- I. Query collections (folders / workspaces)
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_collection (
    collection_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    env_id          text NOT NULL,
    name            text NOT NULL,
    description     text,
    parent_id       uuid REFERENCES analytics_collection(collection_id) ON DELETE SET NULL,
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ac_business_env
    ON analytics_collection (business_id, env_id);

-- =============================================================================
-- II. Saved queries
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_query (
    query_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    env_id          text NOT NULL,
    title           text NOT NULL,
    description     text,
    sql_text        text NOT NULL,
    nl_prompt       text,                    -- original NL prompt that generated the SQL
    visualization_spec jsonb DEFAULT '{}',   -- { type, x_axis, y_axis, series, colors }
    parameters      jsonb DEFAULT '[]',      -- [{ name, type, default_value }]
    entity_scope    jsonb DEFAULT '{}',      -- { entity_type, entity_ids[] }
    is_public       boolean NOT NULL DEFAULT false,
    is_favorited    boolean NOT NULL DEFAULT false,
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aq_business_env
    ON analytics_query (business_id, env_id);
CREATE INDEX IF NOT EXISTS idx_aq_created_by
    ON analytics_query (created_by, updated_at DESC);

-- =============================================================================
-- III. Query-to-collection membership (M:N)
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_collection_membership (
    collection_id   uuid NOT NULL REFERENCES analytics_collection(collection_id) ON DELETE CASCADE,
    query_id        uuid NOT NULL REFERENCES analytics_query(query_id) ON DELETE CASCADE,
    added_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, query_id)
);

-- =============================================================================
-- IV. Query execution log (audit trail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_query_run (
    run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id        uuid REFERENCES analytics_query(query_id) ON DELETE SET NULL,
    business_id     uuid NOT NULL,
    env_id          text NOT NULL,
    sql_executed    text NOT NULL,
    params_json     jsonb DEFAULT '{}',
    row_count       int,
    column_names    jsonb DEFAULT '[]',      -- ["col1", "col2", ...]
    elapsed_ms      int,
    error_msg       text,
    cost_estimate   text,                    -- EXPLAIN output summary
    executed_by     text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aqr_business
    ON analytics_query_run (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aqr_query
    ON analytics_query_run (query_id, created_at DESC);

-- =============================================================================
-- V. Semantic query cache
-- =============================================================================

CREATE TABLE IF NOT EXISTS analytics_query_cache (
    cache_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    cache_key       text NOT NULL,            -- content-hash of normalized SQL + params
    query_hash      text NOT NULL,            -- SHA-256 of raw SQL
    result_json     jsonb NOT NULL,
    row_count       int,
    expires_at      timestamptz NOT NULL,
    hit_count       int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_aqc_lookup
    ON analytics_query_cache (business_id, cache_key)
    WHERE expires_at > now();
