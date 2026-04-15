-- Seed the initial environment_templates registry.
--
-- These templates are MINED FROM the existing canonical environments as reference patterns.
-- They are NOT the canonical environments themselves — those continue to run on the legacy path.
--
-- Lessons captured:
--   - internal_ops:     mined from novendor (consulting revenue OS, Novendor-style nav)
--   - client_delivery:  mined from stone-pds (projects + budgets + executive reports)
--   - repe:             mined from meridian (funds + assets + waterfall + investor reports)
--   - trading_research: mined from trading (research + backtests + signals)
--   - public_profile:   mined from resume (narrative + visual resume corpus)
--   - public_content:   mined from floyorker (marketing / content pages)
--   - empty_lab:        catch-all shell for experimentation
--
-- Keep seed idempotent via ON CONFLICT DO UPDATE on (template_key, version).

INSERT INTO app.environment_templates (
  template_key, version, display_name, description, env_kind_default, industry_type,
  default_home_route, default_auth_mode,
  enabled_modules, theme_tokens, login_copy,
  default_seed_pack, available_seed_packs, is_active, is_latest, notes
) VALUES
(
  'internal_ops', 1,
  'Internal Operations',
  'Novendor-style internal operations workspace with CRM, tasks, and consulting delivery views.',
  'internal', 'consulting',
  '/lab/env/{env_id}/consulting', 'private',
  ARRAY['crm','tasks','documents','reports'],
  jsonb_build_object('accent', '217 91% 60%', 'accent_soft', '217 91% 80%', 'glow', '59, 130, 246'),
  jsonb_build_object('title', 'Internal Operations', 'subtitle', 'Sign in to your operations workspace.'),
  'internal_ops_minimal', ARRAY['internal_ops_minimal','empty'], true, true,
  'Reference pattern: Novendor consulting revenue OS.'
),
(
  'client_delivery', 1,
  'Client Delivery (PDS)',
  'Project delivery workspace for client engagements — projects, budgets, executive reporting.',
  'client', 'pds',
  '/lab/env/{env_id}/pds', 'private',
  ARRAY['projects','budgets','reports','documents','tasks'],
  jsonb_build_object('accent', '271 62% 55%', 'accent_soft', '271 62% 80%', 'glow', '147, 51, 234'),
  jsonb_build_object('title', 'Client Delivery', 'subtitle', 'Sign in to your delivery workspace.'),
  'client_delivery_starter', ARRAY['client_delivery_starter','empty'], true, true,
  'Reference pattern: Stone PDS enterprise delivery.'
),
(
  'repe', 1,
  'Real Estate Private Equity',
  'REPE workspace with funds, assets, waterfall, and investor reporting.',
  'client', 'real_estate_pe',
  '/lab/env/{env_id}/re', 'private',
  ARRAY['repe','funds','assets','investors','reports','documents'],
  jsonb_build_object('accent', '271 62% 63%', 'accent_soft', '271 62% 83%', 'glow', '167, 139, 250'),
  jsonb_build_object('title', 'Real Estate Private Equity', 'subtitle', 'Sign in to your REPE workspace.'),
  'repe_starter', ARRAY['repe_starter','empty'], true, true,
  'Reference pattern: Meridian. NOTE: New REPE envs must respect authoritative state lockdown — reads go through re_authoritative_snapshots (docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md).'
),
(
  'trading_research', 1,
  'Trading / Research Lab',
  'Research workspace with strategies, backtests, signals, and market intelligence.',
  'internal', 'trading_platform',
  '/lab/env/{env_id}/markets', 'private',
  ARRAY['research','strategies','signals','markets','documents'],
  jsonb_build_object('accent', '142 71% 45%', 'accent_soft', '142 71% 70%', 'glow', '34, 197, 94'),
  jsonb_build_object('title', 'Trading Research', 'subtitle', 'Sign in to your research workspace.'),
  'trading_research_starter', ARRAY['trading_research_starter','empty'], true, true,
  'Reference pattern: Trading platform + History Rhymes research.'
),
(
  'public_profile', 1,
  'Public Profile / Storytelling',
  'Public storytelling surface: narrative, visual resume, public-facing AI assistant.',
  'public', 'visual_resume',
  '/lab/env/{env_id}/resume', 'hybrid',
  ARRAY['resume','narrative','documents'],
  jsonb_build_object('accent', '38 92% 50%', 'accent_soft', '38 92% 75%', 'glow', '245, 158, 11'),
  jsonb_build_object('title', 'Public Profile', 'subtitle', 'Explore the story.'),
  'empty', ARRAY['empty'], true, true,
  'Reference pattern: resume environment. Public-read, admin-write.'
),
(
  'public_content', 1,
  'Public Content / Marketing',
  'Public marketing surface: content pages, SEO, landing experiences.',
  'public', 'website',
  '/lab/env/{env_id}/content', 'public',
  ARRAY['content','documents'],
  jsonb_build_object('accent', '330 81% 60%', 'accent_soft', '330 81% 80%', 'glow', '236, 72, 153'),
  jsonb_build_object('title', 'Content', 'subtitle', 'Explore.'),
  'empty', ARRAY['empty'], true, true,
  'Reference pattern: floyorker. Fully public.'
),
(
  'empty_lab', 1,
  'Empty Lab',
  'Bare-bones experimentation shell with no modules enabled. Use when you want to wire everything yourself.',
  'lab', NULL,
  '/lab/env/{env_id}', 'private',
  ARRAY[]::text[],
  jsonb_build_object('accent', '220 9% 46%'),
  jsonb_build_object('title', 'Lab', 'subtitle', 'Experimentation workspace.'),
  'empty', ARRAY['empty'], true, true,
  'No starter data, no modules. Blank canvas.'
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
