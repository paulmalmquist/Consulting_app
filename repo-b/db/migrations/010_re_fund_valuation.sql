-- Migration 010: Real Estate Fund Valuation Engine — Phase 0-2 Foundation Tables
-- Builds ON TOP of existing fin_* tables (fin_entity, fin_participant, fin_fund, fin_asset_investment, etc.)
-- All new tables use re_ prefix to distinguish from generic fin_ infrastructure.
-- All rows are append-only; no UPDATE or DELETE on snapshot/state tables.

BEGIN;

-- ============================================================
-- PHASE 0: Valuation Core
-- ============================================================

-- Quarterly operating data input per asset (raw actuals or projections)
CREATE TABLE IF NOT EXISTS re_asset_quarterly_financials (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    quarter                 text NOT NULL,  -- e.g. '2024Q1'
    gross_potential_rent     numeric(18,2) NOT NULL DEFAULT 0,
    vacancy_loss            numeric(18,2) NOT NULL DEFAULT 0,
    effective_gross_income   numeric(18,2) NOT NULL DEFAULT 0,
    operating_expenses      numeric(18,2) NOT NULL DEFAULT 0,
    net_operating_income    numeric(18,2) NOT NULL DEFAULT 0,
    occupancy_pct           numeric(5,4),           -- e.g. 0.9350
    capex                   numeric(18,2) NOT NULL DEFAULT 0,
    other_income            numeric(18,2) NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (fin_asset_investment_id, quarter)
);

