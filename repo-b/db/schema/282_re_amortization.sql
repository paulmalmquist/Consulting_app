-- 282_re_amortization.sql
-- Amortization schedules, property comps, and capital account snapshots.

-- ─── 2A. Extend re_loan with amortization parameters ───────────────────
ALTER TABLE app.re_loan ADD COLUMN IF NOT EXISTS amortization_period_years INT;
ALTER TABLE app.re_loan ADD COLUMN IF NOT EXISTS term_years INT;
ALTER TABLE app.re_loan ADD COLUMN IF NOT EXISTS io_period_months INT DEFAULT 0;
ALTER TABLE app.re_loan ADD COLUMN IF NOT EXISTS balloon_flag BOOLEAN DEFAULT false;
ALTER TABLE app.re_loan ADD COLUMN IF NOT EXISTS payment_frequency TEXT DEFAULT 'monthly';

-- ─── 2B. Persisted amortization schedule per loan ──────────────────────
CREATE TABLE IF NOT EXISTS app.re_loan_amortization_schedule (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loan_id             UUID NOT NULL REFERENCES app.re_loan(id) ON DELETE CASCADE,
  period_number       INT NOT NULL,
  payment_date        DATE,
  beginning_balance   NUMERIC(18,2) NOT NULL,
  scheduled_principal NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_payment    NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_payment       NUMERIC(18,2) NOT NULL DEFAULT 0,
  ending_balance      NUMERIC(18,2) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (loan_id, period_number)
);

-- ─── 2C. RE property comps (sale & lease) per asset ────────────────────
CREATE TABLE IF NOT EXISTS app.re_property_comp (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  env_id          TEXT NOT NULL,
  business_id     UUID NOT NULL,
  asset_id        UUID NOT NULL,
  comp_type       TEXT NOT NULL CHECK (comp_type IN ('sale', 'lease')),
  address         TEXT,
  submarket       TEXT,
  close_date      DATE,
  sale_price      NUMERIC(18,2),
  cap_rate        NUMERIC(8,6),
  noi             NUMERIC(18,2),
  size_sf         NUMERIC(14,2),
  price_per_sf    NUMERIC(12,2),
  rent_psf        NUMERIC(10,2),
  term_months     INT,
  source          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── 2D. Materialized capital account snapshots per partner per quarter ─
CREATE TABLE IF NOT EXISTS app.re_capital_account_snapshot (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fund_id             UUID NOT NULL,
  partner_id          UUID NOT NULL,
  quarter             VARCHAR(7) NOT NULL,
  committed           NUMERIC(18,2) DEFAULT 0,
  contributed         NUMERIC(18,2) DEFAULT 0,
  distributed         NUMERIC(18,2) DEFAULT 0,
  unreturned_capital  NUMERIC(18,2) DEFAULT 0,
  pref_accrual        NUMERIC(18,2) DEFAULT 0,
  carry_allocation    NUMERIC(18,2) DEFAULT 0,
  unrealized_gain     NUMERIC(18,2) DEFAULT 0,
  nav_share           NUMERIC(18,2) DEFAULT 0,
  dpi                 NUMERIC(10,4),
  rvpi                NUMERIC(10,4),
  tvpi                NUMERIC(10,4),
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fund_id, partner_id, quarter)
);
