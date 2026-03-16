-- 275_credit_object_model.sql
-- Consumer Credit institutional object model.
-- Parallel to 265_repe_object_model.sql.
-- Introduces portfolio, loan, borrower, servicer entities.

-- ============================================================
-- PORTFOLIOS — the fund-equivalent for consumer credit
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_portfolio (
  portfolio_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  name                  text NOT NULL,
  product_type          text NOT NULL DEFAULT 'other'
                        CHECK (product_type IN ('auto','personal','credit_card','mortgage','student','heloc','other')),
  origination_channel   text NOT NULL DEFAULT 'direct'
                        CHECK (origination_channel IN ('direct','broker','correspondent','fintech_partner','wholesale','other')),
  servicer              text,
  currency_code         text NOT NULL DEFAULT 'USD',
  status                text NOT NULL DEFAULT 'acquiring'
                        CHECK (status IN ('acquiring','performing','runoff','closed')),
  vintage_quarter       text,
  target_segments_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_geographies_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_fico_min       int,
  target_fico_max       int,
  target_dti_max        numeric(18,12),
  target_ltv_max        numeric(18,12),
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, name)
);

CREATE INDEX IF NOT EXISTS cc_portfolio_business_idx
  ON cc_portfolio (business_id, created_at DESC);

-- ============================================================
-- BORROWERS — counterparty profiles with risk attributes
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_borrower (
  borrower_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  borrower_ref          text NOT NULL,
  fico_at_origination   int,
  dti_at_origination    numeric(18,12),
  income_verified       boolean NOT NULL DEFAULT false,
  annual_income         numeric(28,12),
  employment_length_months int,
  housing_status        text CHECK (housing_status IN ('own','rent','mortgage','other')),
  state_code            text,
  attributes_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, borrower_ref)
);

CREATE INDEX IF NOT EXISTS cc_borrower_fico_idx
  ON cc_borrower (business_id, fico_at_origination);

-- ============================================================
-- LOANS — the asset-equivalent, individual loans in a portfolio
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_loan (
  loan_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  portfolio_id          uuid NOT NULL REFERENCES cc_portfolio(portfolio_id) ON DELETE CASCADE,
  borrower_id           uuid NOT NULL REFERENCES cc_borrower(borrower_id) ON DELETE CASCADE,
  loan_ref              text NOT NULL,
  origination_date      date,
  maturity_date         date,
  original_balance      numeric(28,12) NOT NULL DEFAULT 0,
  current_balance       numeric(28,12) NOT NULL DEFAULT 0,
  interest_rate         numeric(18,12),
  apr                   numeric(18,12),
  term_months           int,
  remaining_term_months int,
  loan_status           text NOT NULL DEFAULT 'current'
                        CHECK (loan_status IN (
                          'current','delinquent_30','delinquent_60','delinquent_90',
                          'delinquent_120plus','default','charged_off','paid_off',
                          'prepaid','modified','forbearance'
                        )),
  delinquency_bucket    text NOT NULL DEFAULT 'current'
                        CHECK (delinquency_bucket IN ('current','30','60','90','120plus','default')),
  risk_grade            text,
  collateral_type       text CHECK (collateral_type IN ('vehicle','property','equipment','none')),
  collateral_value      numeric(28,12),
  ltv_at_origination    numeric(18,12),
  payment_amount        numeric(28,12),
  payment_frequency     text NOT NULL DEFAULT 'monthly'
                        CHECK (payment_frequency IN ('weekly','biweekly','monthly')),
  attributes_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, loan_ref)
);

CREATE INDEX IF NOT EXISTS cc_loan_portfolio_idx
  ON cc_loan (portfolio_id, origination_date DESC);

CREATE INDEX IF NOT EXISTS cc_loan_borrower_idx
  ON cc_loan (borrower_id);

CREATE INDEX IF NOT EXISTS cc_loan_status_idx
  ON cc_loan (portfolio_id, loan_status);

-- ============================================================
-- LOAN EVENTS — payment, delinquency, cure, prepay, charge-off, recovery
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_loan_event (
  loan_event_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  loan_id               uuid NOT NULL REFERENCES cc_loan(loan_id) ON DELETE CASCADE,
  event_date            date NOT NULL,
  event_type            text NOT NULL
                        CHECK (event_type IN (
                          'payment','delinquency','cure','prepayment',
                          'default','charge_off','recovery','modification',
                          'forbearance_entry','forbearance_exit','fee'
                        )),
  principal_amount      numeric(28,12) NOT NULL DEFAULT 0,
  interest_amount       numeric(28,12) NOT NULL DEFAULT 0,
  fee_amount            numeric(28,12) NOT NULL DEFAULT 0,
  total_amount          numeric(28,12) GENERATED ALWAYS AS (principal_amount + interest_amount + fee_amount) STORED,
  balance_after         numeric(28,12),
  delinquency_days      int,
  memo                  text,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_loan_event_loan_idx
  ON cc_loan_event (loan_id, event_date DESC);

-- ============================================================
-- SERVICER ENTITIES — originators, servicers, trustees
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_servicer_entity (
  servicer_entity_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  name                  text NOT NULL,
  entity_type           text NOT NULL
                        CHECK (entity_type IN ('originator','servicer','sub_servicer','trustee','insurer','backup_servicer')),
  jurisdiction          text,
  contact_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, name, entity_type)
);

-- ============================================================
-- PORTFOLIO-SERVICER LINKS — effective-dated role assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS cc_portfolio_servicer_link (
  link_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id          uuid NOT NULL REFERENCES cc_portfolio(portfolio_id) ON DELETE CASCADE,
  servicer_entity_id    uuid NOT NULL REFERENCES cc_servicer_entity(servicer_entity_id) ON DELETE CASCADE,
  role                  text NOT NULL
                        CHECK (role IN ('master_servicer','sub_servicer','backup_servicer','trustee','originator')),
  effective_from        date NOT NULL,
  effective_to          date,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, servicer_entity_id, role, effective_from)
);
