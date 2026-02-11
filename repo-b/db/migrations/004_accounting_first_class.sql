-- Migration 004: Make accounting first-class across catalog, business mappings, and schema foundations.
-- Idempotent: all inserts and DDL use IF NOT EXISTS / ON CONFLICT.

-- ─────────────────────────────────────────────
-- Department + capability catalog
-- ─────────────────────────────────────────────
INSERT INTO app.departments (key, label, icon, sort_order)
VALUES ('accounting', 'Accounting', 'calculator', 20)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, '{}'::jsonb
FROM app.departments d
JOIN (
  VALUES
    ('general-ledger', 'General Ledger', 'data_grid', 10),
    ('journal-entries', 'Journal Entries', 'data_grid', 20),
    ('accounts-payable', 'Accounts Payable', 'data_grid', 30),
    ('accounts-receivable', 'Accounts Receivable', 'data_grid', 40),
    ('vendor-management', 'Vendor Management', 'data_grid', 50),
    ('reporting', 'Reporting', 'dashboard', 60),
    ('audit-log', 'Audit Log', 'history', 70)
) AS v(key, label, kind, sort_order)
ON TRUE
WHERE d.key = 'accounting'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label,
  kind = EXCLUDED.kind,
  sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────
-- Backfill existing businesses with accounting
-- ─────────────────────────────────────────────
INSERT INTO app.business_departments (business_id, department_id, enabled)
SELECT b.business_id, d.department_id, true
FROM app.businesses b
JOIN app.departments d ON d.key = 'accounting'
ON CONFLICT (business_id, department_id) DO UPDATE SET enabled = true;

INSERT INTO app.business_capabilities (business_id, capability_id, enabled)
SELECT b.business_id, c.capability_id, true
FROM app.businesses b
JOIN app.departments d ON d.key = 'accounting'
JOIN app.capabilities c ON c.department_id = d.department_id
ON CONFLICT (business_id, capability_id) DO UPDATE SET enabled = true;

-- ─────────────────────────────────────────────
-- Template consistency: all defaults include accounting
-- ─────────────────────────────────────────────
UPDATE app.templates
SET departments = (
  SELECT to_jsonb(array_agg(val))
  FROM (
    SELECT DISTINCT value::text AS val
    FROM jsonb_array_elements_text(COALESCE(app.templates.departments, '[]'::jsonb))
    UNION
    SELECT 'accounting'
  ) t
)
WHERE key IN ('starter', 'growth', 'enterprise');

-- ─────────────────────────────────────────────
-- Minimal accounting schema foundations (app.*)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.accounts (
  account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  parent_account_id uuid NULL REFERENCES app.accounts(account_id) ON DELETE SET NULL,
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NULL REFERENCES app.users(user_id),
  updated_by_user_id uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, account_code)
);

CREATE TABLE IF NOT EXISTS app.journal_entries (
  journal_entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  entry_number text NOT NULL,
  entry_date date NOT NULL,
  memo text NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by_user_id uuid NULL REFERENCES app.users(user_id),
  updated_by_user_id uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, entry_number)
);

CREATE TABLE IF NOT EXISTS app.journal_entry_lines (
  journal_entry_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES app.journal_entries(journal_entry_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES app.accounts(account_id) ON DELETE RESTRICT,
  line_number int NOT NULL,
  description text NULL,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  created_by_user_id uuid NULL REFERENCES app.users(user_id),
  updated_by_user_id uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_entry_id, line_number)
);

CREATE TABLE IF NOT EXISTS app.vendors (
  vendor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  vendor_code text NOT NULL,
  vendor_name text NOT NULL,
  email text NULL,
  phone text NULL,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid NULL REFERENCES app.users(user_id),
  updated_by_user_id uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, vendor_code)
);

CREATE TABLE IF NOT EXISTS app.invoices (
  invoice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  vendor_id uuid NULL REFERENCES app.vendors(vendor_id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date NULL,
  amount_total numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_by_user_id uuid NULL REFERENCES app.users(user_id),
  updated_by_user_id uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS app.payments (
  payment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  invoice_id uuid NULL REFERENCES app.invoices(invoice_id) ON DELETE SET NULL,
  vendor_id uuid NULL REFERENCES app.vendors(vendor_id) ON DELETE SET NULL,
  payment_date date NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  method text NULL,
  status text NOT NULL DEFAULT 'pending',
  reference text NULL,
  created_by_user_id uuid NULL REFERENCES app.users(user_id),
  updated_by_user_id uuid NULL REFERENCES app.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app' AND p.proname = 'set_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'accounts_set_updated_at') THEN
      CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON app.accounts FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entries_set_updated_at') THEN
      CREATE TRIGGER journal_entries_set_updated_at BEFORE UPDATE ON app.journal_entries FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entry_lines_set_updated_at') THEN
      CREATE TRIGGER journal_entry_lines_set_updated_at BEFORE UPDATE ON app.journal_entry_lines FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vendors_set_updated_at') THEN
      CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON app.vendors FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'invoices_set_updated_at') THEN
      CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON app.invoices FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payments_set_updated_at') THEN
      CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON app.payments FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
  END IF;
END;
$$;
