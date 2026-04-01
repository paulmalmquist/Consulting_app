-- 303_pipeline_geography.sql
-- Pipeline Map: geographic polygons, market data metrics, and property-to-geography linking.
-- Requires PostGIS extension for geometry columns and spatial indexes.

-- Enable PostGIS (graceful no-op if not available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PIPELINE GEOGRAPHY DIMENSION — Census tracts, counties, CBSAs for pipeline map
-- Note: dim_geography is defined in 303_cre_intelligence_graph.sql (uuid PK, geoid).
-- This file uses pipeline_geography for the pipeline-map workflow (text GEOID PK).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pipeline_geography (
    geography_id    text PRIMARY KEY,              -- stable ID: GEOID for tract/county, CBSA code for metro
    geography_type  text NOT NULL
                    CHECK (geography_type IN ('tract', 'county', 'cbsa', 'zcta', 'state')),
    name            text NOT NULL,
    state_fips      text,
    county_fips     text,
    cbsa_code       text,
    geom            geometry(MultiPolygon, 4326),   -- WGS84 polygon geometry
    bbox            geometry(Polygon, 4326),         -- bounding box for fast viewport queries
    centroid_lat    numeric(10, 7),
    centroid_lon    numeric(11, 7),
    area_sq_miles   numeric(18, 4),
    source_name     text NOT NULL DEFAULT 'TIGER/Line',
    dataset_vintage text NOT NULL DEFAULT '2023',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_geography_type
    ON pipeline_geography (geography_type);

CREATE INDEX IF NOT EXISTS idx_pipeline_geography_state
    ON pipeline_geography (state_fips);

-- Spatial indexes (only effective if PostGIS is active)
CREATE INDEX IF NOT EXISTS idx_pipeline_geography_geom
    ON pipeline_geography USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_pipeline_geography_bbox
    ON pipeline_geography USING GIST (bbox);

-- ═══════════════════════════════════════════════════════════════════════════════
-- METRIC DIMENSION — Catalog of available market data layers
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dim_metric (
    metric_key                  text PRIMARY KEY,
    display_name                text NOT NULL,
    description                 text,
    units                       text NOT NULL,
    grain_supported             text[] NOT NULL DEFAULT ARRAY['annual'],
    geography_types_supported   text[] NOT NULL DEFAULT ARRAY['county'],
    source_name                 text NOT NULL,
    source_url                  text,
    color_scale                 text NOT NULL DEFAULT 'YlOrRd',
    notes                       text,
    is_active                   boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Seed initial metric catalog
INSERT INTO dim_metric (metric_key, display_name, units, grain_supported, geography_types_supported, source_name, source_url, color_scale, description) VALUES
    ('median_hh_income',       'Median Household Income',   'USD',     ARRAY['annual'],                ARRAY['tract','county','cbsa'], 'ACS 5-Year',    'https://data.census.gov', 'Greens',  'ACS B19013_001E: Median household income in the past 12 months'),
    ('population',             'Total Population',          'people',  ARRAY['annual'],                ARRAY['tract','county','cbsa'], 'ACS 5-Year',    'https://data.census.gov', 'Blues',   'ACS B01003_001E: Total population'),
    ('median_gross_rent',      'Median Gross Rent',         'USD',     ARRAY['annual'],                ARRAY['tract','county'],        'ACS 5-Year',    'https://data.census.gov', 'YlOrRd',  'ACS B25064_001E: Median gross rent'),
    ('median_home_value',      'Median Home Value',         'USD',     ARRAY['annual'],                ARRAY['tract','county'],        'ACS 5-Year',    'https://data.census.gov', 'Purples', 'ACS B25077_001E: Median value of owner-occupied housing units'),
    ('unemployment_rate',      'Unemployment Rate',         '%',       ARRAY['monthly','annual'],      ARRAY['county','cbsa'],         'BLS LAUS',      'https://www.bls.gov/lau', 'Reds',    'BLS Local Area Unemployment Statistics'),
    ('hud_fmr_2br',           'Fair Market Rent (2BR)',     'USD',     ARRAY['annual'],                ARRAY['county','cbsa'],         'HUD FMR',       'https://www.huduser.gov/portal/datasets/fmr.html', 'Oranges', 'HUD Fair Market Rents for 2-bedroom units'),
    ('vacancy_rate',           'Vacancy Rate',              '%',       ARRAY['annual'],                ARRAY['tract','county'],        'ACS 5-Year',    'https://data.census.gov', 'OrRd',    'ACS B25002: Derived vacancy rate')
ON CONFLICT (metric_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- MARKET METRIC FACTS — Time-series data points per geography per metric
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fact_market_metric (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    geography_id      text NOT NULL REFERENCES pipeline_geography(geography_id),
    metric_key        text NOT NULL REFERENCES dim_metric(metric_key),
    period_start      date NOT NULL,
    period_grain      text NOT NULL CHECK (period_grain IN ('monthly', 'quarterly', 'annual')),
    value             numeric,
    units             text,
    source_name       text,
    source_url        text,
    dataset_vintage   text,
    pulled_at         timestamptz NOT NULL DEFAULT now(),
    transform_notes   text,
    UNIQUE (geography_id, metric_key, period_start, dataset_vintage)
);

CREATE INDEX IF NOT EXISTS idx_fact_market_metric_geo
    ON fact_market_metric (geography_id);

CREATE INDEX IF NOT EXISTS idx_fact_market_metric_key_period
    ON fact_market_metric (metric_key, period_start);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROPERTY-TO-GEOGRAPHY LINK — Spatial join results
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS property_geography_link (
    property_id     uuid NOT NULL,
    geography_type  text NOT NULL,
    geography_id    text NOT NULL REFERENCES pipeline_geography(geography_id),
    link_method     text NOT NULL DEFAULT 'geocode+spatial_join'
                    CHECK (link_method IN ('geocode+spatial_join', 'manual', 'address_match')),
    confidence      numeric(5, 4),
    linked_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (property_id, geography_type)
);

CREATE INDEX IF NOT EXISTS idx_property_geography_link_geo
    ON property_geography_link (geography_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ETL RUN LOG — Audit trail for data ingestion jobs
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS geography_etl_run_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name        text NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    ended_at        timestamptz,
    rows_inserted   int,
    rows_updated    int,
    errors          text,
    status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'failed')),
    metadata        jsonb
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LATEST METRIC VIEW — Convenience view for the most recent value per geography
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_latest_market_metric AS
SELECT DISTINCT ON (f.geography_id, f.metric_key)
    f.geography_id,
    f.metric_key,
    f.period_start,
    f.period_grain,
    f.value,
    f.units,
    f.source_name,
    f.dataset_vintage,
    f.pulled_at
FROM fact_market_metric f
ORDER BY f.geography_id, f.metric_key, f.period_start DESC;
