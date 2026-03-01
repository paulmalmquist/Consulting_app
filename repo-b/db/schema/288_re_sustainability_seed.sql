-- 288_re_sustainability_seed.sql
-- Seed sustainability demo data for the Meridian institutional REPE dataset.

-- ── Reference Data ──────────────────────────────────────────────────────────

INSERT INTO sus_emission_factor_set (
  factor_set_id, source_name, version_label, methodology, published_at, effective_from
) VALUES
  ('28700000-0000-0000-0000-000000000001', 'EPA eGRID', '2025.1', 'US grid average factors', '2025-01-15T00:00:00Z', '2025-01-01'),
  ('28700000-0000-0000-0000-000000000002', 'IEA', '2025.1', 'Generic international factors', '2025-01-20T00:00:00Z', '2025-01-01'),
  ('28700000-0000-0000-0000-000000000003', 'DEFRA', '2025.1', 'UK/International disclosure factors', '2025-01-31T00:00:00Z', '2025-01-01')
ON CONFLICT (source_name, version_label) DO NOTHING;

INSERT INTO sus_emission_factor (
  emission_factor_id, factor_set_id, utility_type, region_code, country_code, factor_unit,
  location_based_factor, market_based_factor, rec_adjustment_factor, year
) VALUES
  ('28710000-0000-0000-0000-000000000001', '28700000-0000-0000-0000-000000000001', 'electric', 'ERCOT', 'US', 'tons_per_kwh', 0.000370000000, 0.000280000000, 0.000050000000, 2025),
  ('28710000-0000-0000-0000-000000000002', '28700000-0000-0000-0000-000000000001', 'gas',      'US',    'US', 'tons_per_therm', 0.005300000000, 0.005300000000, 0.000000000000, 2025),
  ('28710000-0000-0000-0000-000000000003', '28700000-0000-0000-0000-000000000002', 'electric', 'INTL',  'INTL', 'tons_per_kwh', 0.000410000000, 0.000350000000, 0.000040000000, 2025),
  ('28710000-0000-0000-0000-000000000004', '28700000-0000-0000-0000-000000000003', 'electric', 'UK',    'GB', 'tons_per_kwh', 0.000220000000, 0.000180000000, 0.000030000000, 2025)
ON CONFLICT DO NOTHING;

INSERT INTO sus_regulation_catalog (
  regulation_id, regulation_key, regulation_name, jurisdiction, region_code, compliance_basis,
  default_target_year, default_penalty_basis, description
) VALUES
  ('28720000-0000-0000-0000-000000000001', 'nyc_ll97', 'NYC Local Law 97', 'New York City', 'NYC', 'kgco2e_per_sf', 2030, 'annual_emissions_penalty', 'NYC carbon emissions cap and penalty framework.'),
  ('28720000-0000-0000-0000-000000000002', 'berdo', 'Boston BERDO', 'Boston', 'BOS', 'building_emissions_standard', 2030, 'annual_emissions_penalty', 'Boston emissions reduction ordinance.'),
  ('28720000-0000-0000-0000-000000000003', 'ca_title_24', 'California Title 24', 'California', 'CA', 'energy_code_compliance', 2028, 'upgrade_cost', 'California building efficiency code.'),
  ('28720000-0000-0000-0000-000000000004', 'eu_taxonomy', 'EU Taxonomy', 'European Union', 'EU', 'taxonomy_alignment', 2030, 'disclosure_risk', 'EU taxonomy screening criteria.')
ON CONFLICT (regulation_key) DO NOTHING;

-- ── Meridian Asset Profiles ────────────────────────────────────────────────

