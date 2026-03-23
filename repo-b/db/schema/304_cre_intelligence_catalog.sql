-- 304_cre_intelligence_catalog.sql
-- Seed sources, metrics, feature sets, model versions, and default question templates.

INSERT INTO cre_source_registry (
  source_key, display_name, source_type, license_class, allows_robotic_access,
  respect_robots_txt, rate_limit_per_minute, source_url, default_scope, metadata_json
)
VALUES
  (
    'tiger_geography',
    'US Census TIGER/Line',
    'geography',
    'public',
    true,
    true,
    30,
    'https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html',
    '{"scope":"national"}'::jsonb,
    '{"vintage":2025,"notes":"Use GEOID as canonical geography key."}'::jsonb
  ),
  (
    'acs_5y',
    'ACS 5-Year',
    'macro',
    'public',
    true,
    true,
    60,
    'https://api.census.gov/data.html',
    '{"scope":"metro","metro":"33100"}'::jsonb,
    '{"refresh_cadence":"annual"}'::jsonb
  ),
  (
    'bls_labor',
    'BLS Labor Series',
    'macro',
    'public',
    true,
    true,
    60,
    'https://download.bls.gov/pub/time.series/',
    '{"scope":"metro","metro":"33100"}'::jsonb,
    '{"refresh_cadence":"monthly"}'::jsonb
  ),
  (
    'hud_fmr',
    'HUD Fair Market Rent',
    'housing',
    'public',
    true,
    true,
    20,
    'https://www.huduser.gov/portal/datasets/fmr.html',
    '{"scope":"metro","metro":"33100"}'::jsonb,
    '{"refresh_cadence":"annual"}'::jsonb
  ),
  (
    'hud_usps_crosswalk',
    'HUD USPS ZIP Crosswalk',
    'crosswalk',
    'public',
    true,
    true,
    20,
    'https://www.huduser.gov/portal/datasets/usps_crosswalk.html',
    '{"scope":"metro","metro":"33100"}'::jsonb,
    '{"refresh_cadence":"quarterly"}'::jsonb
  ),
  (
    'noaa_storm_events',
    'NOAA Storm Events',
    'hazard',
    'public',
    true,
    true,
    30,
    'https://www.ncei.noaa.gov/stormevents/',
    '{"scope":"state","state":"FL"}'::jsonb,
    '{"refresh_cadence":"monthly"}'::jsonb
  ),
  (
    'kalshi_markets',
    'Kalshi Market Data',
    'market_signal',
    'public',
    true,
    true,
    30,
    'https://kalshi.com/docs/api',
    '{"scope":"national"}'::jsonb,
    '{"read_only":true,"stores_trading_data":false}'::jsonb
  )
ON CONFLICT (source_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
    updated_at = now();

INSERT INTO cre_metric_catalog (metric_key, label, metric_scope, units, description)
VALUES
  ('median_income', 'Median Household Income', 'tract', 'USD', 'ACS 5-year median household income'),
  ('population', 'Population', 'tract', 'people', 'ACS 5-year population'),
  ('rent_burden_proxy', 'Rent Burden Proxy', 'tract', 'ratio', 'Modeled rent burden using ACS public inputs'),
  ('median_rent', 'Median Gross Rent', 'tract', 'USD', 'ACS 5-year median gross rent'),
  ('unemployment_rate', 'Unemployment Rate', 'cbsa', 'pct', 'BLS metro unemployment rate'),
  ('employment_level', 'Employment Level', 'cbsa', 'people', 'BLS employment level'),
  ('fair_market_rent', 'Fair Market Rent', 'cbsa', 'USD', 'HUD FMR'),
  ('storm_event_count', 'Storm Event Count', 'county', 'count', 'NOAA storm events trailing 12 months'),
  ('severe_event_index', 'Severe Event Index', 'county', 'index', 'Weighted NOAA hazard severity index'),
  ('noi_actual', 'NOI Actual', 'property', 'USD', 'Observed property NOI'),
  ('noi_proxy', 'NOI Proxy', 'property', 'USD', 'Modeled NOI proxy'),
  ('rent_growth_next_12m', 'Rent Growth Next 12M', 'forecast', 'pct', 'Forecast target'),
  ('vacancy_change_next_12m', 'Vacancy Change Next 12M', 'forecast', 'pct', 'Forecast target'),
  ('value_change_proxy_next_12m', 'Value Change Proxy Next 12M', 'forecast', 'pct', 'Forecast target'),
  ('refi_risk_score', 'Refi Risk Score', 'forecast', 'score', 'Forecast target'),
  ('distress_probability', 'Distress Probability', 'forecast', 'probability', 'Forecast target')
ON CONFLICT (metric_key) DO NOTHING;

INSERT INTO cre_feature_set_catalog (version, label, description, target_metro)
VALUES
  (
    'miami_mvp_v1',
    'Miami MVP v1',
    'Versioned feature set for the Miami CRE intelligence launch slice.',
    'Miami-Fort Lauderdale-West Palm Beach, FL'
  )
ON CONFLICT (version) DO NOTHING;

INSERT INTO cre_model_catalog (model_version, model_family, label, metadata_json)
VALUES
  ('elastic_net_seed_v1', 'elastic_net', 'Elastic Net Seed v1', '{"deterministic_seeded":true}'::jsonb),
  ('hist_gradient_seed_v1', 'hist_gradient_boosting', 'Hist Gradient Seed v1', '{"deterministic_seeded":true}'::jsonb),
  ('ensemble_seed_v1', 'weighted_ensemble', 'Weighted Ensemble Seed v1', '{"uses_brier_weights":true}'::jsonb)
ON CONFLICT (model_version) DO NOTHING;

INSERT INTO cre_forecast_question_template (
  template_key, text_template, scope, resolution_criteria, resolution_source
)
VALUES
  (
    'fed_above_threshold',
    'Will Fed Funds be above {threshold} by {event_date}?',
    'macro',
    'Resolved using the effective Fed Funds target published by the Federal Reserve on the event date.',
    'Federal Reserve'
  ),
  (
    'miami_unemployment_above_threshold',
    'Will Miami metro unemployment exceed {threshold}% by {event_date}?',
    'macro',
    'Resolved using BLS metro unemployment data for CBSA 33100.',
    'BLS'
  ),
  (
    'fl_hurricane_landfall',
    'Will a hurricane of category {threshold}+ make landfall in Florida by {event_date}?',
    'hazard',
    'Resolved using NOAA/NHC public event data for the event window.',
    'NOAA'
  ),
  (
    'cre_delinquency_above_threshold',
    'Will the public CRE delinquency proxy exceed {threshold} by {event_date}?',
    'credit',
    'Resolved using the configured public delinquency proxy series.',
    'Internal public proxy'
  )
ON CONFLICT (template_key) DO NOTHING;

