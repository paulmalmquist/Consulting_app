-- 265_repe_object_model.sql
-- Institutional REPE object-first model: fund -> deal -> asset with effective-dated ownership.

CREATE TABLE IF NOT EXISTS repe_fund (
  fund_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES business(business_id),
  name           text NOT NULL,
  vintage_year   int NOT NULL CHECK (vintage_year >= 1900 AND vintage_year <= 2100),
  fund_type      text NOT NULL CHECK (fund_type IN ('closed_end', 'open_end', 'sma', 'co_invest')),
  strategy       text NOT NULL CHECK (strategy IN ('equity', 'debt')),
  sub_strategy   text,
  target_size    numeric(28,12),
  term_years     int,
  status         text NOT NULL DEFAULT 'fundraising' CHECK (status IN ('fundraising', 'investing', 'harvesting', 'closed')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repe_fund_term (
  fund_term_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id                 uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  effective_from          date NOT NULL,
  effective_to            date,
  management_fee_rate     numeric(18,12),
  management_fee_basis    text CHECK (management_fee_basis IN ('committed', 'invested', 'nav')),
  preferred_return_rate   numeric(18,12),
  carry_rate              numeric(18,12),
  waterfall_style         text CHECK (waterfall_style IN ('european', 'american')),
  catch_up_style          text CHECK (catch_up_style IN ('none', 'partial', 'full')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, effective_from)
);

CREATE TABLE IF NOT EXISTS repe_entity (
  entity_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  name            text NOT NULL,
  entity_type     text NOT NULL CHECK (entity_type IN ('fund_lp', 'gp', 'holdco', 'spv', 'jv_partner', 'borrower')),
  jurisdiction    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repe_ownership_edge (
  ownership_edge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id    uuid NOT NULL REFERENCES repe_entity(entity_id) ON DELETE CASCADE,
  to_entity_id      uuid NOT NULL REFERENCES repe_entity(entity_id) ON DELETE CASCADE,
  percent           numeric(18,12) NOT NULL CHECK (percent >= 0 AND percent <= 1),
  effective_from    date NOT NULL,
  effective_to      date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (from_entity_id <> to_entity_id),
  UNIQUE (from_entity_id, to_entity_id, effective_from)
);

CREATE TABLE IF NOT EXISTS repe_deal (
  deal_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id            uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  name               text NOT NULL,
  deal_type          text NOT NULL CHECK (deal_type IN ('equity', 'debt')),
  stage              text NOT NULL DEFAULT 'sourcing' CHECK (stage IN ('sourcing', 'underwriting', 'ic', 'closing', 'operating', 'exited')),
  sponsor            text,
  target_close_date  date,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repe_asset (
  asset_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid NOT NULL REFERENCES repe_deal(deal_id) ON DELETE CASCADE,
  asset_type       text NOT NULL CHECK (asset_type IN ('property', 'cmbs')),
  name             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repe_property_asset (
  asset_id         uuid PRIMARY KEY REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  property_type    text,
  units            int,
  market           text,
  current_noi      numeric(28,12),
  occupancy        numeric(18,12)
);

CREATE TABLE IF NOT EXISTS repe_cmbs_asset (
  asset_id                  uuid PRIMARY KEY REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  tranche                   text,
  rating                    text,
  coupon                    numeric(18,12),
  maturity_date             date,
  collateral_summary_json   jsonb
);

CREATE TABLE IF NOT EXISTS repe_asset_entity_link (
  asset_entity_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id             uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  entity_id            uuid NOT NULL REFERENCES repe_entity(entity_id) ON DELETE CASCADE,
  role                 text NOT NULL CHECK (role IN ('owner', 'borrower', 'collateral_owner', 'manager')),
  percent              numeric(18,12),
  effective_from       date NOT NULL,
  effective_to         date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, entity_id, role, effective_from)
);

CREATE TABLE IF NOT EXISTS repe_capital_event (
  capital_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id          uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  investor_id      uuid,
  event_type       text NOT NULL CHECK (event_type IN ('capital_call', 'distribution', 'fee', 'expense', 'carry')),
  amount           numeric(28,12) NOT NULL,
  event_date       date NOT NULL,
  memo             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repe_fund_business ON repe_fund(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repe_deal_fund ON repe_deal(fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repe_asset_deal ON repe_asset(deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repe_asset_link_asset ON repe_asset_entity_link(asset_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_repe_ownership_to_entity ON repe_ownership_edge(to_entity_id, effective_from DESC);