WITH meridian_assets AS (
  SELECT
    a.asset_id,
    a.name,
    pa.property_type,
    COALESCE(ebb.env_id::text, f.business_id::text) AS env_id,
    f.business_id,
    pa.gross_sf,
    pa.year_built
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN repe_fund f ON f.fund_id = d.fund_id
  LEFT JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
  WHERE f.business_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
)
INSERT INTO sus_asset_profile (
  asset_id, env_id, business_id, property_type, square_feet, year_built, last_renovation_year,
  hvac_type, primary_heating_fuel, primary_cooling_type, lighting_type, roof_type,
  onsite_generation, solar_kw_installed, battery_storage_kwh, ev_chargers_count,
  building_certification, energy_star_score, leed_level, wired_score, fitwel_score,
  last_audit_date, data_quality_status, last_calculated_at
)
SELECT
  m.asset_id,
  m.env_id,
  m.business_id,
  m.property_type,
  CASE
    WHEN m.name ILIKE '%Westgate Student Housing%' THEN NULL
    ELSE COALESCE(m.gross_sf, 185000)
  END AS square_feet,
  COALESCE(m.year_built, 1998),
  CASE
    WHEN m.name ILIKE '%Phoenix Gateway%' THEN 2022
    ELSE 2018
  END AS last_renovation_year,
  CASE
    WHEN m.name ILIKE '%Senior%' THEN 'central_plant'
    ELSE 'vrf'
  END AS hvac_type,
  CASE
    WHEN m.name ILIKE '%Phoenix Gateway%' THEN 'electric'
    ELSE 'natural_gas'
  END AS primary_heating_fuel,
  'electric_chiller' AS primary_cooling_type,
  'led' AS lighting_type,
  CASE
    WHEN m.name ILIKE '%Phoenix Gateway%' THEN 'cool_roof'
    ELSE 'tpo'
  END AS roof_type,
  (m.name ILIKE '%Meridian Park%') AS onsite_generation,
  CASE WHEN m.name ILIKE '%Meridian Park%' THEN 420 ELSE 0 END AS solar_kw_installed,
  CASE WHEN m.name ILIKE '%Meridian Park%' THEN 900 ELSE 0 END AS battery_storage_kwh,
  CASE WHEN m.name ILIKE '%Phoenix Gateway%' THEN 12 ELSE 4 END AS ev_chargers_count,
  CASE
    WHEN m.name ILIKE '%Phoenix Gateway%' THEN 'leed'
    WHEN m.name ILIKE '%Meridian Park%' THEN 'energy_star'
    ELSE 'none'
  END AS building_certification,
  CASE
    WHEN m.name ILIKE '%Ellipse Senior%' THEN 58
    WHEN m.name ILIKE '%Westgate Student Housing%' THEN 71
    ELSE 84
  END AS energy_star_score,
  CASE WHEN m.name ILIKE '%Phoenix Gateway%' THEN 'gold' ELSE NULL END AS leed_level,
  CASE WHEN m.name ILIKE '%Westgate Student Housing%' THEN 72 ELSE 80 END AS wired_score,
  CASE WHEN m.name ILIKE '%Ellipse Senior%' THEN 63 ELSE 78 END AS fitwel_score,
  DATE '2026-01-15' AS last_audit_date,
  CASE
    WHEN m.name ILIKE '%Westgate Student Housing%' THEN 'review'
    ELSE 'complete'
  END AS data_quality_status,
  TIMESTAMPTZ '2026-03-31 00:00:00+00' AS last_calculated_at
FROM meridian_assets m
ON CONFLICT (asset_id) DO NOTHING;

WITH meridian_assets AS (
  SELECT
    a.asset_id,
    a.name,
    COALESCE(ebb.env_id::text, f.business_id::text) AS env_id,
    f.business_id
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN repe_fund f ON f.fund_id = d.fund_id
  LEFT JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
  WHERE f.business_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
)
INSERT INTO sus_utility_account (
  utility_account_id, asset_id, env_id, business_id, utility_type,
  provider_name, account_number, meter_id, billing_frequency, rate_structure,
  demand_charge_applicable, is_active
)
SELECT
  ('28730000-0000-0000-0000-' || substr(replace(m.asset_id::text, '-', ''), 1, 12))::uuid,
  m.asset_id,
  m.env_id,
  m.business_id,
  'electric',
  CASE
    WHEN m.name ILIKE '%Phoenix%' THEN 'APS'
    WHEN m.name ILIKE '%Dallas%' OR m.name ILIKE '%Meridian Park%' OR m.name ILIKE '%Ellipse%' THEN 'Oncor'
    ELSE 'Utility Demo'
  END,
  'ELEC-' || substr(replace(m.asset_id::text, '-', ''), 1, 8),
  'MTR-' || substr(replace(m.asset_id::text, '-', ''), 9, 6),
  'monthly',
  CASE
    WHEN m.name ILIKE '%Phoenix Gateway%' THEN 'tou'
    ELSE 'blended'
  END,
  true,
  true
