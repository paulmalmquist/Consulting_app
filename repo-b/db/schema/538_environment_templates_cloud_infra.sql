-- Add the cloud_infra template to the v2 environment_templates registry.
--
-- Pairs with:
--   - 537_cloud_infrastructure_bi.sql (schema)
--   - backend/app/services/environment_seed_packs_v2/cloud_infra_starter.py (seed pack)
--   - backend/app/routes/vultr.py (API)
--   - repo-b/src/app/lab/env/[envId]/vultr/ (frontend)
--
-- Idempotent via ON CONFLICT (template_key, version) DO UPDATE.

INSERT INTO app.environment_templates (
  template_key, version, display_name, description, env_kind_default, industry_type,
  default_home_route, default_auth_mode,
  enabled_modules, theme_tokens, login_copy,
  default_seed_pack, available_seed_packs, is_active, is_latest, notes
) VALUES (
  'cloud_infra', 1,
  'Vultr Cloud Intelligence OS',
  'BI-grade operating console for usage-based cloud / GPU compute. Reconciles platform usage, billing, NetSuite-style accounting, Salesforce-style CRM, support, and infra telemetry. Flagship GPU Capacity Command Graph.',
  'demo', 'cloud_infrastructure',
  '/lab/env/{env_id}/vultr', 'private',
  ARRAY['executive','reconciliation','gpu_economics','customers','sales','operations','data_model'],
  jsonb_build_object('accent', '210 100% 49%', 'accent_soft', '210 100% 70%', 'glow', '0, 123, 252'),
  jsonb_build_object('title', 'Vultr Cloud Intelligence OS', 'subtitle', 'Sign in to the cloud operating console.'),
  'cloud_infra_starter', ARRAY['cloud_infra_starter','empty'], true, true,
  'Reference pattern: usage-based cloud BI with 6-stage reconciliation. See docs/plans/vultr-cloud-intelligence-os.md.'
)
ON CONFLICT (template_key, version) DO UPDATE SET
  display_name         = EXCLUDED.display_name,
  description          = EXCLUDED.description,
  env_kind_default     = EXCLUDED.env_kind_default,
  industry_type        = EXCLUDED.industry_type,
  default_home_route   = EXCLUDED.default_home_route,
  default_auth_mode    = EXCLUDED.default_auth_mode,
  enabled_modules      = EXCLUDED.enabled_modules,
  theme_tokens         = EXCLUDED.theme_tokens,
  login_copy           = EXCLUDED.login_copy,
  default_seed_pack    = EXCLUDED.default_seed_pack,
  available_seed_packs = EXCLUDED.available_seed_packs,
  is_active            = EXCLUDED.is_active,
  notes                = EXCLUDED.notes,
  updated_at           = now();
