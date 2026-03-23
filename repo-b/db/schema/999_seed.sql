-- 999_seed.sql
-- Seed data for object types, modules, currencies, and dim_date.
-- All inserts use ON CONFLICT DO NOTHING for idempotency.

-- ═══════════════════════════════════════════════════════
-- OBJECT TYPES
-- ═══════════════════════════════════════════════════════

INSERT INTO object_type (key, label) VALUES
  ('generic', 'Generic Object'),
  ('accounting_je', 'Journal Entry'),
  ('accounting_invoice_ar', 'Invoice (AR)'),
  ('accounting_bill_ap', 'Bill (AP)'),
  ('accounting_payment', 'Payment'),
  ('project', 'Project'),
  ('project_issue', 'Project Issue'),
  ('project_risk', 'Project Risk'),
  ('project_change_order', 'Change Order'),
  ('property', 'Property'),
  ('property_lease', 'Lease'),
  ('property_work_order', 'Work Order'),
  ('property_capex', 'CapEx Project'),
  ('milestone_instance', 'Milestone Instance'),
  ('document', 'Document')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- MODULES
-- ═══════════════════════════════════════════════════════

INSERT INTO module (key, name, version, description) VALUES
  ('backbone', 'Backbone', '1.0.0', 'Core tenancy, identity, object system, and lineage. Always on.'),
  ('reporting', 'Reporting', '1.0.0', 'Metrics, dashboards, insights, and fact tables. Always on.'),
  ('accounting', 'Accounting', '1.0.0', 'General ledger, invoices, bills, payments, reconciliation, period close.'),
  ('projects', 'Projects', '1.0.0', 'Project management, WBS, timesheets, issues, risks, change orders.'),
  ('property', 'Property / Real Estate', '1.0.0', 'Properties, units, leases, rent rolls, work orders, loans, appraisals.'),
  ('milestones', 'Milestones', '1.0.0', 'Standalone milestone templates and instances, attachable to any object.')
ON CONFLICT (key) DO NOTHING;

-- Module dependencies:
-- milestones depends on backbone (always on, but explicit for documentation)
-- property has no strict dependency beyond backbone
-- projects has no strict dependency beyond backbone
-- accounting has no strict dependency beyond backbone
INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'accounting' AND m2.key = 'backbone'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'projects' AND m2.key = 'backbone'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'property' AND m2.key = 'backbone'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'milestones' AND m2.key = 'backbone'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'property' AND m2.key = 'accounting'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- CURRENCIES (common subset)
-- ═══════════════════════════════════════════════════════

INSERT INTO dim_currency (currency_code, name, symbol, decimal_places) VALUES
  ('USD', 'US Dollar', '$', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'British Pound', '£', 2),
  ('CAD', 'Canadian Dollar', 'C$', 2),
  ('AUD', 'Australian Dollar', 'A$', 2),
  ('JPY', 'Japanese Yen', '¥', 0),
  ('CHF', 'Swiss Franc', 'CHF', 2),
  ('CNY', 'Chinese Yuan', '¥', 2),
  ('INR', 'Indian Rupee', '₹', 2),
  ('MXN', 'Mexican Peso', 'Mex$', 2)
ON CONFLICT (currency_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- DIM_DATE (2020-01-01 through 2030-12-31)
-- Generated via generate_series for completeness.
-- ═══════════════════════════════════════════════════════

INSERT INTO dim_date (date_key, full_date, year, quarter, month, day, day_of_week, week_of_year, is_weekend)
SELECT
  to_char(d, 'YYYYMMDD')::int AS date_key,
  d::date AS full_date,
  EXTRACT(year FROM d)::int AS year,
  EXTRACT(quarter FROM d)::int AS quarter,
  EXTRACT(month FROM d)::int AS month,
  EXTRACT(day FROM d)::int AS day,
  EXTRACT(isodow FROM d)::int AS day_of_week,
  EXTRACT(week FROM d)::int AS week_of_year,
  EXTRACT(isodow FROM d)::int IN (6, 7) AS is_weekend
FROM generate_series('2020-01-01'::date, '2030-12-31'::date, '1 day'::interval) AS d
ON CONFLICT (date_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════
-- PERMISSIONS (core set)
-- ═══════════════════════════════════════════════════════

INSERT INTO permission (key, label) VALUES
  ('read', 'Read'),
  ('write', 'Write'),
  ('delete', 'Delete'),
  ('admin', 'Admin'),
  ('approve', 'Approve'),
  ('export', 'Export')
ON CONFLICT (key) DO NOTHING;