FROM meridian_assets m
ON CONFLICT DO NOTHING;

WITH meridian_accounts AS (
  SELECT
    ua.utility_account_id,
    ua.asset_id,
    ua.env_id,
    ua.business_id,
    a.name
  FROM sus_utility_account ua
  JOIN repe_asset a ON a.asset_id = ua.asset_id
  WHERE ua.business_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
    AND ua.utility_type = 'electric'
),
months AS (
  SELECT
    generate_series(DATE '2024-01-01', DATE '2025-12-01', INTERVAL '1 month')::date AS month_start
)
INSERT INTO sus_utility_monthly (
  asset_id, utility_account_id, env_id, business_id, utility_type, year, month,
  usage_kwh, usage_therms, usage_gallons, peak_kw, cost_total, demand_charges,
  supply_charges, taxes_fees, scope_1_emissions_tons, scope_2_emissions_tons,
  market_based_emissions, location_based_emissions, emission_factor_used, emission_factor_id,
  data_source, usage_kwh_equiv, renewable_pct, quality_status
)
SELECT
  ma.asset_id,
  ma.utility_account_id,
  ma.env_id,
  ma.business_id,
  'electric',
  EXTRACT(YEAR FROM m.month_start)::int,
  EXTRACT(MONTH FROM m.month_start)::int,
  CASE
    WHEN ma.name ILIKE '%Ellipse Senior%' THEN 148000 + (EXTRACT(MONTH FROM m.month_start)::int * 950)
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 192000 + (EXTRACT(MONTH FROM m.month_start)::int * 1100)
    WHEN ma.name ILIKE '%Westgate Student Housing%' THEN 162000 + (EXTRACT(MONTH FROM m.month_start)::int * 1250)
    ELSE 126000 + (EXTRACT(MONTH FROM m.month_start)::int * 800)
  END::numeric(18,6),
  NULL,
  NULL,
  CASE
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 640
    ELSE 410
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Ellipse Senior%' THEN 20500 + (EXTRACT(MONTH FROM m.month_start)::int * 75)
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 27400 + (EXTRACT(MONTH FROM m.month_start)::int * 88)
    WHEN ma.name ILIKE '%Westgate Student Housing%' THEN 23500 + (EXTRACT(MONTH FROM m.month_start)::int * 82)
    ELSE 16800 + (EXTRACT(MONTH FROM m.month_start)::int * 61)
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 5200
    ELSE 3100
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 19800
    ELSE 12900
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 2400
    ELSE 1500
  END::numeric(18,6),
  0,
  CASE
    WHEN ma.name ILIKE '%Ellipse Senior%' THEN 60 + (EXTRACT(MONTH FROM m.month_start)::int * 0.35)
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 83 + (EXTRACT(MONTH FROM m.month_start)::int * 0.40)
    WHEN ma.name ILIKE '%Westgate Student Housing%' THEN 76 + (EXTRACT(MONTH FROM m.month_start)::int * 0.38)
    ELSE 49 + (EXTRACT(MONTH FROM m.month_start)::int * 0.26)
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Meridian Park%' THEN 18 + (EXTRACT(MONTH FROM m.month_start)::int * 0.11)
    ELSE NULL
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Meridian Park%' THEN 18 + (EXTRACT(MONTH FROM m.month_start)::int * 0.11)
    ELSE NULL
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Ellipse Senior%' THEN 60 + (EXTRACT(MONTH FROM m.month_start)::int * 0.35)
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 83 + (EXTRACT(MONTH FROM m.month_start)::int * 0.40)
    WHEN ma.name ILIKE '%Westgate Student Housing%' THEN 76 + (EXTRACT(MONTH FROM m.month_start)::int * 0.38)
    ELSE 49 + (EXTRACT(MONTH FROM m.month_start)::int * 0.26)
  END::numeric(18,6),
  0.000370000000::numeric(18,12),
  '28710000-0000-0000-0000-000000000001'::uuid,
  'csv',
  CASE
    WHEN ma.name ILIKE '%Ellipse Senior%' THEN 148000 + (EXTRACT(MONTH FROM m.month_start)::int * 950)
    WHEN ma.name ILIKE '%Phoenix Gateway%' THEN 192000 + (EXTRACT(MONTH FROM m.month_start)::int * 1100)
    WHEN ma.name ILIKE '%Westgate Student Housing%' THEN 162000 + (EXTRACT(MONTH FROM m.month_start)::int * 1250)
    ELSE 126000 + (EXTRACT(MONTH FROM m.month_start)::int * 800)
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Meridian Park%' THEN 0.28
    ELSE 0.06
  END::numeric(18,6),
  CASE
    WHEN ma.name ILIKE '%Westgate Student Housing%' THEN 'review'
    ELSE 'complete'
  END
