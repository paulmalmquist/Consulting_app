-- 389_backfill_asset_locations.sql
-- Backfill latitude/longitude for ALL property assets missing location data.
-- Assigns coordinates based on existing market/city fields when available,
-- otherwise distributes across major REPE markets deterministically.
--
-- Depends on: 265_repe_object_model.sql, 387_property_asset_location.sql,
--             285_re_asset_accounting_seed.sql
-- Idempotent: only updates rows where latitude IS NULL.

-- Step 1: Create a temp lookup of 20 major REPE market centroids
CREATE TEMP TABLE IF NOT EXISTS _market_coords (
  idx    INT,
  market TEXT,
  city   TEXT,
  state  TEXT,
  lat    NUMERIC(10,7),
  lon    NUMERIC(10,7)
);

TRUNCATE _market_coords;
INSERT INTO _market_coords (idx, market, city, state, lat, lon) VALUES
  ( 0, 'Dallas',         'Dallas',         'TX', 32.7767,  -96.7970),
  ( 1, 'Austin',         'Austin',         'TX', 30.2672,  -97.7431),
  ( 2, 'Houston',        'Houston',        'TX', 29.7604,  -95.3698),
  ( 3, 'Chicago',        'Chicago',        'IL', 41.8781,  -87.6298),
  ( 4, 'Miami',          'Miami',          'FL', 25.7617,  -80.1918),
  ( 5, 'Atlanta',        'Atlanta',        'GA', 33.7490,  -84.3880),
  ( 6, 'Phoenix',        'Phoenix',        'AZ', 33.4484,  -112.0740),
  ( 7, 'Denver',         'Denver',         'CO', 39.7392,  -104.9903),
  ( 8, 'Nashville',      'Nashville',      'TN', 36.1627,  -86.7816),
  ( 9, 'Charlotte',      'Charlotte',      'NC', 35.2271,  -80.8431),
  (10, 'Tampa',          'Tampa',          'FL', 27.9506,  -82.4572),
  (11, 'Seattle',        'Seattle',        'WA', 47.6062,  -122.3321),
  (12, 'New York',       'New York',       'NY', 40.7128,  -74.0060),
  (13, 'Los Angeles',    'Los Angeles',    'CA', 34.0522,  -118.2437),
  (14, 'San Francisco',  'San Francisco',  'CA', 37.7749,  -122.4194),
  (15, 'Boston',         'Boston',         'MA', 42.3601,  -71.0589),
  (16, 'Raleigh',        'Raleigh',        'NC', 35.7796,  -78.6382),
  (17, 'Orlando',        'Orlando',        'FL', 28.5383,  -81.3792),
  (18, 'Minneapolis',    'Minneapolis',    'MN', 44.9778,  -93.2650),
  (19, 'Salt Lake City', 'Salt Lake City', 'UT', 40.7608,  -111.8910),
  (20, 'San Antonio',    'San Antonio',    'TX', 29.4241,  -98.4936),
  (21, 'Jacksonville',   'Jacksonville',   'FL', 30.3322,  -81.6557),
  (22, 'Portland',       'Portland',       'OR', 45.5152,  -122.6784),
  (23, 'Aurora',         'Aurora',         'CO', 39.7294,  -104.8319),
  (24, 'Scottsdale',     'Scottsdale',     'AZ', 33.4942,  -111.9261),
  (25, 'Brooklyn',       'Brooklyn',       'NY', 40.6892,  -73.9857),
  (26, 'Tempe',          'Tempe',          'AZ', 33.4255,  -111.9400);

-- Step 2: Backfill coordinates for assets that match on market name
UPDATE repe_property_asset pa
SET latitude  = mc.lat + (0.003 * sin(hashtext(pa.asset_id::text)::numeric / 1000000)),
    longitude = mc.lon + (0.003 * cos(hashtext(pa.asset_id::text)::numeric / 1000000))
FROM _market_coords mc
WHERE (pa.latitude IS NULL OR pa.longitude IS NULL)
  AND pa.market IS NOT NULL
  AND lower(pa.market) = lower(mc.market);

-- Step 3: Backfill coordinates for assets that match on city name
UPDATE repe_property_asset pa
SET latitude  = mc.lat + (0.003 * sin(hashtext(pa.asset_id::text)::numeric / 1000000)),
    longitude = mc.lon + (0.003 * cos(hashtext(pa.asset_id::text)::numeric / 1000000))
FROM _market_coords mc
WHERE (pa.latitude IS NULL OR pa.longitude IS NULL)
  AND pa.city IS NOT NULL
  AND lower(pa.city) = lower(mc.city);

-- Step 4: Distribute remaining unlocated assets across markets via round-robin
-- Uses row_number to assign each unlocated asset a deterministic market index
WITH unlocated AS (
  SELECT pa.asset_id,
         (row_number() OVER (ORDER BY pa.asset_id))::int - 1 AS rn
  FROM repe_property_asset pa
  WHERE pa.latitude IS NULL OR pa.longitude IS NULL
)
UPDATE repe_property_asset pa
SET latitude  = mc.lat + (0.004 * sin(hashtext(pa.asset_id::text)::numeric / 1000000)),
    longitude = mc.lon + (0.004 * cos(hashtext(pa.asset_id::text)::numeric / 1000000)),
    market    = COALESCE(pa.market, mc.market),
    city      = COALESCE(pa.city, mc.city),
    state     = COALESCE(pa.state, mc.state)
FROM unlocated u
JOIN _market_coords mc ON mc.idx = u.rn % 20
WHERE pa.asset_id = u.asset_id
  AND (pa.latitude IS NULL OR pa.longitude IS NULL);

DROP TABLE IF EXISTS _market_coords;
