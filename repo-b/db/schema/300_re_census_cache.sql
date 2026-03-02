-- Migration 300: Census tract cache + layer definitions

CREATE TABLE IF NOT EXISTS re_census_tract_cache (
  tract_geoid      text PRIMARY KEY,
  state_fips       text NOT NULL,
  county_fips      text NOT NULL,
  tract_fips       text NOT NULL,
  geometry_geojson jsonb,
  centroid_lat     numeric(10,7),
  centroid_lon     numeric(11,7),
  metrics_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_year      int NOT NULL DEFAULT 2023,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  ttl_expires_at   timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS idx_re_census_tract_centroid ON re_census_tract_cache(centroid_lat, centroid_lon);

CREATE TABLE IF NOT EXISTS re_census_layer_def (
  layer_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_name       text NOT NULL UNIQUE,
  census_variable  text NOT NULL,
  label            text NOT NULL,
  color_scale      text NOT NULL DEFAULT 'YlOrRd',
  unit             text,
  description      text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO re_census_layer_def (layer_name, census_variable, label, color_scale, unit, description)
VALUES
  ('median_income',     'B19013_001E', 'Median Household Income',    'Greens',  'USD',    'ACS 5-year estimate'),
  ('population',        'B01003_001E', 'Total Population',           'Blues',   'people', 'ACS 5-year estimate'),
  ('median_rent',       'B25064_001E', 'Median Gross Rent',          'YlOrRd', 'USD',    'ACS 5-year estimate'),
  ('vacancy_rate',      'B25002_003E', 'Vacant Housing Units',       'Reds',   'units',  'ACS 5-year estimate'),
  ('median_home_value', 'B25077_001E', 'Median Home Value',          'Purples','USD',    'ACS 5-year estimate'),
  ('poverty_rate',      'B17001_002E', 'Population Below Poverty',   'OrRd',   'people', 'ACS 5-year estimate')
ON CONFLICT (layer_name) DO NOTHING;
