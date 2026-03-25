ALTER TABLE IF EXISTS fact_asset_market_context
  ADD COLUMN IF NOT EXISTS geo_risk_score numeric(5,2);

CREATE INDEX IF NOT EXISTS fact_asset_market_context_geo_risk_score_idx
  ON fact_asset_market_context (geo_risk_score);

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
  geo_risk_score,
  metrics_vintage,
  computed_at
FROM fact_asset_market_context
ORDER BY property_id, computed_at DESC;
