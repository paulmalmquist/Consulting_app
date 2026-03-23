-- 324_re_statement_definitions.sql
-- Canonical financial statement line definitions for REPE properties.
-- Defines the structure of Income Statement, Cash Flow, and Balance Sheet
-- with proper grouping, subtotals, ordering, and sign conventions.
--
-- Depends on: none (standalone reference table)
-- Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING

-- =============================================================================
-- I. Statement line definition table
-- =============================================================================

CREATE TABLE IF NOT EXISTS acct_statement_line_def (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    statement       text NOT NULL CHECK (statement IN ('IS','CF','BS','KPI')),
    line_code       text NOT NULL,
    display_label   text NOT NULL,
    group_label     text NOT NULL,
    sort_order      int NOT NULL,
    is_subtotal     boolean DEFAULT false,
    subtotal_of     text[] DEFAULT '{}',
    indent_level    int DEFAULT 0,
    sign_display    int DEFAULT 1,   -- 1 = positive is good, -1 = negate for display
    format_type     text DEFAULT 'currency' CHECK (format_type IN ('currency','percent','number','ratio')),
    UNIQUE (statement, line_code)
);

CREATE INDEX IF NOT EXISTS idx_stmt_line_def_stmt
    ON acct_statement_line_def (statement, sort_order);

-- =============================================================================
-- II. Income Statement line definitions
-- =============================================================================

INSERT INTO acct_statement_line_def
    (statement, line_code, display_label, group_label, sort_order, is_subtotal, subtotal_of, indent_level, sign_display)
VALUES
    -- Revenue group
    ('IS', 'RENT',           'Rental Revenue',           'Revenue',            100, false, '{}',                          1, 1),
    ('IS', 'OTHER_INCOME',   'Other Income',             'Revenue',            110, false, '{}',                          1, 1),
    ('IS', 'EGI',            'Effective Gross Income',   'Revenue',            190, true,  '{RENT,OTHER_INCOME}',         0, 1),

    -- Operating expenses group
    ('IS', 'PAYROLL',        'Payroll & Benefits',       'Operating Expenses', 200, false, '{}',                          1, -1),
    ('IS', 'REPAIRS_MAINT',  'Repairs & Maintenance',    'Operating Expenses', 210, false, '{}',                          1, -1),
    ('IS', 'UTILITIES',      'Utilities',                'Operating Expenses', 220, false, '{}',                          1, -1),
    ('IS', 'TAXES',          'Real Estate Taxes',        'Operating Expenses', 230, false, '{}',                          1, -1),
    ('IS', 'INSURANCE',      'Insurance',                'Operating Expenses', 240, false, '{}',                          1, -1),
    ('IS', 'MGMT_FEES',      'Management Fees',          'Operating Expenses', 250, false, '{}',                          1, -1),
    ('IS', 'TOTAL_OPEX',     'Total Operating Expenses', 'Operating Expenses', 290, true,  '{PAYROLL,REPAIRS_MAINT,UTILITIES,TAXES,INSURANCE,MGMT_FEES}', 0, -1),

    -- NOI
    ('IS', 'NOI',            'Net Operating Income',     'NOI',                300, true,  '{EGI,TOTAL_OPEX}',            0, 1),
    ('IS', 'NOI_MARGIN',     'NOI Margin',               'NOI',                310, false, '{}',                          1, 1)
ON CONFLICT (statement, line_code) DO NOTHING;

-- =============================================================================
-- III. Cash Flow statement line definitions
-- =============================================================================

INSERT INTO acct_statement_line_def
    (statement, line_code, display_label, group_label, sort_order, is_subtotal, subtotal_of, indent_level, sign_display, format_type)
VALUES
    -- Start from NOI
    ('CF', 'NOI',                'Net Operating Income',      'Operating',          100, false, '{}', 0, 1, 'currency'),

    -- Below the line
    ('CF', 'CAPEX',              'Capital Expenditures',      'Below the Line',     200, false, '{}', 1, -1, 'currency'),
    ('CF', 'TENANT_IMPROVEMENTS','Tenant Improvements',       'Below the Line',     210, false, '{}', 1, -1, 'currency'),
    ('CF', 'LEASING_COMMISSIONS','Leasing Commissions',       'Below the Line',     220, false, '{}', 1, -1, 'currency'),
    ('CF', 'REPLACEMENT_RESERVES','Replacement Reserves',     'Below the Line',     230, false, '{}', 1, -1, 'currency'),

    -- Debt service
    ('CF', 'DEBT_SERVICE_INT',   'Interest Expense',          'Debt Service',       300, false, '{}', 1, -1, 'currency'),
    ('CF', 'DEBT_SERVICE_PRIN',  'Principal Amortization',    'Debt Service',       310, false, '{}', 1, -1, 'currency'),
    ('CF', 'TOTAL_DEBT_SERVICE', 'Total Debt Service',        'Debt Service',       390, true,  '{DEBT_SERVICE_INT,DEBT_SERVICE_PRIN}', 0, -1, 'currency'),

    -- Net cash flow
    ('CF', 'NET_CASH_FLOW',      'Net Cash Flow',             'Net',                400, true,  '{NOI,CAPEX,TENANT_IMPROVEMENTS,LEASING_COMMISSIONS,REPLACEMENT_RESERVES,TOTAL_DEBT_SERVICE}', 0, 1, 'currency'),

    -- Coverage metrics
    ('CF', 'DSCR',               'Debt Service Coverage',     'Metrics',            500, false, '{}', 1, 1, 'ratio'),
    ('CF', 'DEBT_YIELD',         'Debt Yield',                'Metrics',            510, false, '{}', 1, 1, 'percent')
