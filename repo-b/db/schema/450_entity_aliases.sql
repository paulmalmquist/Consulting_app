-- 450_entity_aliases.sql
-- Alias / synonym table for entity name resolution.
-- Maps short names, abbreviations, and alternate spellings to canonical entity records.
-- Used by the Winston entity search service for multi-strategy matching.

CREATE TABLE IF NOT EXISTS entity_aliases (
    alias_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    alias_text TEXT NOT NULL,
    business_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_entity_aliases_business_text
    ON entity_aliases (business_id, lower(alias_text));

CREATE INDEX IF NOT EXISTS idx_entity_aliases_entity
    ON entity_aliases (entity_type, entity_id);

COMMENT ON TABLE entity_aliases IS 'Maps alternate names, abbreviations, and short forms to canonical entity records. Used by Winston entity resolution. Owning module: assistant_runtime.';
