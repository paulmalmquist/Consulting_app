-- Add the supply_chain template to the v2 environment_templates registry.
--
-- Pairs with backend/app/services/environment_seed_packs_v2/supply_chain_starter.py
-- (registered in commit 445ef5c7) and the frontend supply-chain shell at
-- repo-b/src/app/lab/env/[envId]/supply-chain/.
--
-- Idempotent via ON CONFLICT (template_key, version) DO UPDATE.

INSERT INTO app.environment_templates (
  template_key, version, display_name, description, env_kind_default, industry_type,
  default_home_route, default_auth_mode,
  enabled_modules, theme_tokens, login_copy,
  default_seed_pack, available_seed_packs, is_active, is_latest, notes
) VALUES (
  'supply_chain', 1,
  'Supply Chain Data Platform',
  'Databricks Lakehouse demo workspace — medallion architecture, source systems, governance, AI SDLC, Genie, and a 90-day delivery roadmap.',
  'demo', 'supply_chain',
  '/lab/env/{env_id}/supply-chain', 'private',
  ARRAY['data','pipelines','governance','ai_sdlc'],
  jsonb_build_object('accent', '200 89% 60%', 'accent_soft', '200 89% 80%', 'glow', '34, 211, 238'),
  jsonb_build_object('title', 'Supply Chain Data Platform', 'subtitle', 'Sign in to the lakehouse build.'),
  'supply_chain_starter', ARRAY['supply_chain_starter','empty'], true, true,
  'Reference pattern: Databricks medallion lakehouse + Mosaic AI for supply chain. See docs/receipts/supply-chain-platform-environment.md.'
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
