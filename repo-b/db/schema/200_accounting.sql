-- 200_accounting.sql
-- MODULE: accounting
-- General ledger, invoices (AR/AP), payments, reconciliation, period close.
-- Bridge columns (object_id, project_id, property_id) link to other modules.

-- ═══════════════════════════════════════════════════════
-- CHART OF ACCOUNTS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS account (
  account_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  code          text NOT NULL,
  name          text NOT NULL,
  account_type  text NOT NULL
                CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  sub_type      text,
  currency_code text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  is_active     boolean NOT NULL DEFAULT true,
  parent_id     uuid REFERENCES account(account_id),
  object_id     uuid REFERENCES object(object_id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, code)
);

CREATE TABLE IF NOT EXISTS cost_center (
  cost_center_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id    uuid NOT NULL REFERENCES business(business_id),
  code           text NOT NULL,
  name           text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, code)
);

CREATE TABLE IF NOT EXISTS entity_legal (
  entity_legal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  code            text NOT NULL,
  name            text NOT NULL,
  tax_id          text,
  jurisdiction    text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, code)
);

CREATE TABLE IF NOT EXISTS counterparty (
  counterparty_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  code            text NOT NULL,
  name            text NOT NULL,
  party_type      text NOT NULL DEFAULT 'vendor'
                  CHECK (party_type IN ('vendor','customer','employee','other')),
  tax_id          text,
  is_active       boolean NOT NULL DEFAULT true,
  object_id       uuid REFERENCES object(object_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, code)
);

-- ═══════════════════════════════════════════════════════
-- JOURNAL ENTRIES
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS journal_entry (
  journal_entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id      uuid NOT NULL REFERENCES business(business_id),
  entry_date       date NOT NULL,
  reference        text,
  memo             text,
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','posted','reversed')),
  entity_legal_id  uuid REFERENCES entity_legal(entity_legal_id),
  posted_by        uuid REFERENCES actor(actor_id),
  posted_at        timestamptz,
  object_id        uuid REFERENCES object(object_id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_line (
  journal_line_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(tenant_id),
  journal_entry_id uuid NOT NULL REFERENCES journal_entry(journal_entry_id),
  line_number      int NOT NULL,
  account_id       uuid NOT NULL REFERENCES account(account_id),
  debit            numeric(18,2) NOT NULL DEFAULT 0,
  credit           numeric(18,2) NOT NULL DEFAULT 0,
  currency_code    text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  cost_center_id   uuid REFERENCES cost_center(cost_center_id),
  memo             text,
  -- Bridge to other modules (nullable)
  project_id       uuid,  -- FK added in 210_projects.sql if module enabled
  property_id      uuid,  -- FK added in 220_property.sql if module enabled
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_entry_id, line_number),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))  -- line is debit OR credit, not both
);

-- ═══════════════════════════════════════════════════════
-- INVOICES (ACCOUNTS RECEIVABLE)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoice_ar (
  invoice_ar_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  invoice_number  text NOT NULL,
  counterparty_id uuid NOT NULL REFERENCES counterparty(counterparty_id),
  issue_date      date NOT NULL,
  due_date        date NOT NULL,
  currency_code   text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  subtotal        numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount      numeric(18,2) NOT NULL DEFAULT 0,
  total           numeric(18,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','partial','paid','overdue','void')),
  object_id       uuid REFERENCES object(object_id),
  project_id      uuid,  -- Bridge
  property_id     uuid,  -- Bridge
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_line_ar (
  invoice_line_ar_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(tenant_id),
  invoice_ar_id      uuid NOT NULL REFERENCES invoice_ar(invoice_ar_id),
  line_number        int NOT NULL,
  description        text NOT NULL,
  quantity           numeric(18,4) NOT NULL DEFAULT 1,
  unit_price         numeric(18,2) NOT NULL DEFAULT 0,
  amount             numeric(18,2) NOT NULL DEFAULT 0,
  account_id         uuid REFERENCES account(account_id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_ar_id, line_number)
);

-- ═══════════════════════════════════════════════════════
-- BILLS (ACCOUNTS PAYABLE)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bill_ap (
  bill_ap_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  bill_number     text NOT NULL,
  counterparty_id uuid NOT NULL REFERENCES counterparty(counterparty_id),
  issue_date      date NOT NULL,
  due_date        date NOT NULL,
  currency_code   text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  subtotal        numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount      numeric(18,2) NOT NULL DEFAULT 0,
  total           numeric(18,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','approved','partial','paid','overdue','void')),
  object_id       uuid REFERENCES object(object_id),
  project_id      uuid,  -- Bridge
  property_id     uuid,  -- Bridge
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, bill_number)
);

CREATE TABLE IF NOT EXISTS bill_line_ap (
  bill_line_ap_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  bill_ap_id      uuid NOT NULL REFERENCES bill_ap(bill_ap_id),
  line_number     int NOT NULL,
  description     text NOT NULL,
  quantity        numeric(18,4) NOT NULL DEFAULT 1,
  unit_price      numeric(18,2) NOT NULL DEFAULT 0,
  amount          numeric(18,2) NOT NULL DEFAULT 0,
  account_id      uuid REFERENCES account(account_id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bill_ap_id, line_number)
);

-- ═══════════════════════════════════════════════════════
-- PAYMENTS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment (
  payment_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id     uuid NOT NULL REFERENCES business(business_id),
  payment_date    date NOT NULL,
  amount          numeric(18,2) NOT NULL,
  currency_code   text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  direction       text NOT NULL CHECK (direction IN ('inbound','outbound')),
  method          text CHECK (method IN ('ach','wire','check','card','cash','other')),
  counterparty_id uuid REFERENCES counterparty(counterparty_id),
  invoice_ar_id   uuid REFERENCES invoice_ar(invoice_ar_id),
  bill_ap_id      uuid REFERENCES bill_ap(bill_ap_id),
  reference       text,
  status          text NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('pending','completed','failed','reversed')),
  object_id       uuid REFERENCES object(object_id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- RECONCILIATION
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reconciliation (
  reconciliation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id       uuid NOT NULL REFERENCES business(business_id),
  account_id        uuid NOT NULL REFERENCES account(account_id),
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  statement_balance numeric(18,2) NOT NULL,
  book_balance      numeric(18,2) NOT NULL,
  difference        numeric(18,2) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','completed')),
  completed_by      uuid REFERENCES actor(actor_id),
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- PERIOD CLOSE
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS close_task (
  close_task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  period_year   int NOT NULL,
  period_month  int NOT NULL,
  task_key      text NOT NULL,
  task_label    text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','completed','skipped')),
  assigned_to   uuid REFERENCES actor(actor_id),
  completed_by  uuid REFERENCES actor(actor_id),
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, period_year, period_month, task_key)
);
