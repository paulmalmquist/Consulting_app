-- Add the telemetry template to the v2 environment_templates registry.
--
-- Pairs with backend/app/services/environment_seed_packs_v2/telemetry_starter.py and the frontend
-- telemetry shell at repo-b/src/app/lab/env/[envId]/telemetry/.
--
-- Reviewer access model = authenticated lab tenant (default_auth_mode 'private') — no public surface;
-- the reviewer logs in and opens /lab/env/{env_id}/telemetry. Decision recorded in
-- docs/plans/telemetry-platform/architecture.md.
--
-- Idempotent via ON CONFLICT (template_key, version) DO UPDATE.

INSERT INTO app.environment_templates (
  template_key, version, display_name, description, env_kind_default, industry_type,
  default_home_route, default_auth_mode,
  enabled_modules, theme_tokens, login_copy,
  default_seed_pack, available_seed_packs, is_active, is_latest, notes
) VALUES (
  'telemetry', 1,
  'Telemetry Anomaly Platform',
  'Engine-test telemetry → automated go/no-go. Databricks medallion ingestion of public NASA analog datasets (C-MAPSS, SMAP/MSL, IMS), MLflow models + registry promotion gates, FastAPI serving, deterministic replay, and drift monitoring.',
  'demo', 'telemetry',
  '/lab/env/{env_id}/telemetry', 'private',
  ARRAY['ingest','models','serving','monitoring'],
  jsonb_build_object('accent', '200 89% 60%', 'accent_soft', '200 89% 80%', 'glow', '34, 211, 238'),
  jsonb_build_object('title', 'Telemetry Anomaly Platform', 'subtitle', 'Sign in to the test-telemetry console.'),
  'telemetry_starter', ARRAY['telemetry_starter','empty'], true, true,
  'Reference pattern: lakehouse → MLflow registry gates → serving → monitoring on public NASA aerospace analog data. See telemetry-platform/README.md.'
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
