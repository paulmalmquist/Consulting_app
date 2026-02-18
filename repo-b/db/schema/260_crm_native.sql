-- 260_crm_native.sql
-- Native CRM module in canonical public schema.

CREATE TABLE IF NOT EXISTS crm_account (
  crm_account_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id       uuid NOT NULL REFERENCES business(business_id),
  external_key      text,
  name              text NOT NULL,
  account_type      text NOT NULL DEFAULT 'customer'
                    CHECK (account_type IN ('customer', 'prospect', 'partner', 'vendor', 'other')),
  industry          text,
  website           text,
  owner_actor_id    uuid REFERENCES actor(actor_id),
  counterparty_id   uuid REFERENCES counterparty(counterparty_id),
  object_id         uuid REFERENCES object(object_id),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, name)
);

CREATE TABLE IF NOT EXISTS crm_contact (
  crm_contact_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id       uuid NOT NULL REFERENCES business(business_id),
  crm_account_id    uuid REFERENCES crm_account(crm_account_id) ON DELETE SET NULL,
  external_key      text,
  first_name        text,
  last_name         text,
  full_name         text NOT NULL,
  email             citext,
  phone             text,
  title             text,
  owner_actor_id    uuid REFERENCES actor(actor_id),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_pipeline_stage (
  crm_pipeline_stage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  key                   text NOT NULL,
  label                 text NOT NULL,
  stage_order           int NOT NULL DEFAULT 100,
  win_probability       numeric(18,4),
  is_closed             boolean NOT NULL DEFAULT false,
  is_won                boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, key)
);

CREATE TABLE IF NOT EXISTS crm_opportunity (
  crm_opportunity_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  crm_account_id        uuid REFERENCES crm_account(crm_account_id) ON DELETE SET NULL,
  primary_contact_id    uuid REFERENCES crm_contact(crm_contact_id) ON DELETE SET NULL,
  crm_pipeline_stage_id uuid REFERENCES crm_pipeline_stage(crm_pipeline_stage_id),
  external_key          text,
  name                  text NOT NULL,
  amount                numeric(28,12) NOT NULL DEFAULT 0,
  currency_code         text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  expected_close_date   date,
  actual_close_date     date,
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'won', 'lost', 'on_hold')),
  owner_actor_id        uuid REFERENCES actor(actor_id),
  project_id            uuid REFERENCES project(project_id),
  object_id             uuid REFERENCES object(object_id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_opportunity_stage_history (
  crm_opportunity_stage_history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                        uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id                      uuid NOT NULL REFERENCES business(business_id),
  crm_opportunity_id               uuid NOT NULL REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE CASCADE,
  from_stage_id                    uuid REFERENCES crm_pipeline_stage(crm_pipeline_stage_id),
  to_stage_id                      uuid NOT NULL REFERENCES crm_pipeline_stage(crm_pipeline_stage_id),
  changed_at                       timestamptz NOT NULL DEFAULT now(),
  changed_by                       uuid REFERENCES actor(actor_id),
  note                             text
);

CREATE TABLE IF NOT EXISTS crm_activity (
  crm_activity_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id          uuid NOT NULL REFERENCES business(business_id),
  crm_account_id       uuid REFERENCES crm_account(crm_account_id) ON DELETE CASCADE,
  crm_contact_id       uuid REFERENCES crm_contact(crm_contact_id) ON DELETE SET NULL,
  crm_opportunity_id   uuid REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE SET NULL,
  activity_type        text NOT NULL
                       CHECK (activity_type IN ('call', 'email', 'meeting', 'note', 'task', 'other')),
  subject              text NOT NULL,
  activity_at          timestamptz NOT NULL DEFAULT now(),
  actor_id             uuid REFERENCES actor(actor_id),
  payload_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
