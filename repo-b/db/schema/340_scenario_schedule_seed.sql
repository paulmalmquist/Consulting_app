-- 340: Seed 8 quarters of revenue/expense/amort schedules for seeded assets.
-- The scenario run engine requires schedule data in asset_revenue_schedule,
-- asset_expense_schedule, and asset_amort_schedule to produce outputs.
-- Safe to re-run: uses ON CONFLICT DO NOTHING.

DO $$
DECLARE
  v_asset_ids uuid[] := ARRAY[
    'a1b2c3d4-9001-0001-0001-000000000001'::uuid, -- Parkview Residences
    'a1b2c3d4-9001-0001-0002-000000000001'::uuid, -- Heritage Senior Living
    'a1b2c3d4-9001-0001-0003-000000000001'::uuid, -- Campus Edge Apartments
    'a1b2c3d4-9001-0001-0004-000000000001'::uuid, -- Meridian Medical Plaza
    'a1b2c3d4-9001-0001-0005-000000000001'::uuid  -- Gateway Distribution Center
  ];

  -- Quarterly revenue per asset (realistic institutional scale)
  v_base_revenue numeric[] := ARRAY[
    2800000,   -- Parkview: 280 units × ~$1,670/mo × 3mo ×2 (gross revenue + other income)
    1950000,   -- Heritage: senior housing, rate per occupied bed
    1600000,   -- Campus Edge: student housing
    1100000,   -- Meridian: medical office NNN rents
    3200000    -- Gateway: industrial, large distribution center
  ];

  -- Quarterly expense per asset
  v_base_expense numeric[] := ARRAY[
    1680000,   -- Parkview: ~60% expense ratio
    1365000,   -- Heritage: ~70% expense ratio (labor-heavy)
     880000,   -- Campus Edge: ~55% expense ratio
     440000,   -- Meridian: ~40% expense ratio (NNN)
    1280000    -- Gateway: ~40% expense ratio
  ];

  -- Quarterly amortization per asset
  v_base_amort numeric[] := ARRAY[
    125000,
     95000,
     80000,
     55000,
    160000
  ];

  v_dates date[] := ARRAY[
    '2025-03-31'::date,
    '2025-06-30'::date,
    '2025-09-30'::date,
    '2025-12-31'::date,
    '2026-03-31'::date,
    '2026-06-30'::date,
    '2026-09-30'::date,
    '2026-12-31'::date
  ];

  i int;
  j int;
  v_growth_factor numeric;
BEGIN
  FOR i IN 1..array_length(v_asset_ids, 1) LOOP
    -- Only insert if the asset exists
    IF NOT EXISTS (SELECT 1 FROM repe_asset WHERE asset_id = v_asset_ids[i]) THEN
      CONTINUE;
    END IF;

    FOR j IN 1..array_length(v_dates, 1) LOOP
      -- Apply small quarterly growth (0.5% per quarter)
      v_growth_factor := POWER(1.005, j - 1);

      INSERT INTO asset_revenue_schedule (asset_id, period_date, revenue)
      VALUES (
        v_asset_ids[i],
        v_dates[j],
        ROUND(v_base_revenue[i] * v_growth_factor, 2)
      )
      ON CONFLICT (asset_id, period_date) DO NOTHING;

      INSERT INTO asset_expense_schedule (asset_id, period_date, expense)
      VALUES (
        v_asset_ids[i],
        v_dates[j],
        ROUND(v_base_expense[i] * POWER(1.003, j - 1), 2)  -- expenses grow slower
      )
      ON CONFLICT (asset_id, period_date) DO NOTHING;

      INSERT INTO asset_amort_schedule (asset_id, period_date, amort_amount)
      VALUES (
        v_asset_ids[i],
        v_dates[j],
        v_base_amort[i]  -- amort is flat
      )
      ON CONFLICT (asset_id, period_date) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
