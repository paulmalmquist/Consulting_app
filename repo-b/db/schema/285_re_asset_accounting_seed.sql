-- 285_re_asset_accounting_seed.sql
-- Asset-level accounting seed: extend property columns, create GL rollup +
-- occupancy quarter tables, backfill property geography, and seed 4 quarters
-- of realistic GL and occupancy data for every existing property asset.
--
-- Depends on: 265_repe_object_model.sql, 266_repe_env_business_binding.sql,
--             270_re_institutional_model.sql, 284_repe_investment_asset_invariants.sql
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
--             ON CONFLICT DO NOTHING / DO UPDATE.

-- =============================================================================
-- I. Extend repe_property_asset with geographic + physical columns
-- =============================================================================

ALTER TABLE IF EXISTS repe_property_asset
  ADD COLUMN IF NOT EXISTS city         TEXT,
  ADD COLUMN IF NOT EXISTS state        TEXT,
  ADD COLUMN IF NOT EXISTS msa          TEXT,
  ADD COLUMN IF NOT EXISTS address      TEXT,
  ADD COLUMN IF NOT EXISTS square_feet  NUMERIC,
  ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'active';

-- =============================================================================
-- II. GL quarter rollup table
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_asset_acct_quarter_rollup (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id      UUID NOT NULL,
  business_id UUID NOT NULL,
  asset_id    UUID NOT NULL REFERENCES repe_asset(asset_id),
  quarter     TEXT NOT NULL,
  revenue     NUMERIC DEFAULT 0,
  opex        NUMERIC DEFAULT 0,
  noi         NUMERIC DEFAULT 0,
  capex       NUMERIC DEFAULT 0,
  source      TEXT DEFAULT 'seed',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(env_id, asset_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_re_asset_acct_qtr_rollup_asset
  ON re_asset_acct_quarter_rollup(asset_id, quarter);

CREATE INDEX IF NOT EXISTS idx_re_asset_acct_qtr_rollup_env
  ON re_asset_acct_quarter_rollup(env_id, business_id, quarter);

-- =============================================================================
-- III. Occupancy quarter table
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_asset_occupancy_quarter (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         UUID NOT NULL,
  business_id    UUID NOT NULL,
  asset_id       UUID NOT NULL REFERENCES repe_asset(asset_id),
  quarter        TEXT NOT NULL,
  occupancy      NUMERIC,
  avg_rent       NUMERIC,
  units_occupied INT,
  units_total    INT,
  source         TEXT DEFAULT 'seed',
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(env_id, asset_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_re_asset_occ_qtr_asset
  ON re_asset_occupancy_quarter(asset_id, quarter);

CREATE INDEX IF NOT EXISTS idx_re_asset_occ_qtr_env
  ON re_asset_occupancy_quarter(env_id, business_id, quarter);

-- =============================================================================
-- IV. Backfill property geography (city / state / msa) deterministically
-- =============================================================================

WITH numbered AS (
  SELECT pa.asset_id,
         ROW_NUMBER() OVER (ORDER BY pa.asset_id) AS rn
  FROM repe_property_asset pa
  WHERE pa.city IS NULL OR pa.city = ''
)
UPDATE repe_property_asset pa
SET
  city = CASE (n.rn % 8)
    WHEN 1 THEN 'Chicago'
    WHEN 2 THEN 'Miami'
    WHEN 3 THEN 'Dallas'
    WHEN 4 THEN 'Atlanta'
    WHEN 5 THEN 'Denver'
    WHEN 6 THEN 'Phoenix'
    WHEN 7 THEN 'Nashville'
    WHEN 0 THEN 'Charlotte'
  END,
  state = CASE (n.rn % 8)
    WHEN 1 THEN 'IL'
    WHEN 2 THEN 'FL'
    WHEN 3 THEN 'TX'
    WHEN 4 THEN 'GA'
    WHEN 5 THEN 'CO'
    WHEN 6 THEN 'AZ'
    WHEN 7 THEN 'TN'
    WHEN 0 THEN 'NC'
  END,
  msa = CASE (n.rn % 8)
    WHEN 1 THEN 'Chicago-Naperville-Elgin'
    WHEN 2 THEN 'Miami-Fort Lauderdale-Pompano Beach'
    WHEN 3 THEN 'Dallas-Fort Worth-Arlington'
    WHEN 4 THEN 'Atlanta-Sandy Springs-Alpharetta'
    WHEN 5 THEN 'Denver-Aurora-Lakewood'
    WHEN 6 THEN 'Phoenix-Mesa-Chandler'
    WHEN 7 THEN 'Nashville-Davidson-Murfreesboro'
    WHEN 0 THEN 'Charlotte-Concord-Gastonia'
  END,
  status = 'active'
FROM numbered n
WHERE pa.asset_id = n.asset_id;

-- Backfill address for rows still missing one
WITH numbered AS (
  SELECT pa.asset_id,
         ROW_NUMBER() OVER (ORDER BY pa.asset_id) AS rn
  FROM repe_property_asset pa
  WHERE pa.address IS NULL OR pa.address = ''
)
UPDATE repe_property_asset pa
SET address = CASE (n.rn % 8)
    WHEN 1 THEN (100 + n.rn * 11)::text || ' N Michigan Ave'
    WHEN 2 THEN (200 + n.rn * 7 )::text || ' Brickell Ave'
    WHEN 3 THEN (300 + n.rn * 13)::text || ' Commerce St'
    WHEN 4 THEN (400 + n.rn * 9 )::text || ' Peachtree Rd NE'
    WHEN 5 THEN (500 + n.rn * 11)::text || ' 17th St'
    WHEN 6 THEN (600 + n.rn * 7 )::text || ' E Camelback Rd'
    WHEN 7 THEN (700 + n.rn * 13)::text || ' Broadway'
    WHEN 0 THEN (800 + n.rn * 9 )::text || ' S Tryon St'
  END
FROM numbered n
WHERE pa.asset_id = n.asset_id;

-- Backfill square_feet for rows still missing it
WITH numbered AS (
  SELECT pa.asset_id,
         ROW_NUMBER() OVER (ORDER BY pa.asset_id) AS rn
  FROM repe_property_asset pa
  WHERE pa.square_feet IS NULL
)
UPDATE repe_property_asset pa
SET square_feet = CASE (n.rn % 4)
    WHEN 1 THEN 185000
    WHEN 2 THEN 220000
    WHEN 3 THEN 145000
    WHEN 0 THEN 310000
  END
FROM numbered n
WHERE pa.asset_id = n.asset_id;

-- =============================================================================
-- V. Seed GL rollup data for 4 quarters (2025Q2 – 2026Q1)
-- =============================================================================
--
-- For each property asset we generate revenue, opex, noi, capex per quarter
-- with a ~2 % sequential growth trend.  Base revenue is deterministic per asset
-- position (2.0 M – 5.0 M range).  OpEx ratio 45-55 %.  CapEx 8-12 % of rev.

INSERT INTO re_asset_acct_quarter_rollup
  (env_id, business_id, asset_id, quarter, revenue, opex, noi, capex, source)
SELECT
  eb.env_id,
  eb.business_id,
  a.asset_id,
  q.quarter,
  -- revenue: base varies by asset row number, grows ~2 % per quarter index
  ROUND(
    (2000000 + (numbered.rn % 7) * 450000)  -- base 2.0M–5.15M
    * POWER(1.02, q.qi)                      -- compound 2 % growth
  , 2) AS revenue,
  -- opex: 45-55 % of revenue (ratio varies by rn)
  ROUND(
    (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi)
    * (0.45 + (numbered.rn % 5) * 0.025)
  , 2) AS opex,
  -- noi = revenue - opex
  ROUND(
    (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi)
    - (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi)
      * (0.45 + (numbered.rn % 5) * 0.025)
  , 2) AS noi,
  -- capex: 8-12 % of revenue
  ROUND(
    (2000000 + (numbered.rn % 7) * 450000) * POWER(1.02, q.qi)
    * (0.08 + (numbered.rn % 3) * 0.02)
  , 2) AS capex,
  'seed' AS source
FROM repe_asset a
JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
CROSS JOIN (
  VALUES ('2025Q2', 0), ('2025Q3', 1), ('2025Q4', 2), ('2026Q1', 3)
) AS q(quarter, qi)
CROSS JOIN LATERAL (
  SELECT ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
  FROM repe_asset a2
  JOIN repe_property_asset pa2 ON pa2.asset_id = a2.asset_id
  WHERE a2.asset_id = a.asset_id
) AS numbered
ON CONFLICT (env_id, asset_id, quarter) DO NOTHING;

-- =============================================================================
-- VI. Seed occupancy data for the same 4 quarters
-- =============================================================================
--
-- Occupancy 85-96 %.  Avg rent $1,500-$3,500.  Units from repe_property_asset
-- (fallback 200).  Slight seasonal variation built in.

INSERT INTO re_asset_occupancy_quarter
  (env_id, business_id, asset_id, quarter, occupancy, avg_rent,
   units_occupied, units_total, source)
SELECT
  eb.env_id,
  eb.business_id,
  a.asset_id,
  q.quarter,
  -- occupancy: base 88-96 % with slight quarterly drift
  ROUND(
    (88 + (numbered.rn % 5) * 1.8)
    + q.qi * 0.4                    -- gentle upward trend
    - CASE q.qi WHEN 2 THEN 1.0 ELSE 0 END  -- small Q4 dip
  , 1) AS occupancy,
  -- avg_rent: $1,500 - $3,500 base, grows ~0.5 % per quarter
  ROUND(
    (1500 + (numbered.rn % 8) * 250) * POWER(1.005, q.qi)
  , 2) AS avg_rent,
  -- units_occupied: occupancy * total
  ROUND(
    COALESCE(pa.units, 200)
    * ((88 + (numbered.rn % 5) * 1.8 + q.qi * 0.4 - CASE q.qi WHEN 2 THEN 1.0 ELSE 0 END) / 100.0)
  )::int AS units_occupied,
  -- units_total
  COALESCE(pa.units, 200) AS units_total,
  'seed' AS source
FROM repe_asset a
JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
JOIN repe_deal d ON d.deal_id = a.deal_id
JOIN repe_fund f ON f.fund_id = d.fund_id
JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
CROSS JOIN (
  VALUES ('2025Q2', 0), ('2025Q3', 1), ('2025Q4', 2), ('2026Q1', 3)
) AS q(quarter, qi)
CROSS JOIN LATERAL (
  SELECT ROW_NUMBER() OVER (ORDER BY a.asset_id) AS rn
  FROM repe_asset a2
  JOIN repe_property_asset pa2 ON pa2.asset_id = a2.asset_id
  WHERE a2.asset_id = a.asset_id
) AS numbered
ON CONFLICT (env_id, asset_id, quarter) DO NOTHING;