-- Loan details per asset
CREATE TABLE IF NOT EXISTS re_loan (
    re_loan_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    lender                  text,
    original_balance        numeric(18,2) NOT NULL,
    current_balance         numeric(18,2) NOT NULL,
    interest_rate           numeric(8,6) NOT NULL,  -- e.g. 0.045000
    amortization_years      int,
    term_years              int,
    maturity_date           date,
    io_period_months        int NOT NULL DEFAULT 0,
    loan_type               text NOT NULL DEFAULT 'fixed',  -- fixed, floating, hybrid
    annual_debt_service     numeric(18,2),
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- Loan amortization schedule rows (precomputed or generated)
CREATE TABLE IF NOT EXISTS re_loan_amortization (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    re_loan_id              uuid NOT NULL REFERENCES re_loan(re_loan_id),
    period_number           int NOT NULL,
    period_date             date NOT NULL,
    beginning_balance       numeric(18,2) NOT NULL,
    scheduled_principal     numeric(18,2) NOT NULL,
    interest_payment        numeric(18,2) NOT NULL,
    total_payment           numeric(18,2) NOT NULL,
    ending_balance          numeric(18,2) NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (re_loan_id, period_number)
);

-- Versioned assumption sets (append-only, never updated)
CREATE TABLE IF NOT EXISTS re_valuation_assumption_set (
    assumption_set_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid,
    business_id             uuid,
    version_number          int NOT NULL DEFAULT 1,
    created_by              text,
    approved_by             text,
    approved_at             timestamptz,
    rationale               text,
    -- Core assumptions
    cap_rate                numeric(8,6) NOT NULL,      -- e.g. 0.055000
    exit_cap_rate           numeric(8,6) NOT NULL,
    discount_rate           numeric(8,6) NOT NULL,
    rent_growth             numeric(8,6) NOT NULL DEFAULT 0.02,
    expense_growth          numeric(8,6) NOT NULL DEFAULT 0.03,
    vacancy_assumption      numeric(8,6) NOT NULL DEFAULT 0.05,
    sale_costs_pct          numeric(8,6) NOT NULL DEFAULT 0.02,
    capex_reserve_pct       numeric(8,6) NOT NULL DEFAULT 0,
    -- Method weighting
    weight_direct_cap       numeric(5,4) NOT NULL DEFAULT 1.0,
    weight_dcf              numeric(5,4) NOT NULL DEFAULT 0.0,
    -- Overrides / custom fields
    custom_assumptions_json jsonb,
    -- Full serialized export for reproducibility
    serialized_json         jsonb NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- Immutable valuation snapshots (append-only, one per run)
CREATE TABLE IF NOT EXISTS re_valuation_snapshot (
    valuation_snapshot_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    quarter                 text NOT NULL,
    assumption_set_id       uuid NOT NULL REFERENCES re_valuation_assumption_set(assumption_set_id),
    method_used             text NOT NULL,  -- 'direct_cap', 'dcf', 'blended'
    implied_value_cap       numeric(18,2),
    implied_value_dcf       numeric(18,2),
    implied_value_blended   numeric(18,2) NOT NULL,
    implied_equity_value    numeric(18,2) NOT NULL,
    nav_equity              numeric(18,2) NOT NULL,
    unrealized_gain         numeric(18,2),
    irr_to_date             numeric(10,6),
    sensitivities_json      jsonb,
    input_hash              text NOT NULL,   -- sha256 of normalized inputs
    code_version            text,            -- git commit hash
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- Canonical quarterly financial state per asset (immutable, the single source of truth)
CREATE TABLE IF NOT EXISTS re_asset_financial_state (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    fin_fund_id             uuid REFERENCES fin_fund(fin_fund_id),
    quarter                 text NOT NULL,
    valuation_snapshot_id   uuid NOT NULL REFERENCES re_valuation_snapshot(valuation_snapshot_id),
    -- Operating metrics
    trailing_noi            numeric(18,2),
    forward_12_noi          numeric(18,2),
    gross_potential_rent     numeric(18,2),
    vacancy_loss            numeric(18,2),
    effective_gross_income   numeric(18,2),
    operating_expenses      numeric(18,2),
    net_operating_income    numeric(18,2),
    -- Debt metrics
    loan_balance            numeric(18,2),
    interest_rate           numeric(8,6),
    debt_service            numeric(18,2),
    dscr                    numeric(10,4),
    debt_yield              numeric(10,6),
    ltv                     numeric(10,6),
    -- Valuation
    implied_gross_value     numeric(18,2),
    implied_equity_value    numeric(18,2),
    nav_equity              numeric(18,2),
    -- Other
    unfunded_capex          numeric(18,2) DEFAULT 0,
    accrued_pref            numeric(18,2) DEFAULT 0,
    cumulative_contributions numeric(18,2) DEFAULT 0,
    cumulative_distributions numeric(18,2) DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate canonical state per asset per quarter per snapshot
CREATE UNIQUE INDEX IF NOT EXISTS idx_re_afs_asset_quarter_snapshot
    ON re_asset_financial_state (fin_asset_investment_id, quarter, valuation_snapshot_id);

-- ============================================================
-- PHASE 1: Waterfall + Capital Accounts
-- (uses existing fin_allocation_tier, fin_allocation_run, fin_capital_account, etc.)
-- ============================================================

-- Waterfall snapshot: stores the full shadow-liquidation result per fund per quarter
CREATE TABLE IF NOT EXISTS re_waterfall_snapshot (
    waterfall_snapshot_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_fund_id             uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
    quarter                 text NOT NULL,
    waterfall_style         text NOT NULL,  -- 'american' or 'european'
    fin_rule_version_id     uuid REFERENCES fin_rule_version(fin_rule_version_id),
    -- Aggregated amounts
    total_gross_value       numeric(18,2) NOT NULL,
    total_net_cash          numeric(18,2) NOT NULL,
    total_debt_payoff       numeric(18,2) NOT NULL,
    total_sale_costs        numeric(18,2) NOT NULL,
    -- Carry summary
    gp_carry_earned         numeric(18,2) NOT NULL DEFAULT 0,
    gp_carry_paid           numeric(18,2) NOT NULL DEFAULT 0,
    clawback_exposure       numeric(18,2) NOT NULL DEFAULT 0,
    -- Per-tier breakdown
    tier_allocations_json   jsonb NOT NULL,
    -- Per-asset breakdown
    asset_proceeds_json     jsonb NOT NULL,
    -- Per-investor allocations
    investor_allocations_json jsonb NOT NULL,
    -- Traceability
    valuation_snapshot_ids  uuid[] NOT NULL,
    fin_allocation_run_id   uuid REFERENCES fin_allocation_run(fin_allocation_run_id),
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PHASE 2: Fund Aggregation
-- ============================================================

CREATE TABLE IF NOT EXISTS re_fund_summary (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_fund_id             uuid NOT NULL REFERENCES fin_fund(fin_fund_id),
    quarter                 text NOT NULL,
    -- NAV
    portfolio_nav           numeric(18,2) NOT NULL,
    -- Performance
    gross_irr               numeric(10,6),
    net_irr                 numeric(10,6),
    dpi                     numeric(10,4),
    rvpi                    numeric(10,4),
    tvpi                    numeric(10,4),
    -- Weighted metrics
    weighted_ltv            numeric(10,6),
    weighted_dscr           numeric(10,4),
    -- Concentration & risk
    concentration_json      jsonb,  -- HHI by geo/sector/size
    maturity_wall_json      jsonb,  -- loan maturities by year
    carry_summary_json      jsonb,  -- accrued vs realized
    -- Traceability
    waterfall_snapshot_id   uuid REFERENCES re_waterfall_snapshot(waterfall_snapshot_id),
    asset_state_ids         uuid[],
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (fin_fund_id, quarter)
);

-- ============================================================
-- PHASE 3: Stress & Refinance
-- ============================================================

CREATE TABLE IF NOT EXISTS re_stress_scenario (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text NOT NULL,
    description             text,
    parameters_json         jsonb NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_stress_result (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    quarter                 text NOT NULL,
    re_stress_scenario_id   uuid NOT NULL REFERENCES re_stress_scenario(id),
    valuation_snapshot_id   uuid NOT NULL REFERENCES re_valuation_snapshot(valuation_snapshot_id),
    base_nav                numeric(18,2) NOT NULL,
    stressed_nav            numeric(18,2) NOT NULL,
    delta_nav               numeric(18,2) NOT NULL,
    stressed_dscr           numeric(10,4),
    stressed_ltv            numeric(10,6),
    stressed_debt_yield     numeric(10,6),
    details_json            jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_refinance_scenario (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    quarter                 text NOT NULL,
    valuation_snapshot_id   uuid NOT NULL REFERENCES re_valuation_snapshot(valuation_snapshot_id),
    -- Input parameters
    new_rate                numeric(8,6),
    new_term_years          int,
    new_amort_years         int,
    max_ltv_constraint      numeric(8,6) DEFAULT 0.65,
    min_dscr_constraint     numeric(8,4) DEFAULT 1.25,
    prepayment_penalty_pct  numeric(8,6) DEFAULT 0,
    origination_fee_pct     numeric(8,6) DEFAULT 0.01,
    -- Computed outputs
    max_new_loan            numeric(18,2),
    net_proceeds            numeric(18,2),
    cash_out                numeric(18,2),
    new_dscr                numeric(10,4),
    new_ltv                 numeric(10,6),
    new_debt_service        numeric(18,2),
    irr_impact              numeric(10,6),
    viability_score         int,  -- 0-100
    details_json            jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PHASE 4: Surveillance
-- ============================================================

CREATE TABLE IF NOT EXISTS re_surveillance_snapshot (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    quarter                 text NOT NULL,
    valuation_snapshot_id   uuid NOT NULL REFERENCES re_valuation_snapshot(valuation_snapshot_id),
    -- Trend metrics
    dscr_trend              jsonb,     -- last 4 quarters
    debt_yield_trend        jsonb,
    noi_volatility          numeric(10,6),
    occupancy_trend         jsonb,
    -- Risk metrics
    refinance_gap           numeric(18,2),
    balloon_risk_score      int,       -- 0-100
    -- Classification
    risk_classification     text NOT NULL,  -- 'LOW', 'MODERATE', 'HIGH'
    reason_codes            text[],
    flags_json              jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PHASE 5: Monte Carlo
-- ============================================================

CREATE TABLE IF NOT EXISTS re_monte_carlo_run (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    quarter                 text NOT NULL,
    n_sims                  int NOT NULL,
    seed                    bigint NOT NULL,
    distribution_params_json jsonb NOT NULL,
    valuation_snapshot_id   uuid REFERENCES re_valuation_snapshot(valuation_snapshot_id),
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_monte_carlo_result (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    re_monte_carlo_run_id   uuid NOT NULL REFERENCES re_monte_carlo_run(id),
    mean_irr                numeric(10,6),
    median_irr              numeric(10,6),
    std_irr                 numeric(10,6),
    impairment_probability  numeric(10,6),
    var_95                  numeric(18,2),
    expected_moic           numeric(10,4),
    promote_trigger_probability numeric(10,6),
    percentile_buckets_json jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PHASE 6: Risk Scoring
-- ============================================================

CREATE TABLE IF NOT EXISTS re_risk_score (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fin_asset_investment_id  uuid NOT NULL REFERENCES fin_asset_investment(fin_asset_investment_id),
    quarter                 text NOT NULL,
    market_score            int,
    execution_score         int,
    leverage_score          int,
    liquidity_score         int,
    refinance_score         int,
    concentration_score     int,
    volatility_score        int,
    composite_score         int NOT NULL,
    weights_json            jsonb NOT NULL,
    details_json            jsonb,
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Immutability enforcement: prevent updates on snapshot tables
-- ============================================================

CREATE OR REPLACE FUNCTION re_prevent_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Snapshot tables are append-only. UPDATE and DELETE are not allowed.';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        're_valuation_snapshot',
        're_asset_financial_state',
        're_waterfall_snapshot',
        're_fund_summary',
        're_stress_result',
        're_surveillance_snapshot',
        're_monte_carlo_result',
        're_risk_score'
    ])
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%s_immutable ON %I; '
            'CREATE TRIGGER trg_%s_immutable '
            'BEFORE UPDATE OR DELETE ON %I '
            'FOR EACH ROW EXECUTE FUNCTION re_prevent_snapshot_mutation();',
            tbl, tbl, tbl, tbl
        );
    END LOOP;
END;
$$;

-- ============================================================
-- Performance indices
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_re_aqf_asset_quarter ON re_asset_quarterly_financials (fin_asset_investment_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_loan_asset ON re_loan (fin_asset_investment_id);
CREATE INDEX IF NOT EXISTS idx_re_vs_asset_quarter ON re_valuation_snapshot (fin_asset_investment_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_afs_fund_quarter ON re_asset_financial_state (fin_fund_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_ws_fund_quarter ON re_waterfall_snapshot (fin_fund_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_fs_fund_quarter ON re_fund_summary (fin_fund_id, quarter);
CREATE INDEX IF NOT EXISTS idx_re_surv_asset_quarter ON re_surveillance_snapshot (fin_asset_investment_id, quarter);

COMMIT;
