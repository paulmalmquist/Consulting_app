-- 418_msa_rotation_engine.sql
-- MSA Rotation Engine: zone watchlist and research-driven feature cards.
-- Supports daily rotation through sub-MSA zones with structured research output
-- and gap-to-feature pipeline for Winston product development.

CREATE TABLE IF NOT EXISTS msa_zone (
  msa_zone_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  msa_code              text,                                          -- CBSA code
  zone_name             text NOT NULL,
  zone_slug             text NOT NULL,                                 -- e.g. 'wpb-downtown'
  zone_polygon          geometry(Polygon, 4326),                       -- PostGIS SRID 4326
  asset_class_focus     text NOT NULL DEFAULT 'multifamily'
                        CHECK (asset_class_focus IN (
                          'multifamily', 'office', 'industrial', 'retail', 'mixed'
                        )),
  tier                  smallint NOT NULL DEFAULT 1
                        CHECK (tier IN (1, 2, 3)),
  rotation_cadence_days smallint NOT NULL DEFAULT 7,                   -- T1=5-7, T2=10-14, T3=30
  last_rotated_at       timestamptz,
  rotation_priority_score numeric(5,2) DEFAULT 0,                      -- computed heat score
  research_runs         jsonb NOT NULL DEFAULT '[]'::jsonb,            -- array of past run summaries
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, zone_slug)
);

COMMENT ON TABLE msa_zone IS 'Sub-MSA zone watchlist for the rotation engine. Each row is a neighborhood-level market to track.';

CREATE TABLE IF NOT EXISTS msa_zone_intel_brief (
  brief_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_zone_id           uuid NOT NULL REFERENCES msa_zone(msa_zone_id) ON DELETE CASCADE,
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  run_date              date NOT NULL,
  signals               jsonb NOT NULL DEFAULT '{}'::jsonb,            -- structured signal scores
  composite_acquisition_score numeric(4,2),
  key_findings          jsonb NOT NULL DEFAULT '[]'::jsonb,
  feature_gaps_identified jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_sources           jsonb DEFAULT '[]'::jsonb,                     -- source URLs/citations
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (msa_zone_id, run_date)
);

COMMENT ON TABLE msa_zone_intel_brief IS 'Daily Zone Intelligence Brief produced by Phase 1 research sweep.';

CREATE TABLE IF NOT EXISTS msa_feature_card (
  card_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  msa_zone_id           uuid REFERENCES msa_zone(msa_zone_id) ON DELETE SET NULL,
  brief_id              uuid REFERENCES msa_zone_intel_brief(brief_id) ON DELETE SET NULL,
  gap_category          text NOT NULL
                        CHECK (gap_category IN (
                          'data_source', 'calculation', 'visualization', 'model', 'workflow'
                        )),
  title                 text NOT NULL,
  description           text,
  priority_score        numeric(5,2) DEFAULT 0,                        -- impact x frequency x effort_inverse
  spec_json             jsonb DEFAULT '{}'::jsonb,                     -- inputs, outputs, acceptance_criteria, test_cases
  meta_prompt           text,                                          -- generated build prompt for coding agent
  status                text NOT NULL DEFAULT 'identified'
                        CHECK (status IN (
                          'identified', 'specced', 'prompted', 'built', 'verified', 'rejected'
                        )),
  target_module         text,                                          -- e.g. 'dcf_engine', 'deal_analyzer', 'portfolio_dashboard'
  lineage_note          text,                                          -- "identified during 2026-03-22 rotation into WPB-Downtown"
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE msa_feature_card IS 'Research-driven feature cards. Each gap discovered during MSA research becomes a build spec.';

-- Indexes for rotation queries
CREATE INDEX IF NOT EXISTS idx_msa_zone_rotation
  ON msa_zone (tenant_id, business_id, is_active, tier, last_rotated_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_msa_zone_intel_brief_zone_date
  ON msa_zone_intel_brief (msa_zone_id, run_date DESC);

CREATE INDEX IF NOT EXISTS idx_msa_feature_card_status
  ON msa_feature_card (tenant_id, business_id, status, priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_msa_feature_card_zone
  ON msa_feature_card (msa_zone_id) WHERE msa_zone_id IS NOT NULL;
