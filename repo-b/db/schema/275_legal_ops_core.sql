-- 275_legal_ops_core.sql
-- Legal Ops Command model: matters, contracts, obligations, approvals, spend, litigation.

CREATE TABLE IF NOT EXISTS legal_matters (
  matter_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_number         text NOT NULL,
  title                 text NOT NULL,
  matter_type           text NOT NULL,
  related_entity_type   text,
  related_entity_id     uuid,
  counterparty          text,
  outside_counsel       text,
  internal_owner        text,
  risk_level            text NOT NULL DEFAULT 'medium',
  budget_amount         numeric(28,12) NOT NULL DEFAULT 0,
  actual_spend          numeric(28,12) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'open',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, matter_number)
);

CREATE TABLE IF NOT EXISTS legal_counterparties (
  legal_counterparty_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  legal_name            text NOT NULL,
  entity_type           text,
  jurisdiction          text,
  signatories_json      jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_flags_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_contracts (
  legal_contract_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id              uuid REFERENCES legal_matters(matter_id) ON DELETE SET NULL,
  contract_ref           text NOT NULL,
  contract_type          text NOT NULL,
  counterparty_name      text,
  effective_date         date,
  expiration_date        date,
  governing_law          text,
  auto_renew             boolean NOT NULL DEFAULT false,
  status                 text NOT NULL DEFAULT 'draft',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, contract_ref, version_no)
);

CREATE TABLE IF NOT EXISTS legal_contract_obligations (
  obligation_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  legal_contract_id      uuid NOT NULL REFERENCES legal_contracts(legal_contract_id) ON DELETE CASCADE,
  obligation_text        text NOT NULL,
  owner                  text,
  due_date               date,
  status                 text NOT NULL DEFAULT 'open',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_deadlines (
  deadline_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id              uuid NOT NULL REFERENCES legal_matters(matter_id) ON DELETE CASCADE,
  deadline_type          text NOT NULL,
  due_date               date NOT NULL,
  status                 text NOT NULL DEFAULT 'open',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_approvals (
  legal_approval_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id              uuid NOT NULL REFERENCES legal_matters(matter_id) ON DELETE CASCADE,
  approval_type          text NOT NULL,
  approver               text,
  status                 text NOT NULL DEFAULT 'pending',
  approved_at            timestamptz,
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_spend_entries (
  legal_spend_entry_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id              uuid NOT NULL REFERENCES legal_matters(matter_id) ON DELETE CASCADE,
  outside_counsel        text,
  invoice_ref            text,
  amount                 numeric(28,12) NOT NULL DEFAULT 0,
  incurred_date          date,
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_litigation_cases (
  litigation_case_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id            uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  matter_id              uuid NOT NULL REFERENCES legal_matters(matter_id) ON DELETE CASCADE,
  jurisdiction           text,
  claims                 text,
  exposure_estimate      numeric(28,12) NOT NULL DEFAULT 0,
  insurance_carrier      text,
  reserve_amount         numeric(28,12) NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'open',
  source                 text NOT NULL DEFAULT 'manual',
  version_no             int NOT NULL DEFAULT 1,
  metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             text,
  updated_by             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
