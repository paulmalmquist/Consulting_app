-- CRE Intelligence: Entity relationship graph + owner unmasking support
-- Adds typed, weighted edges between entities for graph traversal and
-- community detection. Also adds cluster_id to dim_entity.

CREATE TABLE IF NOT EXISTS cre_entity_relationship (
  relationship_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            uuid NOT NULL,
  business_id       uuid NOT NULL REFERENCES business(business_id),
  entity_a_id       uuid NOT NULL REFERENCES dim_entity(entity_id) ON DELETE CASCADE,
  entity_b_id       uuid NOT NULL REFERENCES dim_entity(entity_id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'controls', 'subsidiary_of', 'partner_of', 'managed_by',
    'lender_to', 'tenant_of', 'guarantor_for'
  )),
  confidence        numeric(5,4) NOT NULL DEFAULT 0,
  provenance        jsonb NOT NULL DEFAULT '{}'::jsonb,
  weight            int NOT NULL DEFAULT 1,
  start_date        date,
  end_date          date,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint using index (COALESCE not allowed inline)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cer_unique
  ON cre_entity_relationship (entity_a_id, entity_b_id, relationship_type, COALESCE(start_date, '1900-01-01'));

-- Bidirectional traversal indexes
CREATE INDEX IF NOT EXISTS idx_cer_a ON cre_entity_relationship (entity_a_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_cer_b ON cre_entity_relationship (entity_b_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_cer_env ON cre_entity_relationship (env_id, business_id);

-- Add cluster_id column for community detection output
ALTER TABLE dim_entity ADD COLUMN IF NOT EXISTS cluster_id uuid;
CREATE INDEX IF NOT EXISTS idx_dim_entity_cluster ON dim_entity (cluster_id) WHERE cluster_id IS NOT NULL;

-- RLS: tenant isolation (follows 305_cre_intelligence_rls.sql pattern)
ALTER TABLE cre_entity_relationship ENABLE ROW LEVEL SECURITY;

CREATE POLICY cre_entity_relationship_tenant_isolation
  ON cre_entity_relationship
  USING (
    business_id IN (
      SELECT b.business_id FROM business b WHERE b.tenant_id = current_setting('app.tenant_id', true)::uuid
    )
  );
