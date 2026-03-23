-- Migration 017: Geo market intelligence foundation
-- Adds normalized geography dimensions, market facts, hazard facts,
-- and asset-level market context for the pipeline geo workspace.

CREATE TABLE IF NOT EXISTS dim_geo_county (
  geoid              text PRIMARY KEY,
  name               text NOT NULL,
  state_fips         text NOT NULL,
  state_code         text,
  cbsa_code          text,
  geom               geometry(MultiPolygon, 4326),
  centroid           geometry(Point, 4326),
  area_sq_miles      numeric,
  geometry_vintage   integer NOT NULL,
  source_name        text NOT NULL DEFAULT 'TIGER/Line',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dim_geo_tract (
  geoid              text PRIMARY KEY,
  county_geoid       text NOT NULL REFERENCES dim_geo_county(geoid) ON DELETE CASCADE,
  name               text NOT NULL,
  state_fips         text NOT NULL,
  state_code         text,
  cbsa_code          text,
  geom               geometry(MultiPolygon, 4326),
  centroid           geometry(Point, 4326),
  area_sq_miles      numeric,
  geometry_vintage   integer NOT NULL,
  source_name        text NOT NULL DEFAULT 'TIGER/Line',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dim_geo_block_group (
  geoid              text PRIMARY KEY,
  tract_geoid        text NOT NULL REFERENCES dim_geo_tract(geoid) ON DELETE CASCADE,
  county_geoid       text NOT NULL REFERENCES dim_geo_county(geoid) ON DELETE CASCADE,
  name               text NOT NULL,
  state_fips         text NOT NULL,
  state_code         text,
  cbsa_code          text,
  geom               geometry(MultiPolygon, 4326),
  centroid           geometry(Point, 4326),
  area_sq_miles      numeric,
  geometry_vintage   integer NOT NULL,
  source_name        text NOT NULL DEFAULT 'TIGER/Line',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dim_geo_metric_catalog (
  metric_key          text PRIMARY KEY,
  display_name        text NOT NULL,
  description         text,
  category            text NOT NULL,
  units               text,
  geography_levels    jsonb NOT NULL DEFAULT '["county","tract","block_group"]'::jsonb,
  compare_modes       jsonb NOT NULL DEFAULT '["tract","county","metro"]'::jsonb,
  color_scale         text NOT NULL DEFAULT 'blue_sequential',
  source_name         text NOT NULL,
  source_url          text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geo_polygon_cache (
  cache_key            text PRIMARY KEY,
  geography_level      text NOT NULL,
  geoid                text NOT NULL,
  zoom_bucket          integer NOT NULL,
  simplify_tolerance   numeric NOT NULL,
  geometry_geojson     jsonb NOT NULL,
  generated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fact_geo_market_snapshot (
  geography_level      text NOT NULL,
  geoid                text NOT NULL,
  metric_key           text NOT NULL REFERENCES dim_geo_metric_catalog(metric_key) ON DELETE CASCADE,
  period_start         date NOT NULL,
  period_grain         text NOT NULL,
  value                numeric,
  units                text,
  source_name          text NOT NULL,
  source_url           text,
  dataset_vintage      text NOT NULL,
  provenance           jsonb NOT NULL DEFAULT '{}'::jsonb,
  pulled_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (geography_level, geoid, metric_key, period_start, dataset_vintage)
);

CREATE TABLE IF NOT EXISTS fact_geo_hazard_context (
  geography_level      text NOT NULL,
  geoid                text NOT NULL,
  hazard_key           text NOT NULL,
  period_start         date NOT NULL,
  period_grain         text NOT NULL DEFAULT 'annual',
  value                numeric,
  units                text,
  source_name          text NOT NULL,
  source_url           text,
  dataset_vintage      text NOT NULL,
  provenance           jsonb NOT NULL DEFAULT '{}'::jsonb,
  pulled_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (geography_level, geoid, hazard_key, period_start, dataset_vintage)
);

CREATE TABLE IF NOT EXISTS fact_asset_market_context (
  context_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  deal_id              uuid REFERENCES re_pipeline_deal(deal_id) ON DELETE CASCADE,
  property_id          uuid NOT NULL REFERENCES re_pipeline_property(property_id) ON DELETE CASCADE,
  canonical_property_id uuid,
  county_geoid         text,
  tract_geoid          text,
  block_group_geoid    text,
  cbsa_code            text,
  lat                  numeric,
  lon                  numeric,
  market_metrics_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  hazard_metrics_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  benchmark_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  fit_json             jsonb NOT NULL DEFAULT '{}'::jsonb,
  commentary_seed_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_vintage      text,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, metrics_vintage)
);

ALTER TABLE re_pipeline_property
  ADD COLUMN IF NOT EXISTS county_geoid text,
  ADD COLUMN IF NOT EXISTS tract_geoid text,
  ADD COLUMN IF NOT EXISTS block_group_geoid text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS geocode_confidence numeric;

CREATE INDEX IF NOT EXISTS dim_geo_county_geom_gix
  ON dim_geo_county USING gist (geom);
CREATE INDEX IF NOT EXISTS dim_geo_tract_geom_gix
  ON dim_geo_tract USING gist (geom);
CREATE INDEX IF NOT EXISTS dim_geo_block_group_geom_gix
  ON dim_geo_block_group USING gist (geom);
CREATE INDEX IF NOT EXISTS fact_geo_market_snapshot_lookup_idx
  ON fact_geo_market_snapshot (geography_level, geoid, metric_key, period_start DESC);
CREATE INDEX IF NOT EXISTS fact_geo_hazard_context_lookup_idx
  ON fact_geo_hazard_context (geography_level, geoid, hazard_key, period_start DESC);
CREATE INDEX IF NOT EXISTS fact_asset_market_context_env_idx
  ON fact_asset_market_context (env_id, deal_id, property_id);
CREATE INDEX IF NOT EXISTS re_pipeline_property_geoids_idx
  ON re_pipeline_property (county_geoid, tract_geoid, block_group_geoid);
