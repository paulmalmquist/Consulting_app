-- 998_fin_seed.sql
-- Seed data for canonical finance modules.

INSERT INTO module (key, name, version, description) VALUES
  ('fin_partitioning', 'Finance Partitioning', '1.0.0', 'Live/snapshot/scenario partition model for financial simulation isolation.'),
  ('fin_entity_core', 'Finance Entity Core', '1.0.0', 'Canonical multi-entity identity and ownership hierarchy.'),
  ('fin_accounting_core', 'Finance Accounting Core', '1.0.0', 'Deterministic posting batches, journals, and reconciliation controls.'),
  ('fin_capital_accounts', 'Finance Capital Accounts', '1.0.0', 'Capital event ledgers, rollforwards, and IRR outputs.'),
  ('fin_allocation_engine', 'Finance Allocation Engine', '1.0.0', 'Tiered allocation/waterfall rules and deterministic run lines.'),
  ('fin_repe', 'REPE', '1.0.0', 'Real Estate Private Equity waterfall and capital lifecycle module.'),
  ('fin_legal', 'Legal Economics', '1.0.0', 'Matter-level economics, trust accounting, and contingency waterfalls.'),
  ('fin_healthcare', 'Healthcare/MSO', '1.0.0', 'MSO allocations, claims/denials, provider compensation.'),
  ('fin_construction', 'Construction Finance', '1.0.0', 'Budget/commitment/forecast controls and change-order lineage.'),
  ('fin_security_governance', 'Finance Security', '1.0.0', 'Entity ACL and field-level classification controls.'),
  ('fin_runtime', 'Finance Runtime', '1.0.0', 'Deterministic run envelopes, hashes, and result references.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'fin_entity_core' AND m2.key = 'fin_partitioning'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'fin_accounting_core' AND m2.key = 'fin_entity_core'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'fin_capital_accounts' AND m2.key = 'fin_accounting_core'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'fin_allocation_engine' AND m2.key = 'fin_capital_accounts'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key IN ('fin_repe', 'fin_legal', 'fin_healthcare', 'fin_construction')
  AND m2.key = 'fin_allocation_engine'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'fin_runtime' AND m2.key = 'fin_allocation_engine'
ON CONFLICT DO NOTHING;

INSERT INTO module_dependency (module_id, depends_on_module_id)
SELECT m1.module_id, m2.module_id
FROM module m1, module m2
WHERE m1.key = 'fin_security_governance' AND m2.key = 'fin_entity_core'
ON CONFLICT DO NOTHING;

INSERT INTO fin_entity_type (key, label) VALUES
  ('fund', 'Fund'),
  ('fund_vehicle', 'Fund Vehicle'),
  ('asset', 'Asset'),
  ('matter', 'Legal Matter'),
  ('clinic', 'Clinic'),
  ('mso', 'Management Services Organization'),
  ('investor', 'Investor'),
  ('provider', 'Provider'),
  ('subcontractor', 'Subcontractor'),
  ('referral_source', 'Referral Source'),
  ('trust_account', 'Trust Account'),
  ('contract_party', 'Contract Party'),
  ('construction_project', 'Construction Project')
ON CONFLICT (key) DO NOTHING;

INSERT INTO fin_permission (key, label, description) VALUES
  ('fin.read', 'Finance Read', 'Read financial records within entity scope.'),
  ('fin.write', 'Finance Write', 'Write financial records within entity scope.'),
  ('fin.run', 'Finance Run', 'Submit deterministic financial engine runs.'),
  ('fin.post', 'Finance Post', 'Post accounting batches and source-linked journals.'),
  ('fin.export_sensitive', 'Export Sensitive', 'Export PHI/trust classified data under policy.'),
  ('fin.admin', 'Finance Admin', 'Manage finance ACL and segregation controls.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO fin_data_classification (tenant_id, business_id, key, label, severity)
SELECT
  b.tenant_id,
  b.business_id,
  c.key,
  c.label,
  c.severity
FROM business b
CROSS JOIN (
  VALUES
    ('phi', 'Protected Health Information', 'regulated'),
    ('trust', 'Client Trust Accounting', 'regulated'),
    ('financial', 'Financial Ledger Data', 'restricted')
) AS c(key, label, severity)
ON CONFLICT (tenant_id, business_id, key) DO NOTHING;

INSERT INTO fin_partition (
  tenant_id,
  business_id,
  key,
  partition_type,
  is_read_only,
  status
)
SELECT
  b.tenant_id,
  b.business_id,
  'live',
  'live',
  false,
  'active'
FROM business b
WHERE NOT EXISTS (
  SELECT 1
  FROM fin_partition p
  WHERE p.tenant_id = b.tenant_id
    AND p.business_id = b.business_id
    AND p.partition_type = 'live'
    AND p.status = 'active'
);
