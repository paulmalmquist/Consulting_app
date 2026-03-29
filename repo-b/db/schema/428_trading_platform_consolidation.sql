-- ============================================================
-- 428 — Trading Platform Consolidation
-- Merges Market Intelligence Engine + MSA Rotation Engine
-- into a single "Trading Platform" environment.
-- Applied: 2026-03-29
-- ============================================================

-- Rename Market Intelligence Engine → Trading Platform
UPDATE app.environments
SET client_name            = 'Trading Platform',
    industry               = 'trading_platform',
    industry_type          = 'trading_platform',
    workspace_template_key = 'trading_platform',
    updated_at             = now()
WHERE env_id = 'c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9';

-- Soft-delete MSA Rotation Engine
-- MSA data tables (msa_zone, msa_zone_intel_brief, msa_feature_card)
-- reference tenant_id/business_id, NOT env_id, so no data is affected.
UPDATE app.environments
SET is_active   = false,
    updated_at  = now()
WHERE client_name ILIKE '%MSA Rotation%'
  AND env_id != 'c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9';
