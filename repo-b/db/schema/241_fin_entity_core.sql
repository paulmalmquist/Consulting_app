-- 241_fin_entity_core.sql
-- Canonical economic entity and participation model.

CREATE TABLE IF NOT EXISTS fin_entity_type (
  fin_entity_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                text NOT NULL UNIQUE,
  label              text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_entity (
  fin_entity_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id        uuid NOT NULL REFERENCES business(business_id),
  partition_id       uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_type_id uuid NOT NULL REFERENCES fin_entity_type(fin_entity_type_id),
  code               text NOT NULL,
  name               text NOT NULL,
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'inactive', 'archived')),
  currency_code      text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  object_id          uuid REFERENCES object(object_id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, partition_id, code)
);

CREATE TABLE IF NOT EXISTS fin_entity_hierarchy (
  fin_entity_hierarchy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id             uuid NOT NULL REFERENCES business(business_id),
  partition_id            uuid NOT NULL REFERENCES fin_partition(partition_id),
  parent_entity_id        uuid NOT NULL REFERENCES fin_entity(fin_entity_id),
  child_entity_id         uuid NOT NULL REFERENCES fin_entity(fin_entity_id),
  ownership_pct           numeric(18,12) NOT NULL DEFAULT 1,
  effective_from          date NOT NULL,
  effective_to            date,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_entity_id <> child_entity_id),
  CHECK (ownership_pct >= 0 AND ownership_pct <= 1),
  UNIQUE (partition_id, parent_entity_id, child_entity_id, effective_from)
);

CREATE TABLE IF NOT EXISTS fin_participant (
  fin_participant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id        uuid NOT NULL REFERENCES business(business_id),
  external_key       text,
  name               text NOT NULL,
  participant_type   text NOT NULL
                     CHECK (
                       participant_type IN (
                         'investor',
                         'gp',
                         'lp',
                         'provider',
                         'subcontractor',
                         'referral_source',
                         'other'
                       )
                     ),
  actor_id           uuid REFERENCES actor(actor_id),
  counterparty_id    uuid REFERENCES counterparty(counterparty_id),
  fin_entity_id      uuid REFERENCES fin_entity(fin_entity_id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, external_key)
);

CREATE TABLE IF NOT EXISTS fin_participation (
  fin_participation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id          uuid NOT NULL REFERENCES business(business_id),
  partition_id         uuid NOT NULL REFERENCES fin_partition(partition_id),
  fin_entity_id        uuid NOT NULL REFERENCES fin_entity(fin_entity_id),
  fin_participant_id   uuid NOT NULL REFERENCES fin_participant(fin_participant_id),
  role_key             text NOT NULL,
  basis_units          numeric(28,12),
  basis_pct            numeric(18,12),
  effective_from       date NOT NULL,
  effective_to         date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (basis_pct IS NULL OR (basis_pct >= 0 AND basis_pct <= 1)),
  UNIQUE (partition_id, fin_entity_id, fin_participant_id, role_key, effective_from)
);
