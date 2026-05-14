-- Add the legal_ops template to the v2 environment_templates registry.
--
-- Pairs with:
--   - 275_legal_ops_core.sql (core schema)
--   - 320_legal_ops_expansion.sql (expansion tables)
--   - 539_legal_ops_brain.sql (knowledge base / AI layer)
--   - backend/app/services/environment_seed_packs_v2/legal_ops_starter.py (seed pack)
--   - backend/app/routes/legal_ops.py (API)
--   - backend/app/services/legal_ops.py (service layer)
--   - repo-b/src/app/lab/env/[envId]/legal/ (frontend)
--
-- Idempotent via ON CONFLICT (template_key, version) DO UPDATE.

INSERT INTO app.environment_templates (
  template_key, version, display_name, description, env_kind_default, industry_type,
  default_home_route, default_auth_mode,
  enabled_modules, theme_tokens, login_copy,
  default_seed_pack, available_seed_packs, is_active, is_latest, notes
) VALUES (
  'legal_ops', 1,
  'Legal Ops Command',
  'Contract lifecycle, matter management, outside counsel, and knowledge base — reference implementation for in-house legal operations.',
  'demo', 'legal_ops_command',
  '/lab/env/{env_id}/legal', 'private',
  ARRAY['matters','contracts','outside_counsel','spend','compliance','governance','litigation','documents','knowledge_base','reports'],
  jsonb_build_object('accent', '217 91% 60%', 'accent_soft', '217 91% 80%', 'glow', '59, 130, 246'),
  jsonb_build_object('title', 'Legal Ops Command', 'subtitle', 'Sign in to your legal operations workspace.'),
  'legal_ops_starter', ARRAY['legal_ops_starter','empty'], true, true,
  'Reference implementation. Winston prepares the file. Counsel approves the judgment. See docs/winston-legal/REFERENCE_FRAMEWORK.md.'
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