FROM meridian_accounts ma
CROSS JOIN months m
WHERE NOT EXISTS (
  SELECT 1
  FROM sus_utility_monthly existing
  WHERE existing.asset_id = ma.asset_id
    AND existing.utility_type = 'electric'
    AND existing.year = EXTRACT(YEAR FROM m.month_start)::int
    AND existing.month = EXTRACT(MONTH FROM m.month_start)::int
    AND existing.utility_account_id = ma.utility_account_id
);

WITH annual_base AS (
  SELECT
    a.asset_id,
    COALESCE(ebb.env_id::text, f.business_id::text) AS env_id,
    f.business_id
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN repe_fund f ON f.fund_id = d.fund_id
  LEFT JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
  WHERE f.business_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
)
INSERT INTO sus_waste_water (
  asset_id, env_id, business_id, year, waste_tons, waste_diverted_pct, water_gallons, recycled_water_pct
)
SELECT
  ab.asset_id,
  ab.env_id,
  ab.business_id,
  y.yr,
  CASE WHEN y.yr = 2024 THEN 122 ELSE 115 END::numeric(18,6),
  CASE WHEN y.yr = 2024 THEN 0.42 ELSE 0.47 END::numeric(18,6),
  CASE WHEN y.yr = 2024 THEN 9200000 ELSE 8710000 END::numeric(18,6),
  CASE WHEN y.yr = 2024 THEN 0.08 ELSE 0.12 END::numeric(18,6)
FROM annual_base ab
CROSS JOIN (VALUES (2024), (2025)) AS y(yr)
ON CONFLICT (asset_id, year) DO NOTHING;

INSERT INTO sus_asset_emissions_annual (
  asset_id, env_id, business_id, year, factor_set_id, scope_1, scope_2, scope_3,
  total_emissions, emissions_intensity_per_sf, emissions_intensity_per_revenue, source_hash
)
SELECT
  m.asset_id,
  m.env_id,
  m.business_id,
  yr.yr,
  '28700000-0000-0000-0000-000000000001'::uuid,
  CASE WHEN a.name ILIKE '%Meridian Park%' THEN 22 ELSE 0 END::numeric(18,6),
  CASE
    WHEN a.name ILIKE '%Ellipse Senior%' THEN 820
    WHEN a.name ILIKE '%Phoenix Gateway%' THEN 1120
    WHEN a.name ILIKE '%Westgate Student Housing%' THEN 980
    ELSE 640
  END::numeric(18,6),
  NULL,
  CASE
    WHEN a.name ILIKE '%Ellipse Senior%' THEN 842
    WHEN a.name ILIKE '%Phoenix Gateway%' THEN 1120
    WHEN a.name ILIKE '%Westgate Student Housing%' THEN 980
    ELSE 662
  END::numeric(18,6),
  CASE
    WHEN sp.square_feet IS NULL OR sp.square_feet = 0 THEN NULL
    ELSE (
      CASE
        WHEN a.name ILIKE '%Ellipse Senior%' THEN 842
        WHEN a.name ILIKE '%Phoenix Gateway%' THEN 1120
        WHEN a.name ILIKE '%Westgate Student Housing%' THEN 980
        ELSE 662
      END::numeric(18,6) / sp.square_feet
    )
  END,
  CASE
    WHEN a.name ILIKE '%Phoenix Gateway%' THEN 0.000312
    ELSE 0.000221
  END::numeric(18,12),
  md5(a.asset_id::text || '-' || yr.yr::text || '-seed')
FROM (
  SELECT
    a.asset_id,
    COALESCE(ebb.env_id::text, f.business_id::text) AS env_id,
    f.business_id
  FROM repe_asset a
  JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  JOIN repe_fund f ON f.fund_id = d.fund_id
  LEFT JOIN app.env_business_bindings ebb ON ebb.business_id = f.business_id
  WHERE f.business_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
) m
JOIN repe_asset a ON a.asset_id = m.asset_id
LEFT JOIN sus_asset_profile sp ON sp.asset_id = m.asset_id
CROSS JOIN (VALUES (2024), (2025)) AS yr(yr)
ON CONFLICT (asset_id, year, factor_set_id) DO NOTHING;

