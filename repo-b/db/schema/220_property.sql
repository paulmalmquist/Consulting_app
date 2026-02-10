-- 220_property.sql
-- MODULE: property
-- Real estate / property management: properties, units, leases, work orders,
-- rent rolls, capex, loans, appraisals.

-- ═══════════════════════════════════════════════════════
-- PROPERTIES & UNITS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS property (
  property_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  code          text NOT NULL,
  name          text NOT NULL,
  property_type text NOT NULL DEFAULT 'commercial'
                CHECK (property_type IN ('commercial','residential','industrial','mixed','land')),
  address_line1 text,
  address_line2 text,
  city          text,
  state_province text,
  postal_code   text,
  country       text NOT NULL DEFAULT 'US',
  square_feet   numeric(18,2),
  year_built    int,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','under_renovation','disposed','pending')),
  object_id     uuid REFERENCES object(object_id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, code)
);

CREATE TABLE IF NOT EXISTS unit (
  unit_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  property_id   uuid NOT NULL REFERENCES property(property_id),
  code          text NOT NULL,
  name          text NOT NULL,
  unit_type     text NOT NULL DEFAULT 'office'
                CHECK (unit_type IN ('office','retail','warehouse','residential','parking','other')),
  square_feet   numeric(18,2),
  floor         text,
  status        text NOT NULL DEFAULT 'vacant'
                CHECK (status IN ('vacant','occupied','under_renovation','unavailable')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, code)
);

-- ═══════════════════════════════════════════════════════
-- TENANTS (property tenants, NOT platform tenants)
-- Named "tenant_party" to avoid collision with platform tenant table.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_party (
  tenant_party_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  name            text NOT NULL,
  contact_email   citext,
  contact_phone   text,
  tax_id          text,
  counterparty_id uuid REFERENCES counterparty(counterparty_id),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- LEASES & CHARGES
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lease (
  lease_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  property_id     uuid NOT NULL REFERENCES property(property_id),
  unit_id         uuid REFERENCES unit(unit_id),
  tenant_party_id uuid NOT NULL REFERENCES tenant_party(tenant_party_id),
  lease_number    text NOT NULL,
  lease_type      text NOT NULL DEFAULT 'gross'
                  CHECK (lease_type IN ('gross','net','triple_net','modified_gross','percentage')),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  monthly_rent    numeric(18,2) NOT NULL DEFAULT 0,
  currency_code   text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  security_deposit numeric(18,2) DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','expired','terminated','renewed')),
  object_id       uuid REFERENCES object(object_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, lease_number)
);

CREATE TABLE IF NOT EXISTS lease_charge (
  lease_charge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  lease_id        uuid NOT NULL REFERENCES lease(lease_id),
  charge_type     text NOT NULL
                  CHECK (charge_type IN ('base_rent','cam','insurance','tax','utility','other')),
  description     text,
  amount          numeric(18,2) NOT NULL,
  frequency       text NOT NULL DEFAULT 'monthly'
                  CHECK (frequency IN ('monthly','quarterly','annually','one_time')),
  start_date      date NOT NULL,
  end_date        date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- WORK ORDERS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS work_order (
  work_order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  property_id   uuid NOT NULL REFERENCES property(property_id),
  unit_id       uuid REFERENCES unit(unit_id),
  title         text NOT NULL,
  description   text,
  priority      text NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high','emergency')),
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','assigned','in_progress','completed','cancelled')),
  estimated_cost numeric(18,2),
  actual_cost    numeric(18,2),
  assigned_to    uuid REFERENCES actor(actor_id),
  completed_at   timestamptz,
  object_id      uuid REFERENCES object(object_id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- RENT ROLL SNAPSHOT (computed, traceable)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rent_roll_snapshot (
  rent_roll_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  property_id           uuid NOT NULL REFERENCES property(property_id),
  snapshot_date         date NOT NULL,
  unit_id               uuid REFERENCES unit(unit_id),
  lease_id              uuid REFERENCES lease(lease_id),
  tenant_party_name     text,
  monthly_rent          numeric(18,2),
  square_feet           numeric(18,2),
  rent_per_sqft         numeric(18,4),
  occupancy_status      text,
  -- Traceability: REQUIRED for computed/derived snapshots
  dataset_version_id    uuid NOT NULL REFERENCES dataset_version(dataset_version_id),
  rule_version_id       uuid NOT NULL REFERENCES rule_version(rule_version_id),
  run_id                uuid NOT NULL REFERENCES run(run_id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- CAPEX PROJECTS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS capex_project (
  capex_project_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id      uuid NOT NULL REFERENCES business(business_id),
  property_id      uuid NOT NULL REFERENCES property(property_id),
  name             text NOT NULL,
  description      text,
  budget           numeric(18,2),
  actual_cost      numeric(18,2) DEFAULT 0,
  currency_code    text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  status           text NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned','in_progress','completed','cancelled')),
  start_date       date,
  completion_date  date,
  object_id        uuid REFERENCES object(object_id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- LOANS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS loan (
  loan_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  property_id     uuid REFERENCES property(property_id),
  loan_number     text NOT NULL,
  lender          text NOT NULL,
  principal       numeric(18,2) NOT NULL,
  interest_rate   numeric(18,8) NOT NULL,
  currency_code   text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  start_date      date NOT NULL,
  maturity_date   date NOT NULL,
  monthly_payment numeric(18,2),
  outstanding_balance numeric(18,2),
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paid_off','defaulted','refinanced')),
  object_id       uuid REFERENCES object(object_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, loan_number)
);

-- ═══════════════════════════════════════════════════════
-- APPRAISALS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS appraisal (
  appraisal_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  property_id   uuid NOT NULL REFERENCES property(property_id),
  appraisal_date date NOT NULL,
  appraised_value numeric(18,2) NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  appraiser     text,
  method        text CHECK (method IN ('comparable','income','cost','dcf')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Bridge: add FK from journal_line.property_id to property
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_line_property_id_fkey'
  ) THEN
    ALTER TABLE journal_line
      ADD CONSTRAINT journal_line_property_id_fkey
      FOREIGN KEY (property_id) REFERENCES property(property_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;
