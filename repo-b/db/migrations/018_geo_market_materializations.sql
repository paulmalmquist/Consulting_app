-- Migration 018: Geo market intelligence views and materialization helpers

CREATE OR REPLACE VIEW vw_geo_metric_latest AS
SELECT DISTINCT ON (geography_level, geoid, metric_key)
  geography_level,
  geoid,
  metric_key,
  period_start,
  period_grain,
  value,
  units,
  source_name,
  source_url,
  dataset_vintage,
  provenance,
  pulled_at
FROM fact_geo_market_snapshot
ORDER BY geography_level, geoid, metric_key, period_start DESC, pulled_at DESC;

CREATE OR REPLACE VIEW vw_geo_hazard_latest AS
SELECT DISTINCT ON (geography_level, geoid, hazard_key)
  geography_level,
  geoid,
  hazard_key,
  period_start,
  period_grain,
  value,
  units,
  source_name,
  source_url,
  dataset_vintage,
  provenance,
  pulled_at
FROM fact_geo_hazard_context
ORDER BY geography_level, geoid, hazard_key, period_start DESC, pulled_at DESC;

CREATE OR REPLACE VIEW vw_pipeline_property_geo_context AS
SELECT
  d.env_id,
  d.deal_id,
  p.property_id,
  p.canonical_property_id,
  p.property_name,
  p.address,
  p.city,
  p.state,
  p.lat,
  p.lon,
  p.county_geoid,
  p.tract_geoid,
  p.block_group_geoid,
  d.deal_name,
  d.status,
  d.strategy,
  d.property_type,
  d.headline_price,
  d.target_irr,
  d.target_moic,
  d.updated_at
FROM re_pipeline_property p
JOIN re_pipeline_deal d ON d.deal_id = p.deal_id;

CREATE OR REPLACE VIEW vw_asset_market_context_latest AS
SELECT DISTINCT ON (property_id)
  context_id,
  env_id,
  deal_id,
  property_id,
  canonical_property_id,
  county_geoid,
  tract_geoid,
  block_group_geoid,
  cbsa_code,
  lat,
  lon,
  market_metrics_json,
  hazard_metrics_json,
  benchmark_json,
  fit_json,
  commentary_seed_json,
  metrics_vintage,
  computed_at
FROM fact_asset_market_context
ORDER BY property_id, computed_at DESC;
