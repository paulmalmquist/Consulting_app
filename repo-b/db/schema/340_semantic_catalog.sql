-- 340_semantic_catalog.sql
-- Live Semantic Catalog: versioned metric definitions, entity mappings,
-- validated join paths, column-level lineage, and data contracts.
-- Designed to be storage-agnostic — the catalog describes what exists
-- regardless of whether the underlying warehouse is Postgres, Databricks, or Snowflake.
-- Depends on: none (standalone)
-- Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING

-- =============================================================================
-- I. Catalog versioning
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_catalog_version (
    version_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    version_number  int  NOT NULL DEFAULT 1,
    published_at    timestamptz NOT NULL DEFAULT now(),
    publisher       text NOT NULL,
    changelog       text,
    UNIQUE (business_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_scv_business
    ON semantic_catalog_version (business_id, version_number DESC);

-- =============================================================================
-- II. Entity definitions — maps logical entities to physical tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_entity_def (
    entity_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    entity_key      text NOT NULL,           -- e.g. 'fund', 'deal', 'asset'
    display_name    text NOT NULL,
    description     text,
    table_name      text NOT NULL,           -- physical table (e.g. 'repe_fund')
    pk_column       text NOT NULL,           -- e.g. 'fund_id'
    business_id_path text,                   -- SQL path to business_id for tenant isolation
    parent_entity_key text,                  -- e.g. 'fund' for deal
    parent_fk_column text,                   -- e.g. 'fund_id' on repe_deal
    catalog_version_id uuid REFERENCES semantic_catalog_version(version_id),
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, entity_key)
);

CREATE INDEX IF NOT EXISTS idx_sed_business_active
    ON semantic_entity_def (business_id) WHERE is_active = true;

-- =============================================================================
-- III. Metric definitions — versioned, governed metric catalog
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_metric_def (
    metric_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    metric_key      text NOT NULL,           -- e.g. 'noi', 'tvpi', 'occupancy'
    display_name    text NOT NULL,
    description     text,
    sql_template    text NOT NULL,           -- parameterized SQL fragment
    unit            text NOT NULL DEFAULT 'number',  -- number | dollar | percent | ratio | count
    aggregation     text NOT NULL DEFAULT 'sum',     -- sum | avg | min | max | count | latest
    format_hint     text,                    -- e.g. '0.065 = 6.5%%'
    entity_key      text,                    -- which entity this metric applies to
    owner           text,                    -- who owns this metric definition
    version         int  NOT NULL DEFAULT 1,
    catalog_version_id uuid REFERENCES semantic_catalog_version(version_id),
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, metric_key, version)
);

CREATE INDEX IF NOT EXISTS idx_smd_business_active
    ON semantic_metric_def (business_id) WHERE is_active = true;

-- =============================================================================
-- IV. Dimension definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_dimension_def (
    dimension_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    dimension_key   text NOT NULL,           -- e.g. 'quarter', 'market', 'property_type'
    display_name    text NOT NULL,
    description     text,
    entity_key      text NOT NULL,           -- which entity has this dimension
    column_name     text NOT NULL,           -- physical column
    data_type       text NOT NULL DEFAULT 'text',
    catalog_version_id uuid REFERENCES semantic_catalog_version(version_id),
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, dimension_key)
);

-- =============================================================================
-- V. Validated join paths — the join graph
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_join_def (
    join_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    from_entity_key text NOT NULL,
    to_entity_key   text NOT NULL,
    join_sql        text NOT NULL,           -- e.g. 'repe_deal.fund_id = repe_fund.fund_id'
    cardinality     text NOT NULL DEFAULT 'many_to_one'
        CHECK (cardinality IN ('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many')),
    is_safe         boolean NOT NULL DEFAULT true,  -- false = fan-out warning
    fan_out_warning text,                    -- warning text if is_safe=false
    validated_at    timestamptz,
    validated_by    text,
    catalog_version_id uuid REFERENCES semantic_catalog_version(version_id),
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, from_entity_key, to_entity_key)
);

CREATE INDEX IF NOT EXISTS idx_sjd_business
    ON semantic_join_def (business_id) WHERE is_active = true;

-- =============================================================================
-- VI. Column-level lineage
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_lineage_edge (
    edge_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     uuid NOT NULL,
    source_table    text NOT NULL,
    source_column   text NOT NULL,
    target_table    text NOT NULL,
    target_column   text NOT NULL,
    transform_type  text NOT NULL DEFAULT 'direct'
        CHECK (transform_type IN ('direct', 'aggregation', 'calculation', 'filter', 'join', 'pivot')),
    transform_sql   text,                    -- optional SQL fragment
    catalog_version_id uuid REFERENCES semantic_catalog_version(version_id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sle_source
    ON semantic_lineage_edge (business_id, source_table, source_column);
CREATE INDEX IF NOT EXISTS idx_sle_target
    ON semantic_lineage_edge (business_id, target_table, target_column);

-- =============================================================================
-- VII. Data contracts — freshness and completeness SLAs
-- =============================================================================

CREATE TABLE IF NOT EXISTS semantic_data_contract (
    contract_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         uuid NOT NULL,
    table_name          text NOT NULL,
    freshness_sla_minutes int,              -- max acceptable staleness
    completeness_threshold numeric(5,4) DEFAULT 0.9500,  -- 95%% minimum completeness
    owner               text,
    description         text,
    is_active           boolean NOT NULL DEFAULT true,
    last_checked_at     timestamptz,
    last_status         text CHECK (last_status IN ('passing', 'warning', 'failing')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_id, table_name)
);

CREATE INDEX IF NOT EXISTS idx_sdc_business
    ON semantic_data_contract (business_id) WHERE is_active = true;
