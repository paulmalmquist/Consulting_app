-- 619_sus_metric_registry_seed.sql
--
-- T6 of plan 0018 (Sustainability Tool). Registers the v1 governed
-- sustainability metrics in the unified metric registry so the AI copilot can
-- name them, ground on them, and fail closed on missing values.
--
-- The unified registry (``backend/app/services/unified_metric_registry.py``)
-- is DB-driven: it reads active rows from ``semantic_metric_def`` at startup.
-- Every seeded row here routes with ``query_strategy = 'service'`` +
-- ``service_function = 'sustainability_authoritative'`` so values are served
-- through the T4 authoritative reader
-- (``backend/app/services/re_sustainability_authoritative.py``) rather than
-- raw SQL. ``sql_template`` is NOT NULL on the table, so we store a comment
-- placeholder that documents the routing.
--
-- Additive only. Uses ``ON CONFLICT (business_id, metric_key, version) DO
-- NOTHING`` on the table's unique key so re-application is safe.
--
-- Depends on: 340_semantic_catalog.sql, 447_metric_routing_metadata.sql,
-- 618_sus_authoritative.sql.

INSERT INTO semantic_metric_def (
  business_id, metric_key, display_name, description, sql_template,
  unit, aggregation, entity_key,
  query_strategy, service_function, metric_family, time_behavior,
  polarity, format_hint_fe, aliases, allowed_breakouts
) VALUES
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'scope1_tco2e',
    'Scope 1 Emissions (tCO2e)',
    'Direct greenhouse gas emissions from owned/controlled sources, in tonnes of CO2 equivalent.',
    '-- served via sustainability_authoritative reader',
    'tco2e', 'sum', 'asset',
    'service', 'sustainability_authoritative', 'sustainability', 'additive_period',
    'down_good', 'number',
    '{"scope 1", "scope one", "scope 1 emissions", "direct emissions", "scope 1 tco2e", "scope1", "scope1 emissions"}',
    '{fund, asset, market, property_type, quarter}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'scope2_location_tco2e',
    'Scope 2 Emissions, Location-Based (tCO2e)',
    'Indirect emissions from purchased energy under the location-based method, in tonnes of CO2 equivalent.',
    '-- served via sustainability_authoritative reader',
    'tco2e', 'sum', 'asset',
    'service', 'sustainability_authoritative', 'sustainability', 'additive_period',
    'down_good', 'number',
    '{"scope 2 location", "scope 2 location-based", "location-based emissions", "scope 2 location tco2e", "scope2 location"}',
    '{fund, asset, market, property_type, quarter}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'scope2_market_tco2e',
    'Scope 2 Emissions, Market-Based (tCO2e)',
    'Indirect emissions from purchased energy under the market-based method, in tonnes of CO2 equivalent.',
    '-- served via sustainability_authoritative reader',
    'tco2e', 'sum', 'asset',
    'service', 'sustainability_authoritative', 'sustainability', 'additive_period',
    'down_good', 'number',
    '{"scope 2 market", "scope 2 market-based", "market-based emissions", "scope 2 market tco2e", "scope2 market"}',
    '{fund, asset, market, property_type, quarter}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'scope3_tco2e',
    'Scope 3 Emissions (tCO2e)',
    'Value-chain (indirect) emissions across upstream and downstream categories, in tonnes of CO2 equivalent.',
    '-- served via sustainability_authoritative reader',
    'tco2e', 'sum', 'asset',
    'service', 'sustainability_authoritative', 'sustainability', 'additive_period',
    'down_good', 'number',
    '{"scope 3", "scope three", "scope 3 emissions", "value chain emissions", "scope 3 tco2e", "scope3"}',
    '{fund, asset, market, property_type, quarter}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'energy_intensity_kwh_per_sqft',
    'Energy Intensity (kWh/sqft)',
    'Energy use per rentable square foot, in kilowatt-hours per square foot.',
    '-- served via sustainability_authoritative reader',
    'kwh_per_sqft', 'avg', 'asset',
    'service', 'sustainability_authoritative', 'sustainability', 'point_in_time',
    'down_good', 'number',
    '{"energy intensity", "eui", "energy use intensity", "kwh per sqft", "kwh/sqft"}',
    '{fund, asset, market, property_type, quarter}'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001', 'water_intensity_gal_per_sqft',
    'Water Intensity (gal/sqft)',
    'Water use per rentable square foot, in gallons per square foot.',
    '-- served via sustainability_authoritative reader',
    'gal_per_sqft', 'avg', 'asset',
    'service', 'sustainability_authoritative', 'sustainability', 'point_in_time',
    'down_good', 'number',
    '{"water intensity", "wui", "water use intensity", "gallons per sqft", "gal/sqft"}',
    '{fund, asset, market, property_type, quarter}'
  )
ON CONFLICT (business_id, metric_key, version) DO NOTHING;
