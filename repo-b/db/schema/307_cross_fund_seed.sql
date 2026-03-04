-- 307_cross_fund_seed.sql
-- Seeds quarterly cash flow projections for existing assets (2019Q1 → 2025Q4)
-- and auto-creates a "Base" scenario for models missing one.

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed revenue, expense, and amortization schedules for all existing assets
-- Only inserts if no data exists yet for the asset.
-- ═══════════════════════════════════════════════════════════════════════════

-- Revenue schedule: base $250K/quarter with 2% annual growth
INSERT INTO asset_revenue_schedule (asset_id, period_date, revenue)
SELECT
  a.asset_id,
  d.period_date,
  ROUND(250000 * POWER(1.02, EXTRACT(YEAR FROM d.period_date) - 2019), 2)
FROM repe_asset a
CROSS JOIN (
  SELECT generate_series('2019-03-31'::date, '2025-12-31'::date, '3 months'::interval)::date AS period_date
) d
WHERE NOT EXISTS (
  SELECT 1 FROM asset_revenue_schedule r
  WHERE r.asset_id = a.asset_id AND r.period_date = d.period_date
)
ON CONFLICT (asset_id, period_date) DO NOTHING;

-- Expense schedule: ~40% of revenue (base $100K/quarter with 3% annual growth)
INSERT INTO asset_expense_schedule (asset_id, period_date, expense)
SELECT
  a.asset_id,
  d.period_date,
  ROUND(100000 * POWER(1.03, EXTRACT(YEAR FROM d.period_date) - 2019), 2)
FROM repe_asset a
CROSS JOIN (
  SELECT generate_series('2019-03-31'::date, '2025-12-31'::date, '3 months'::interval)::date AS period_date
) d
WHERE NOT EXISTS (
  SELECT 1 FROM asset_expense_schedule e
  WHERE e.asset_id = a.asset_id AND e.period_date = d.period_date
)
ON CONFLICT (asset_id, period_date) DO NOTHING;

-- Amortization schedule: ~$15K/quarter with slight growth
INSERT INTO asset_amort_schedule (asset_id, period_date, amort_amount)
SELECT
  a.asset_id,
  d.period_date,
  ROUND(15000 * POWER(1.01, EXTRACT(YEAR FROM d.period_date) - 2019), 2)
FROM repe_asset a
CROSS JOIN (
  SELECT generate_series('2019-03-31'::date, '2025-12-31'::date, '3 months'::interval)::date AS period_date
) d
WHERE NOT EXISTS (
  SELECT 1 FROM asset_amort_schedule am
  WHERE am.asset_id = a.asset_id AND am.period_date = d.period_date
)
ON CONFLICT (asset_id, period_date) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Auto-create "Base" scenario for any existing re_model that lacks one
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO re_model_scenarios (model_id, name, description, is_base)
SELECT m.model_id, 'Base', 'Auto-created base scenario', true
FROM re_model m
WHERE NOT EXISTS (
  SELECT 1 FROM re_model_scenarios s
  WHERE s.model_id = m.model_id AND s.is_base = true
)
ON CONFLICT (model_id, name) DO NOTHING;