INSERT INTO sus_asset_certification (
  asset_certification_id, asset_id, env_id, business_id, certification_type, level, score,
  issued_on, expires_on, status
)
SELECT
  ('28740000-0000-0000-0000-' || substr(replace(a.asset_id::text, '-', ''), 1, 12))::uuid,
  a.asset_id,
  sp.env_id,
  sp.business_id,
  CASE
    WHEN a.name ILIKE '%Phoenix Gateway%' THEN 'LEED'
    ELSE 'ENERGY_STAR'
  END,
  CASE
    WHEN a.name ILIKE '%Phoenix Gateway%' THEN 'Gold'
    ELSE NULL
  END,
  CASE
    WHEN a.name ILIKE '%Phoenix Gateway%' THEN 72
    ELSE 84
  END::numeric(18,6),
  DATE '2025-06-01',
  DATE '2028-05-31',
  'active'
FROM repe_asset a
JOIN sus_asset_profile sp ON sp.asset_id = a.asset_id
WHERE a.name ILIKE '%Meridian Park%' OR a.name ILIKE '%Phoenix Gateway%'
ON CONFLICT DO NOTHING;

INSERT INTO sus_regulatory_exposure (
  asset_id, env_id, business_id, regulation_id, regulation_name, compliance_status,
  target_year, estimated_penalty, estimated_upgrade_cost, assessed_at, methodology_note
)
SELECT
  a.asset_id,
  sp.env_id,
  sp.business_id,
  CASE
    WHEN a.name ILIKE '%Phoenix Gateway%' THEN '28720000-0000-0000-0000-000000000003'::uuid
    ELSE '28720000-0000-0000-0000-000000000001'::uuid
  END,
  CASE
    WHEN a.name ILIKE '%Phoenix Gateway%' THEN 'California Title 24'
    ELSE 'NYC Local Law 97'
  END,
  CASE
    WHEN a.name ILIKE '%Ellipse Senior%' THEN 'non_compliant'
    WHEN a.name ILIKE '%Westgate Student Housing%' THEN 'at_risk'
    ELSE 'compliant'
  END,
  2030,
  CASE WHEN a.name ILIKE '%Ellipse Senior%' THEN 420000 ELSE 0 END::numeric(18,6),
  CASE
    WHEN a.name ILIKE '%Ellipse Senior%' THEN 2150000
    WHEN a.name ILIKE '%Westgate Student Housing%' THEN 780000
    ELSE 250000
  END::numeric(18,6),
  TIMESTAMPTZ '2026-03-31 00:00:00+00',
  'Seeded regulatory screening'
FROM repe_asset a
JOIN sus_asset_profile sp ON sp.asset_id = a.asset_id
WHERE a.name ILIKE '%Ellipse Senior%' OR a.name ILIKE '%Westgate Student Housing%' OR a.name ILIKE '%Phoenix Gateway%'
ON CONFLICT (asset_id, regulation_name, target_year) DO NOTHING;

INSERT INTO sus_decarbonization_project (
  project_id, asset_id, env_id, business_id, project_name, category, capex_amount,
  expected_energy_reduction_pct, expected_emissions_reduction_pct, expected_irr_impact,
  expected_payback_years, implementation_status, start_date, completion_date, priority
)
SELECT
  ('28750000-0000-0000-0000-' || substr(replace(a.asset_id::text, '-', ''), 1, 12))::uuid,
  a.asset_id,
  sp.env_id,
  sp.business_id,
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 'Solar + Battery Expansion'
    ELSE 'HVAC Controls Retrofit'
  END,
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 'solar'
    ELSE 'hvac_upgrade'
  END,
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 1850000
    ELSE 940000
  END::numeric(18,6),
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 0.18
    ELSE 0.11
  END::numeric(18,6),
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 0.24
    ELSE 0.14
  END::numeric(18,6),
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 0.0018
    ELSE 0.0011
  END::numeric(18,6),
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 6.5
    ELSE 4.2
  END::numeric(18,6),
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 'approved'
    ELSE 'planned'
  END,
  DATE '2026-04-01',
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN DATE '2026-11-30'
    ELSE DATE '2027-03-31'
  END,
  CASE
    WHEN a.name ILIKE '%Meridian Park%' THEN 'high'
    ELSE 'medium'
  END
