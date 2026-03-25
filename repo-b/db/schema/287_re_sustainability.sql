-- 287_re_sustainability.sql
-- Institutional REPE sustainability workspace schema.

-- ── Reference / Version Tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sus_emission_factor_set (
  factor_set_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name      text NOT NULL,
  version_label    text NOT NULL,
  methodology      text,
  published_at     timestamptz,
  effective_from   date,
  effective_to     date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_name, version_label)
);

CREATE TABLE IF NOT EXISTS sus_emission_factor (
  emission_factor_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_set_id           uuid NOT NULL REFERENCES sus_emission_factor_set(factor_set_id) ON DELETE CASCADE,
  utility_type            text NOT NULL CHECK (utility_type IN ('electric', 'gas', 'water', 'steam', 'district')),
  region_code             text,
  country_code            text,
  factor_unit             text NOT NULL DEFAULT 'tons_per_unit',
  location_based_factor   numeric(18,12) NOT NULL,
  market_based_factor     numeric(18,12),
  rec_adjustment_factor   numeric(18,12),
  year                    int NOT NULL CHECK (year >= 2000 AND year <= 2100),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sus_emission_factor_unique
  ON sus_emission_factor(factor_set_id, utility_type, COALESCE(region_code, ''), COALESCE(country_code, ''), year);

CREATE TABLE IF NOT EXISTS sus_regulation_catalog (
  regulation_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation_key          text NOT NULL UNIQUE,
  regulation_name         text NOT NULL UNIQUE,
  jurisdiction            text,
  region_code             text,
  compliance_basis        text,
  default_target_year     int,
  default_penalty_basis   text,
  description             text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sus_ingestion_run (
  ingestion_run_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            text NOT NULL,
  business_id       uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  source_type       text NOT NULL CHECK (source_type IN ('utility_csv', 'energy_star', 'utility_api', 'emission_factors', 'regulatory', 'manual')),
  connector_mode    text NOT NULL CHECK (connector_mode IN ('manual', 'mock', 'live')),
  filename          text,
  sha256            text,
  row_count         int NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  error_summary     text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Core Asset Tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sus_asset_profile (
  asset_id                  uuid PRIMARY KEY REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id                    text NOT NULL,
  business_id               uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  property_type             text,
  square_feet               numeric(18,4),
  year_built                int,
  last_renovation_year      int,
  hvac_type                 text,
  primary_heating_fuel      text,
  primary_cooling_type      text,
  lighting_type             text,
  roof_type                 text,
  onsite_generation         boolean NOT NULL DEFAULT false,
  solar_kw_installed        numeric(18,4),
  battery_storage_kwh       numeric(18,4),
  ev_chargers_count         int,
  building_certification    text,
  energy_star_score         numeric(10,4),
  leed_level                text,
  wired_score               numeric(10,4),
  fitwel_score              numeric(10,4),
  last_audit_date           date,
  data_quality_status       text NOT NULL DEFAULT 'review'
    CHECK (data_quality_status IN ('complete', 'review', 'blocked')),
  last_calculated_at        timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (square_feet IS NULL OR square_feet >= 0),
  CHECK (solar_kw_installed IS NULL OR solar_kw_installed >= 0),
  CHECK (battery_storage_kwh IS NULL OR battery_storage_kwh >= 0),
  CHECK (ev_chargers_count IS NULL OR ev_chargers_count >= 0),
  CHECK (energy_star_score IS NULL OR energy_star_score >= 0),
  CHECK (wired_score IS NULL OR wired_score >= 0),
  CHECK (fitwel_score IS NULL OR fitwel_score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sus_asset_profile_env_business
  ON sus_asset_profile(env_id, business_id, property_type);

CREATE TABLE IF NOT EXISTS sus_utility_account (
  utility_account_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                   uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id                     text NOT NULL,
  business_id                uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  utility_type               text NOT NULL CHECK (utility_type IN ('electric', 'gas', 'water', 'steam', 'district')),
  provider_name              text NOT NULL,
  account_number             text NOT NULL,
  meter_id                   text,
  billing_frequency          text,
  rate_structure             text,
  demand_charge_applicable   boolean NOT NULL DEFAULT false,
  is_active                  boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sus_utility_account_unique
  ON sus_utility_account(asset_id, utility_type, provider_name, account_number, COALESCE(meter_id, ''));

CREATE INDEX IF NOT EXISTS idx_sus_utility_account_asset
  ON sus_utility_account(asset_id, utility_type, is_active);

CREATE TABLE IF NOT EXISTS sus_utility_monthly (
  utility_monthly_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                   uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  utility_account_id         uuid REFERENCES sus_utility_account(utility_account_id) ON DELETE SET NULL,
  env_id                     text NOT NULL,
  business_id                uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  utility_type               text NOT NULL CHECK (utility_type IN ('electric', 'gas', 'water', 'steam', 'district')),
  year                       int NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month                      int NOT NULL CHECK (month >= 1 AND month <= 12),
  usage_kwh                  numeric(18,6),
  usage_therms               numeric(18,6),
  usage_gallons              numeric(18,6),
  peak_kw                    numeric(18,6),
  cost_total                 numeric(18,6),
  demand_charges             numeric(18,6),
  supply_charges             numeric(18,6),
  taxes_fees                 numeric(18,6),
  scope_1_emissions_tons     numeric(18,6),
  scope_2_emissions_tons     numeric(18,6),
  market_based_emissions     numeric(18,6),
  location_based_emissions   numeric(18,6),
  emission_factor_used       numeric(18,12),
  emission_factor_id         uuid REFERENCES sus_emission_factor(emission_factor_id) ON DELETE SET NULL,
  ingestion_run_id           uuid REFERENCES sus_ingestion_run(ingestion_run_id) ON DELETE SET NULL,
  data_source                text NOT NULL DEFAULT 'manual'
    CHECK (data_source IN ('manual', 'energy_star_api', 'utility_api', 'csv')),
  usage_kwh_equiv            numeric(18,6),
  renewable_pct              numeric(18,6),
  quality_status             text NOT NULL DEFAULT 'review'
    CHECK (quality_status IN ('complete', 'review', 'blocked')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (usage_kwh IS NULL OR usage_kwh >= 0),
  CHECK (usage_therms IS NULL OR usage_therms >= 0),
  CHECK (usage_gallons IS NULL OR usage_gallons >= 0),
  CHECK (peak_kw IS NULL OR peak_kw >= 0),
  CHECK (cost_total IS NULL OR cost_total >= 0),
  CHECK (demand_charges IS NULL OR demand_charges >= 0),
  CHECK (supply_charges IS NULL OR supply_charges >= 0),
  CHECK (taxes_fees IS NULL OR taxes_fees >= 0),
  CHECK (renewable_pct IS NULL OR (renewable_pct >= 0 AND renewable_pct <= 1.5))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sus_utility_monthly_unique
  ON sus_utility_monthly(asset_id, utility_type, year, month, COALESCE(utility_account_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_sus_utility_monthly_asset_period
  ON sus_utility_monthly(asset_id, year DESC, month DESC, utility_type);

CREATE TABLE IF NOT EXISTS sus_waste_water (
  waste_water_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id             uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id               text NOT NULL,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  year                 int NOT NULL CHECK (year >= 2000 AND year <= 2100),
  waste_tons           numeric(18,6),
  waste_diverted_pct   numeric(18,6),
  water_gallons        numeric(18,6),
  recycled_water_pct   numeric(18,6),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, year),
  CHECK (waste_tons IS NULL OR waste_tons >= 0),
  CHECK (waste_diverted_pct IS NULL OR (waste_diverted_pct >= 0 AND waste_diverted_pct <= 1)),
  CHECK (water_gallons IS NULL OR water_gallons >= 0),
  CHECK (recycled_water_pct IS NULL OR (recycled_water_pct >= 0 AND recycled_water_pct <= 1))
);

CREATE TABLE IF NOT EXISTS sus_asset_emissions_annual (
  asset_emissions_annual_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                          uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id                            text NOT NULL,
  business_id                       uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  year                              int NOT NULL CHECK (year >= 2000 AND year <= 2100),
  factor_set_id                     uuid NOT NULL REFERENCES sus_emission_factor_set(factor_set_id) ON DELETE RESTRICT,
  scope_1                           numeric(18,6),
  scope_2                           numeric(18,6),
  scope_3                           numeric(18,6),
  total_emissions                   numeric(18,6),
  emissions_intensity_per_sf        numeric(18,12),
  emissions_intensity_per_revenue   numeric(18,12),
  source_hash                       text,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, year, factor_set_id)
);

CREATE INDEX IF NOT EXISTS idx_sus_asset_emissions_annual_asset_year
  ON sus_asset_emissions_annual(asset_id, year DESC);

CREATE TABLE IF NOT EXISTS sus_decarbonization_project (
  project_id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                           uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id                             text NOT NULL,
  business_id                        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_name                       text NOT NULL,
  category                           text NOT NULL,
  capex_amount                       numeric(18,6),
  expected_energy_reduction_pct      numeric(18,6),
  expected_emissions_reduction_pct   numeric(18,6),
  expected_irr_impact                numeric(18,6),
  expected_payback_years             numeric(18,6),
  implementation_status              text NOT NULL DEFAULT 'planned'
    CHECK (implementation_status IN ('planned', 'approved', 'in_progress', 'completed', 'cancelled')),
  start_date                         date,
  completion_date                    date,
  priority                           text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  created_at                         timestamptz NOT NULL DEFAULT now(),
  CHECK (capex_amount IS NULL OR capex_amount >= 0),
  CHECK (expected_energy_reduction_pct IS NULL OR (expected_energy_reduction_pct >= 0 AND expected_energy_reduction_pct <= 1)),
  CHECK (expected_emissions_reduction_pct IS NULL OR (expected_emissions_reduction_pct >= 0 AND expected_emissions_reduction_pct <= 1)),
  CHECK (expected_payback_years IS NULL OR expected_payback_years >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sus_decarbonization_project_asset
  ON sus_decarbonization_project(asset_id, implementation_status, priority);

CREATE TABLE IF NOT EXISTS sus_asset_certification (
  asset_certification_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                 uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id                   text NOT NULL,
  business_id              uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  certification_type       text NOT NULL,
  level                    text,
  score                    numeric(18,6),
  issued_on                date,
  expires_on               date,
  status                   text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'pending', 'revoked')),
  evidence_document_id     uuid,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sus_asset_certification_unique
  ON sus_asset_certification(asset_id, certification_type, COALESCE(issued_on, DATE '1900-01-01'));

CREATE INDEX IF NOT EXISTS idx_sus_asset_certification_asset
  ON sus_asset_certification(asset_id, certification_type, status);

CREATE TABLE IF NOT EXISTS sus_regulatory_exposure (
  regulatory_exposure_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                 uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id                   text NOT NULL,
  business_id              uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  regulation_id            uuid REFERENCES sus_regulation_catalog(regulation_id) ON DELETE SET NULL,
  regulation_name          text NOT NULL,
  compliance_status        text NOT NULL
    CHECK (compliance_status IN ('compliant', 'monitor', 'at_risk', 'non_compliant', 'not_applicable')),
  target_year              int,
  estimated_penalty        numeric(18,6),
  estimated_upgrade_cost   numeric(18,6),
  assessed_at              timestamptz,
  methodology_note         text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, regulation_name, target_year),
  CHECK (estimated_penalty IS NULL OR estimated_penalty >= 0),
  CHECK (estimated_upgrade_cost IS NULL OR estimated_upgrade_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sus_regulatory_exposure_asset
  ON sus_regulatory_exposure(asset_id, compliance_status, target_year);

CREATE TABLE IF NOT EXISTS sus_data_quality_issue (
  data_quality_issue_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 text NOT NULL,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  asset_id               uuid REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  utility_monthly_id     uuid REFERENCES sus_utility_monthly(utility_monthly_id) ON DELETE CASCADE,
  source_table           text,
  source_row_ref         text,
  severity               text NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  issue_code             text NOT NULL,
  message                text NOT NULL,
  blocked                boolean NOT NULL DEFAULT false,
  detected_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sus_data_quality_issue_asset
  ON sus_data_quality_issue(asset_id, blocked, resolved_at);

-- ── Projection Tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sus_scenario_projection_run (
  projection_run_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              text NOT NULL,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  scenario_id         uuid NOT NULL REFERENCES re_scenario(scenario_id) ON DELETE CASCADE,
  fund_id             uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  base_quarter        text NOT NULL CHECK (base_quarter ~ '^\d{4}Q[1-4]$'),
  horizon_years       int NOT NULL DEFAULT 5 CHECK (horizon_years >= 1 AND horizon_years <= 20),
  inputs_hash         text,
  factor_set_id       uuid REFERENCES sus_emission_factor_set(factor_set_id) ON DELETE RESTRICT,
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  projection_mode     text NOT NULL DEFAULT 'base' CHECK (projection_mode IN ('base', 'carbon_tax', 'utility_shock', 'retrofit', 'solar', 'custom')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sus_projection_run_fund
  ON sus_scenario_projection_run(fund_id, scenario_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sus_asset_projection_year (
  asset_projection_year_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projection_run_id         uuid NOT NULL REFERENCES sus_scenario_projection_run(projection_run_id) ON DELETE CASCADE,
  asset_id                  uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id                    text NOT NULL,
  business_id               uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  projection_year           int NOT NULL CHECK (projection_year >= 2000 AND projection_year <= 2100),
  energy_kwh_equiv          numeric(18,6),
  emissions_total           numeric(18,6),
  utility_cost_total        numeric(18,6),
  carbon_penalty_total      numeric(18,6),
  regulatory_penalty_total  numeric(18,6),
  project_capex_total       numeric(18,6),
  noi_delta                 numeric(18,6),
  terminal_value_delta      numeric(18,6),
  data_quality_status       text NOT NULL DEFAULT 'review'
    CHECK (data_quality_status IN ('complete', 'review', 'blocked')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projection_run_id, asset_id, projection_year)
);

CREATE TABLE IF NOT EXISTS sus_investment_projection_year (
  investment_projection_year_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projection_run_id              uuid NOT NULL REFERENCES sus_scenario_projection_run(projection_run_id) ON DELETE CASCADE,
  investment_id                  uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  env_id                         text NOT NULL,
  business_id                    uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  projection_year                int NOT NULL CHECK (projection_year >= 2000 AND projection_year <= 2100),
  energy_kwh_equiv               numeric(18,6),
  emissions_total                numeric(18,6),
  utility_cost_total             numeric(18,6),
  carbon_penalty_total           numeric(18,6),
  regulatory_penalty_total       numeric(18,6),
  project_capex_total            numeric(18,6),
  noi_delta                      numeric(18,6),
  projected_nav_delta            numeric(18,6),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projection_run_id, investment_id, projection_year)
);

CREATE TABLE IF NOT EXISTS sus_fund_projection_year (
  fund_projection_year_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projection_run_id         uuid NOT NULL REFERENCES sus_scenario_projection_run(projection_run_id) ON DELETE CASCADE,
  fund_id                   uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  env_id                    text NOT NULL,
  business_id               uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  projection_year           int NOT NULL CHECK (projection_year >= 2000 AND projection_year <= 2100),
  energy_kwh_equiv          numeric(18,6),
  emissions_total           numeric(18,6),
  utility_cost_total        numeric(18,6),
  carbon_penalty_total      numeric(18,6),
  regulatory_penalty_total  numeric(18,6),
  project_capex_total       numeric(18,6),
  noi_delta                 numeric(18,6),
  projected_fund_irr        numeric(18,12),
  projected_lp_net_irr      numeric(18,12),
  projected_carry           numeric(18,6),
  carbon_budget_delta       numeric(18,6),
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (projection_run_id, fund_id, projection_year)
);

-- ── Derived Views ───────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW sus_utility_monthly_latest_v AS
SELECT
  ranked.asset_id,
  ranked.utility_type,
  ranked.utility_account_id,
  ranked.env_id,
  ranked.business_id,
  ranked.year,
  ranked.month,
  ranked.usage_kwh,
  ranked.usage_therms,
  ranked.usage_gallons,
  ranked.peak_kw,
  ranked.cost_total,
  ranked.usage_kwh_equiv,
  ranked.renewable_pct,
  ranked.quality_status,
  ranked.created_at
FROM (
  SELECT
    m.*,
    row_number() OVER (
      PARTITION BY m.asset_id, m.utility_type
      ORDER BY m.year DESC, m.month DESC, m.created_at DESC
    ) AS rn
  FROM sus_utility_monthly m
) ranked
WHERE ranked.rn = 1;

CREATE OR REPLACE VIEW sus_asset_footprint_annual_v AS
WITH utility_rollup AS (
  SELECT
    m.asset_id,
    m.env_id,
    m.business_id,
    m.year,
    sum(COALESCE(m.usage_kwh_equiv, 0)) AS energy_kwh_equiv,
    sum(COALESCE(m.cost_total, 0)) AS utility_cost_total,
    avg(m.renewable_pct) FILTER (WHERE m.renewable_pct IS NOT NULL) AS renewable_pct
  FROM sus_utility_monthly m
  GROUP BY m.asset_id, m.env_id, m.business_id, m.year
),
historical AS (
  SELECT
    e.asset_id,
    e.env_id,
    e.business_id,
    d.deal_id AS investment_id,
    d.fund_id,
    e.year,
    NULL::uuid AS scenario_id,
    COALESCE(u.energy_kwh_equiv, 0) AS energy_kwh_equiv,
    COALESCE(e.total_emissions, 0) AS total_emissions,
    COALESCE(e.scope_1, 0) AS scope_1,
    COALESCE(e.scope_2, 0) AS scope_2,
    COALESCE(e.scope_3, 0) AS scope_3,
    u.utility_cost_total,
    u.renewable_pct,
    e.emissions_intensity_per_sf,
    p.square_feet,
    p.data_quality_status,
    p.last_calculated_at,
    'historical'::text AS row_type
  FROM sus_asset_emissions_annual e
  JOIN repe_asset a ON a.asset_id = e.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  LEFT JOIN sus_asset_profile p ON p.asset_id = e.asset_id
  LEFT JOIN utility_rollup u
    ON u.asset_id = e.asset_id
   AND u.env_id = e.env_id
   AND u.business_id = e.business_id
   AND u.year = e.year
),
projected AS (
  SELECT
    ap.asset_id,
    ap.env_id,
    ap.business_id,
    d.deal_id AS investment_id,
    d.fund_id,
    ap.projection_year AS year,
    pr.scenario_id,
    COALESCE(ap.energy_kwh_equiv, 0) AS energy_kwh_equiv,
    COALESCE(ap.emissions_total, 0) AS total_emissions,
    NULL::numeric(18,6) AS scope_1,
    NULL::numeric(18,6) AS scope_2,
    NULL::numeric(18,6) AS scope_3,
    ap.utility_cost_total,
    NULL::numeric(18,6) AS renewable_pct,
    CASE
      WHEN p.square_feet IS NULL OR p.square_feet = 0 OR ap.emissions_total IS NULL THEN NULL
      ELSE ap.emissions_total / p.square_feet
    END AS emissions_intensity_per_sf,
    p.square_feet,
    ap.data_quality_status,
    pr.created_at AS last_calculated_at,
    'projection'::text AS row_type
  FROM sus_asset_projection_year ap
  JOIN sus_scenario_projection_run pr ON pr.projection_run_id = ap.projection_run_id
  JOIN repe_asset a ON a.asset_id = ap.asset_id
  JOIN repe_deal d ON d.deal_id = a.deal_id
  LEFT JOIN sus_asset_profile p ON p.asset_id = ap.asset_id
)
SELECT * FROM historical
UNION ALL
SELECT * FROM projected;

CREATE OR REPLACE VIEW sus_portfolio_footprint_v AS
SELECT
  f.env_id,
  f.business_id,
  f.fund_id,
  f.investment_id,
  f.year,
  f.scenario_id,
  count(*) AS asset_count,
  count(*) FILTER (WHERE f.data_quality_status = 'complete') AS complete_asset_count,
  sum(COALESCE(f.energy_kwh_equiv, 0)) AS total_energy_kwh_equiv,
  sum(COALESCE(f.total_emissions, 0)) AS total_emissions,
  sum(COALESCE(f.utility_cost_total, 0)) AS total_utility_cost,
  avg(f.renewable_pct) FILTER (WHERE f.renewable_pct IS NOT NULL) AS renewable_pct,
  CASE
    WHEN sum(COALESCE(f.square_feet, 0)) = 0 THEN NULL
    ELSE sum(COALESCE(f.total_emissions, 0)) / NULLIF(sum(COALESCE(f.square_feet, 0)), 0)
  END AS emissions_intensity_per_sf,
  max(f.last_calculated_at) AS last_calculated_at
FROM sus_asset_footprint_annual_v f
GROUP BY f.env_id, f.business_id, f.fund_id, f.investment_id, f.year, f.scenario_id;
