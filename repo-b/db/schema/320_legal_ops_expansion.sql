-- 320_legal_ops_expansion.sql
-- Legal Ops expansion: law firms, regulatory items, governance items.

CREATE TABLE IF NOT EXISTS legal_law_firms (
  firm_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  firm_name             text NOT NULL,
  primary_contact       text,
  contact_email         text,
  contact_phone         text,
  billing_rates_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  specialties           text[] NOT NULL DEFAULT '{}',
  performance_rating    numeric(3,2),
  status                text NOT NULL DEFAULT 'active',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, firm_name)
);

CREATE TABLE IF NOT EXISTS legal_regulatory_items (
  regulatory_item_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  agency                text NOT NULL,
  regulation_ref        text,
  obligation_text       text NOT NULL,
  deadline              date,
  frequency             text,
  owner                 text,
  status                text NOT NULL DEFAULT 'open',
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_governance_items (
  governance_item_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id           uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  item_type             text NOT NULL,
  title                 text NOT NULL,
  scheduled_date        date,
  status                text NOT NULL DEFAULT 'pending',
  owner                 text,
  entity_name           text,
  notes                 text,
  source                text NOT NULL DEFAULT 'manual',
  version_no            int NOT NULL DEFAULT 1,
  metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            text,
  updated_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