FROM repe_asset a
JOIN sus_asset_profile sp ON sp.asset_id = a.asset_id
WHERE a.name ILIKE '%Meridian Park%' OR a.name ILIKE '%Phoenix Gateway%'
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO sus_data_quality_issue (
  env_id, business_id, asset_id, source_table, source_row_ref, severity, issue_code, message, blocked
)
SELECT
  sp.env_id,
  sp.business_id,
  sp.asset_id,
  'sus_asset_profile',
  sp.asset_id::text,
  'warning',
  'MISSING_SQUARE_FEET',
  'Square footage is missing; intensity metrics remain null until corrected.',
  false
FROM sus_asset_profile sp
JOIN repe_asset a ON a.asset_id = sp.asset_id
WHERE a.name ILIKE '%Westgate Student Housing%'
  AND NOT EXISTS (
    SELECT 1
    FROM sus_data_quality_issue q
    WHERE q.asset_id = sp.asset_id
      AND q.issue_code = 'MISSING_SQUARE_FEET'
      AND q.resolved_at IS NULL
  );

-- ── Sustainability Scenarios ───────────────────────────────────────────────

INSERT INTO re_scenario (fund_id, name, description, scenario_type, is_base, status)
SELECT
  f.fund_id,
  'Sustainability Base',
  'Baseline sustainability planning case',
  'custom',
  false,
  'active'
FROM repe_fund f
WHERE f.business_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
ON CONFLICT (fund_id, name) DO NOTHING;

INSERT INTO re_scenario (fund_id, name, description, scenario_type, is_base, status)
SELECT
  f.fund_id,
  'Sustainability Carbon Tax Stress',
  'Carbon-tax and utility inflation stress case',
  'stress',
  false,
  'active'
FROM repe_fund f
WHERE f.business_id = 'a1b2c3d4-0001-0001-0001-000000000001'::uuid
ON CONFLICT (fund_id, name) DO NOTHING;

INSERT INTO re_assumption_override (
  scenario_id, scope_node_type, scope_node_id, key, value_type, value_decimal, reason
)
SELECT
  s.scenario_id,
  'fund',
  s.fund_id,
  'sus.utility_inflation_rate',
  'decimal',
  0.020000000000,
  'Seeded sustainability baseline'
FROM re_scenario s
WHERE s.name = 'Sustainability Base'
  AND NOT EXISTS (
    SELECT 1
    FROM re_assumption_override o
    WHERE o.scenario_id = s.scenario_id
      AND o.scope_node_type = 'fund'
      AND o.scope_node_id = s.fund_id
      AND o.key = 'sus.utility_inflation_rate'
  );

INSERT INTO re_assumption_override (
  scenario_id, scope_node_type, scope_node_id, key, value_type, value_decimal, reason
)
SELECT
  s.scenario_id,
  'fund',
  s.fund_id,
  'sus.carbon_tax_per_ton',
  'decimal',
  85.000000000000,
  'Seeded carbon tax stress'
FROM re_scenario s
WHERE s.name = 'Sustainability Carbon Tax Stress'
  AND NOT EXISTS (
    SELECT 1
    FROM re_assumption_override o
    WHERE o.scenario_id = s.scenario_id
      AND o.scope_node_type = 'fund'
      AND o.scope_node_id = s.fund_id
      AND o.key = 'sus.carbon_tax_per_ton'
  );

INSERT INTO re_assumption_override (
  scenario_id, scope_node_type, scope_node_id, key, value_type, value_decimal, reason
)
SELECT
  s.scenario_id,
  'fund',
  s.fund_id,
  'sus.utility_inflation_rate',
  'decimal',
  0.070000000000,
  'Seeded carbon tax stress utility shock'
FROM re_scenario s
WHERE s.name = 'Sustainability Carbon Tax Stress'
  AND NOT EXISTS (
    SELECT 1
    FROM re_assumption_override o
    WHERE o.scenario_id = s.scenario_id
      AND o.scope_node_type = 'fund'
      AND o.scope_node_id = s.fund_id
      AND o.key = 'sus.utility_inflation_rate'
  );
