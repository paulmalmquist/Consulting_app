-- Migration 299: Pipeline tables for deal sourcing

CREATE TABLE IF NOT EXISTS re_pipeline_deal (
  deal_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id           uuid NOT NULL,
  fund_id          uuid,
  deal_name        text NOT NULL,
  status           text NOT NULL DEFAULT 'sourced'
    CHECK (status IN ('sourced','screening','loi','dd','ic','closing','closed','dead')),
  source           text,
  strategy         text
    CHECK (strategy IS NULL OR strategy IN ('core','core_plus','value_add','opportunistic','debt','development')),
  property_type    text,
  target_close_date date,
  headline_price   numeric(18,2),
  target_irr       numeric(8,4),
  target_moic      numeric(8,4),
  notes            text,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_pipeline_deal_env ON re_pipeline_deal(env_id);
CREATE INDEX IF NOT EXISTS idx_re_pipeline_deal_status ON re_pipeline_deal(status);
CREATE INDEX IF NOT EXISTS idx_re_pipeline_deal_fund ON re_pipeline_deal(fund_id);

CREATE TABLE IF NOT EXISTS re_pipeline_property (
  property_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid NOT NULL REFERENCES re_pipeline_deal(deal_id) ON DELETE CASCADE,
  property_name    text NOT NULL,
  address          text,
  city             text,
  state            text,
  zip              text,
  lat              numeric(10,7),
  lon              numeric(11,7),
  property_type    text,
  units            int,
  sqft             int,
  year_built       int,
  occupancy        numeric(6,4),
  noi              numeric(18,2),
  asking_cap_rate  numeric(8,6),
  census_tract_geoid text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_pipeline_property_deal ON re_pipeline_property(deal_id);
CREATE INDEX IF NOT EXISTS idx_re_pipeline_property_latlon ON re_pipeline_property(lat, lon);

CREATE TABLE IF NOT EXISTS re_pipeline_tranche (
  tranche_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid NOT NULL REFERENCES re_pipeline_deal(deal_id) ON DELETE CASCADE,
  tranche_name     text NOT NULL,
  tranche_type     text NOT NULL DEFAULT 'equity'
    CHECK (tranche_type IN ('equity','pref_equity','mezz','senior_debt','bridge','note_purchase')),
  close_date       date,
  commitment_amount numeric(18,2),
  price            numeric(18,2),
  terms_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','committed','funded','closed','withdrawn')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_pipeline_tranche_deal ON re_pipeline_tranche(deal_id);

CREATE TABLE IF NOT EXISTS re_pipeline_contact (
  contact_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid NOT NULL REFERENCES re_pipeline_deal(deal_id) ON DELETE CASCADE,
  name             text NOT NULL,
  email            text,
  phone            text,
  org              text,
  role             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_pipeline_contact_deal ON re_pipeline_contact(deal_id);

CREATE TABLE IF NOT EXISTS re_pipeline_activity (
  activity_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid NOT NULL REFERENCES re_pipeline_deal(deal_id) ON DELETE CASCADE,
  tranche_id       uuid REFERENCES re_pipeline_tranche(tranche_id),
  activity_type    text NOT NULL
    CHECK (activity_type IN ('note','call','meeting','email','document','status_change','milestone')),
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  body             text,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_pipeline_activity_deal ON re_pipeline_activity(deal_id, occurred_at DESC);