ON CONFLICT (statement, line_code) DO NOTHING;

-- =============================================================================
-- IV. KPI definitions (for summary strips)
-- =============================================================================

INSERT INTO acct_statement_line_def
    (statement, line_code, display_label, group_label, sort_order, is_subtotal, subtotal_of, indent_level, sign_display, format_type)
VALUES
    ('KPI', 'OCCUPANCY',      'Occupancy',            'Operations', 100, false, '{}', 0, 1, 'percent'),
    ('KPI', 'AVG_RENT',       'Avg Rent / Unit',      'Operations', 110, false, '{}', 0, 1, 'currency'),
    ('KPI', 'NOI_PER_UNIT',   'NOI / Unit',           'Operations', 120, false, '{}', 0, 1, 'currency'),
    ('KPI', 'NOI_MARGIN_KPI', 'NOI Margin',           'Performance',200, false, '{}', 0, 1, 'percent'),
    ('KPI', 'DSCR_KPI',       'DSCR',                 'Performance',210, false, '{}', 0, 1, 'ratio'),
    ('KPI', 'LTV',            'Loan-to-Value',        'Leverage',   300, false, '{}', 0, 1, 'percent'),
    ('KPI', 'ASSET_VALUE',    'Asset Value',           'Valuation',  400, false, '{}', 0, 1, 'currency'),
    ('KPI', 'EQUITY_VALUE',   'Equity Value',          'Valuation',  410, false, '{}', 0, 1, 'currency')
ON CONFLICT (statement, line_code) DO NOTHING;

-- =============================================================================
-- V. Report catalog table
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_report_template (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_key      text UNIQUE NOT NULL,
    name            text NOT NULL,
    description     text,
    entity_level    text NOT NULL CHECK (entity_level IN ('asset','investment','fund','portfolio')),
    blocks          jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed report templates
INSERT INTO re_report_template (report_key, name, description, entity_level, blocks)
VALUES
    ('asset_operating_statement', 'Asset Operating Statement', 'Monthly/quarterly income statement with NOI bridge and cash flow', 'asset',
     '[{"type":"kpi_strip","config":{"metrics":["OCCUPANCY","NOI_MARGIN_KPI","DSCR_KPI","ASSET_VALUE"]}},
       {"type":"waterfall_chart","config":{"title":"NOI Bridge"}},
       {"type":"statement_table","config":{"statement":"IS","title":"Income Statement"}},
       {"type":"statement_table","config":{"statement":"CF","title":"Cash Flow Statement"}},
       {"type":"trend_chart","config":{"metrics":["revenue","opex","noi"],"title":"Operating Trend"}}]'::jsonb),

    ('investment_summary', 'Investment Summary', 'Investment-level performance with asset contribution', 'investment',
     '[{"type":"kpi_strip","config":{"metrics":["ASSET_VALUE","EQUITY_VALUE","NOI_MARGIN_KPI","DSCR_KPI"]}},
       {"type":"statement_table","config":{"statement":"IS","title":"Income Statement"}},
       {"type":"trend_chart","config":{"metrics":["noi","debt_balance","asset_value"],"title":"Investment Trend"}},
       {"type":"statement_table","config":{"statement":"CF","title":"Cash Flow"}}]'::jsonb),

    ('fund_quarterly', 'Fund Quarterly Report', 'Portfolio operating summary with NAV rollforward', 'fund',
     '[{"type":"kpi_strip","config":{"metrics":["PORTFOLIO_NAV","TVPI","DPI","NET_IRR"]}},
       {"type":"trend_chart","config":{"metrics":["portfolio_nav","contributions","distributions"],"title":"Capital Activity"}},
       {"type":"asset_contribution_table","config":{"title":"Asset Contribution"}}]'::jsonb),

    ('variance_report', 'Variance Report', 'Budget vs actual variance analysis', 'asset',
     '[{"type":"kpi_strip","config":{"metrics":["NOI_MARGIN_KPI","OCCUPANCY"]}},
       {"type":"variance_table","config":{"title":"Actual vs Budget"}},
       {"type":"waterfall_chart","config":{"title":"Variance Bridge"}}]'::jsonb)
ON CONFLICT (report_key) DO NOTHING;

-- =============================================================================
-- VI. Data quality / validation tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS acct_validation_result (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        uuid,
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    asset_id        uuid,
    period_month    date,
    check_type      text NOT NULL,
    passed          boolean NOT NULL,
    expected        numeric(28,12),
    actual          numeric(28,12),
    delta           numeric(28,12),
    details         jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validation_result_env
    ON acct_validation_result (env_id, business_id, check_type);

CREATE TABLE IF NOT EXISTS re_period_lock (
    env_id      text NOT NULL,
    business_id uuid NOT NULL,
    asset_id    uuid,
    quarter     text NOT NULL,
    locked      boolean DEFAULT false,
    locked_by   text,
    locked_at   timestamptz,
    PRIMARY KEY (env_id, business_id, quarter)
);
