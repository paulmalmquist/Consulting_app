-- 278_re_financial_intelligence.sql
-- Financial Intelligence layer: NOI variance, return metrics, debt surveillance,
-- accounting ingestion, budget baselines, cash events, fee policies, and run snapshots.
--
-- Depends on: 270_re_institutional_model.sql (re_run_provenance, repe_fund, repe_asset, etc.)

-- ─── 1. Accounting Actuals + Mapping ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acct_chart_of_accounts (
    gl_account      text PRIMARY KEY,
    name            text NOT NULL,
    category        text NOT NULL DEFAULT 'operating',
    is_balance_sheet boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acct_gl_balance_monthly (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    asset_id        uuid,
    period_month    date NOT NULL,
    gl_account      text NOT NULL REFERENCES acct_chart_of_accounts(gl_account),
    amount          numeric(28,12) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'USD',
    source_id       text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acct_mapping_rule (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    gl_account      text NOT NULL REFERENCES acct_chart_of_accounts(gl_account),
    target_line_code text NOT NULL,
    target_statement text NOT NULL CHECK (target_statement IN ('NOI','BS','CF')),
    sign_multiplier  int NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acct_normalized_noi_monthly (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    asset_id        uuid NOT NULL,
    period_month    date NOT NULL,
    line_code       text NOT NULL,
    amount          numeric(28,12) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'USD',
    source_hash     text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acct_normalized_bs_monthly (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    asset_id        uuid,
    period_month    date NOT NULL,
    line_code       text NOT NULL,
    amount          numeric(28,12) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'USD',
    source_hash     text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Underwriting / Budget Baseline ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS uw_version (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    name            text NOT NULL,
    scenario_id     uuid,
    effective_from  date NOT NULL DEFAULT CURRENT_DATE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uw_noi_budget_monthly (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    asset_id        uuid NOT NULL,
    uw_version_id   uuid NOT NULL REFERENCES uw_version(id) ON DELETE CASCADE,
    period_month    date NOT NULL,
    line_code       text NOT NULL,
    amount          numeric(28,12) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'USD'
);

-- ─── 3. Cash Events & Fee Policy ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS re_cash_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    investment_id   uuid,
    asset_id        uuid,
    event_date      date NOT NULL,
    event_type      text NOT NULL CHECK (event_type IN (
        'CALL','DIST','FEE','EXPENSE','OPERATING_CASH','LOAN_DRAW','LOAN_PAYDOWN'
    )),
    amount          numeric(28,12) NOT NULL,
    currency        text NOT NULL DEFAULT 'USD',
    memo            text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_fee_policy (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    fee_basis       text NOT NULL CHECK (fee_basis IN ('COMMITTED','CALLED','NAV')),
    annual_rate     numeric(28,12) NOT NULL,
    start_date      date NOT NULL,
    stepdown_date   date,
    stepdown_rate   numeric(28,12),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_fee_accrual_qtr (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    quarter         text NOT NULL,
    amount          numeric(28,12) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'USD',
    run_id          uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_fund_expense_qtr (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    quarter         text NOT NULL,
    expense_type    text NOT NULL,
    amount          numeric(28,12) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'USD',
    run_id          uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. Quarter-Close Run + Snapshot Outputs ────────────────────────────────

CREATE TABLE IF NOT EXISTS re_run (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    quarter         text NOT NULL,
    scenario_id     text,
    run_type        text NOT NULL CHECK (run_type IN (
        'QUARTER_CLOSE','COVENANT_TEST','WATERFALL_SHADOW'
    )),
    status          text NOT NULL DEFAULT 'running',
    input_hash      text,
    output_hash     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text
);

CREATE TABLE IF NOT EXISTS re_asset_variance_qtr (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          uuid NOT NULL REFERENCES re_run(id) ON DELETE CASCADE,
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    investment_id   uuid,
    asset_id        uuid NOT NULL,
    quarter         text NOT NULL,
    line_code       text NOT NULL,
    actual_amount   numeric(28,12) NOT NULL DEFAULT 0,
    plan_amount     numeric(28,12) NOT NULL DEFAULT 0,
    variance_amount numeric(28,12) NOT NULL DEFAULT 0,
    variance_pct    numeric(28,12)
);

CREATE TABLE IF NOT EXISTS re_fund_metrics_qtr (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          uuid NOT NULL REFERENCES re_run(id) ON DELETE CASCADE,
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    quarter         text NOT NULL,
    gross_irr       numeric(28,12),
    net_irr         numeric(28,12),
    gross_tvpi      numeric(28,12),
    net_tvpi        numeric(28,12),
    dpi             numeric(28,12),
    rvpi            numeric(28,12),
    cash_on_cash    numeric(28,12),
    gross_net_spread numeric(28,12),
    inputs_missing  jsonb
);

CREATE TABLE IF NOT EXISTS re_gross_net_bridge_qtr (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          uuid NOT NULL REFERENCES re_run(id) ON DELETE CASCADE,
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    quarter         text NOT NULL,
    gross_return    numeric(28,12) NOT NULL DEFAULT 0,
    mgmt_fees       numeric(28,12) NOT NULL DEFAULT 0,
    fund_expenses   numeric(28,12) NOT NULL DEFAULT 0,
    carry_shadow    numeric(28,12) NOT NULL DEFAULT 0,
    net_return      numeric(28,12) NOT NULL DEFAULT 0
);

-- ─── 5. Debt Surveillance Tables ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS re_loan (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    investment_id   uuid,
    asset_id        uuid,
    loan_name       text NOT NULL,
    upb             numeric(28,12) NOT NULL DEFAULT 0,
    rate_type       text NOT NULL DEFAULT 'fixed',
    rate            numeric(28,12) NOT NULL DEFAULT 0,
    spread          numeric(28,12),
    maturity        date,
    amort_type      text NOT NULL DEFAULT 'interest_only',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_loan_covenant_definition (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    loan_id         uuid NOT NULL REFERENCES re_loan(id) ON DELETE CASCADE,
    covenant_type   text NOT NULL CHECK (covenant_type IN ('DSCR','LTV','DEBT_YIELD')),
    comparator      text NOT NULL CHECK (comparator IN ('>=','<=')),
    threshold       numeric(28,12) NOT NULL,
    frequency       text NOT NULL DEFAULT 'quarterly',
    cure_days       int NOT NULL DEFAULT 30,
    active          boolean NOT NULL DEFAULT true,
    source_doc_id   uuid,
    source_excerpt_hash text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_loan_covenant_result_qtr (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          uuid NOT NULL REFERENCES re_run(id) ON DELETE CASCADE,
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    loan_id         uuid NOT NULL REFERENCES re_loan(id) ON DELETE CASCADE,
    quarter         text NOT NULL,
    dscr            numeric(28,12),
    ltv             numeric(28,12),
    debt_yield      numeric(28,12),
    pass            boolean NOT NULL DEFAULT true,
    headroom        numeric(28,12),
    breached        boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS re_loan_watchlist_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid NOT NULL,
    loan_id         uuid NOT NULL REFERENCES re_loan(id) ON DELETE CASCADE,
    quarter         text NOT NULL,
    severity        text NOT NULL CHECK (severity IN ('LOW','MED','HIGH')),
    reason          text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 6. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_gl_balance_lookup
    ON acct_gl_balance_monthly (env_id, business_id, asset_id, period_month);

CREATE INDEX IF NOT EXISTS idx_normalized_noi_lookup
    ON acct_normalized_noi_monthly (env_id, business_id, asset_id, period_month);

CREATE INDEX IF NOT EXISTS idx_normalized_bs_lookup
    ON acct_normalized_bs_monthly (env_id, business_id, period_month);

CREATE INDEX IF NOT EXISTS idx_uw_budget_lookup
    ON uw_noi_budget_monthly (env_id, business_id, asset_id, uw_version_id, period_month);

CREATE INDEX IF NOT EXISTS idx_cash_event_lookup
    ON re_cash_event (env_id, business_id, fund_id, event_date);

CREATE INDEX IF NOT EXISTS idx_fee_policy_fund
    ON re_fee_policy (env_id, business_id, fund_id);

CREATE INDEX IF NOT EXISTS idx_re_run_lookup
    ON re_run (env_id, business_id, fund_id, quarter);

CREATE INDEX IF NOT EXISTS idx_variance_qtr_lookup
    ON re_asset_variance_qtr (env_id, business_id, fund_id, quarter);

CREATE INDEX IF NOT EXISTS idx_fund_metrics_qtr_lookup
    ON re_fund_metrics_qtr (env_id, business_id, fund_id, quarter);

CREATE INDEX IF NOT EXISTS idx_bridge_qtr_lookup
    ON re_gross_net_bridge_qtr (env_id, business_id, fund_id, quarter);

CREATE INDEX IF NOT EXISTS idx_loan_fund
    ON re_loan (env_id, business_id, fund_id);

CREATE INDEX IF NOT EXISTS idx_covenant_def_loan
    ON re_loan_covenant_definition (loan_id);

CREATE INDEX IF NOT EXISTS idx_covenant_result_qtr
    ON re_loan_covenant_result_qtr (env_id, business_id, fund_id, quarter);

CREATE INDEX IF NOT EXISTS idx_watchlist_fund_qtr
    ON re_loan_watchlist_event (env_id, business_id, fund_id, quarter);

CREATE INDEX IF NOT EXISTS idx_fee_accrual_fund_qtr
    ON re_fee_accrual_qtr (env_id, business_id, fund_id, quarter);

CREATE INDEX IF NOT EXISTS idx_fund_expense_fund_qtr
    ON re_fund_expense_qtr (env_id, business_id, fund_id, quarter);
