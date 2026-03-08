-- Migration 019: Geo market intelligence catalog seeds

INSERT INTO dim_geo_metric_catalog (
  metric_key, display_name, description, category, units, geography_levels,
  compare_modes, color_scale, source_name, source_url
)
VALUES
  ('median_hh_income', 'Median Household Income', 'ACS household income benchmark.', 'demographics', 'USD', '["county","tract","block_group"]', '["tract","county","metro"]', 'green_sequential', 'ACS 5-Year', 'https://data.census.gov'),
  ('median_age', 'Median Age', 'Median age of residents.', 'demographics', 'years', '["county","tract","block_group"]', '["tract","county","metro"]', 'purple_sequential', 'ACS 5-Year', 'https://data.census.gov'),
  ('population', 'Population', 'Total population.', 'demographics', 'people', '["county","tract","block_group"]', '["tract","county","metro"]', 'blue_sequential', 'ACS 5-Year', 'https://data.census.gov'),
  ('renter_share', 'Renter Share', 'Renter occupied share of occupied units.', 'housing', '%', '["county","tract","block_group"]', '["tract","county","metro"]', 'orange_sequential', 'ACS 5-Year', 'https://data.census.gov'),
  ('vacancy_rate', 'Vacancy', 'Vacant unit share.', 'housing', '%', '["county","tract","block_group"]', '["tract","county","metro"]', 'red_sequential', 'ACS 5-Year', 'https://data.census.gov'),
  ('median_gross_rent', 'Median Gross Rent', 'Median gross rent proxy.', 'housing', 'USD', '["county","tract","block_group"]', '["tract","county","metro"]', 'orange_sequential', 'ACS 5-Year', 'https://data.census.gov'),
  ('median_home_value', 'Median Home Value', 'Median owner home value proxy.', 'housing', 'USD', '["county","tract","block_group"]', '["tract","county","metro"]', 'blue_sequential', 'ACS 5-Year', 'https://data.census.gov'),
  ('mobility_proxy', 'Mobility / Migration Proxy', 'Recent mover share proxy.', 'mobility', '%', '["county","tract","block_group"]', '["tract","county","metro"]', 'purple_sequential', 'ACS 5-Year', 'https://data.census.gov'),
  ('hazard_flood_risk', 'Hazard / Flood Risk', 'Flood exposure or hazard proxy.', 'hazard', 'index', '["county","tract","block_group"]', '["tract","county","metro"]', 'red_sequential', 'FEMA', 'https://www.fema.gov'),
  ('labor_context', 'Labor / Economic Context', 'Employment and wage context composite.', 'economy', 'index', '["county","tract","block_group"]', '["tract","county","metro"]', 'blue_sequential', 'BLS / BEA', 'https://www.bls.gov')
ON CONFLICT (metric_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    units = EXCLUDED.units,
    geography_levels = EXCLUDED.geography_levels,
    compare_modes = EXCLUDED.compare_modes,
    color_scale = EXCLUDED.color_scale,
    source_name = EXCLUDED.source_name,
    source_url = EXCLUDED.source_url,
    is_active = true,
    updated_at = now();
