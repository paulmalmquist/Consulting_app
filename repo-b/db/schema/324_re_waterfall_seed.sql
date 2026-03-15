-- 324_re_waterfall_seed.sql
-- Seed waterfall definition and tiers for the demo fund (IGF-VII).
-- European-style waterfall: Return of Capital -> Preferred Return (8%) -> Catch-Up -> 80/20 Split.
-- Safe to re-run: uses ON CONFLICT DO NOTHING and deterministic UUIDs.

INSERT INTO re_waterfall_definition (definition_id, fund_id, name, waterfall_type, version, is_active)
VALUES (
  'a1b2c3d4-wf01-0001-0001-000000000001'::uuid,
  'a1b2c3d4-0003-0030-0001-000000000001'::uuid,
  'Default',
  'european',
  1,
  true
)
ON CONFLICT DO NOTHING;

-- Tier 1: Return of Capital (LP receives 100% until contributed capital is returned)
INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type, hurdle_rate, split_gp, split_lp, catch_up_percent, notes)
VALUES (
  'a1b2c3d4-wt01-0001-0001-000000000001'::uuid,
  'a1b2c3d4-wf01-0001-0001-000000000001'::uuid,
  1,
  'return_of_capital',
  NULL,
  0.0,
  1.0,
  NULL,
  'Return all contributed capital to LPs before any profit split'
)
ON CONFLICT DO NOTHING;

-- Tier 2: Preferred Return (LP receives 100% until 8% IRR hurdle is met)
INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type, hurdle_rate, split_gp, split_lp, catch_up_percent, notes)
VALUES (
  'a1b2c3d4-wt01-0001-0002-000000000001'::uuid,
  'a1b2c3d4-wf01-0001-0001-000000000001'::uuid,
  2,
  'preferred_return',
  0.08,
  0.0,
  1.0,
  NULL,
  '8% compounding preferred return to LPs'
)
ON CONFLICT DO NOTHING;

-- Tier 3: Catch-Up (GP receives 100% until GP has received 20% of all cumulative profits)
INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type, hurdle_rate, split_gp, split_lp, catch_up_percent, notes)
VALUES (
  'a1b2c3d4-wt01-0001-0003-000000000001'::uuid,
  'a1b2c3d4-wf01-0001-0001-000000000001'::uuid,
  3,
  'catch_up',
  NULL,
  1.0,
  0.0,
  0.20,
  'GP catch-up until GP has 20% of total distributions above return of capital'
)
ON CONFLICT DO NOTHING;

-- Tier 4: Residual Split (80% LP / 20% GP on all remaining distributions)
INSERT INTO re_waterfall_tier (tier_id, definition_id, tier_order, tier_type, hurdle_rate, split_gp, split_lp, catch_up_percent, notes)
VALUES (
  'a1b2c3d4-wt01-0001-0004-000000000001'::uuid,
  'a1b2c3d4-wf01-0001-0001-000000000001'::uuid,
  4,
  'split',
  NULL,
  0.20,
  0.80,
  NULL,
  'Standard 80/20 LP/GP carried interest split'
)
ON CONFLICT DO NOTHING;
