-- 271_domain_templates.sql
-- Seed command-workspace templates and capability surfaces for PDS/Credit/LegalOps/Medical.

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
VALUES
  ((SELECT department_id FROM app.departments WHERE key='projects'), 'pds_command_center', 'PDS Command Center', 'action', 14, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='finance'), 'credit_underwriting', 'Credit Underwriting', 'action', 15, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='finance'), 'credit_watchlist', 'Credit Watchlist', 'action', 16, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='legal'), 'legal_matter_cockpit', 'Legal Matter Cockpit', 'action', 14, '{}'::jsonb),
  ((SELECT department_id FROM app.departments WHERE key='operations'), 'medical_backoffice', 'Medical Backoffice', 'action', 14, '{}'::jsonb)
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label,
  kind = EXCLUDED.kind,
  sort_order = EXCLUDED.sort_order,
  metadata_json = EXCLUDED.metadata_json;

INSERT INTO app.templates (key, label, description, departments, capabilities)
VALUES
(
  'pds_command',
  'PDS Command',
  'Project & Development Services command center with deterministic portfolio snapshots and reporting.',
  '["projects", "operations", "accounting", "reporting", "legal", "documents", "crm", "compliance"]'::jsonb,
  '"__all__"'::jsonb
),
(
  'credit_risk_hub',
  'Credit Risk Hub',
  'Underwriting, committee governance, covenant monitoring, watchlist, and workout operations.',
  '["finance", "crm", "compliance", "reporting", "legal", "documents"]'::jsonb,
  '"__all__"'::jsonb
),
(
  'legal_ops_command',
  'Legal Ops Command',
  'Matter management, obligations, litigation tracking, approvals, and legal spend controls.',
  '["legal", "documents", "compliance", "crm", "accounting", "reporting"]'::jsonb,
  '"__all__"'::jsonb
),
(
  'medical_office_backoffice',
  'Medical Office Backoffice',
  'MOB tenant CRM, lease revenue controls, compliance, maintenance, vendors, and capex planning.',
  '["operations", "accounting", "crm", "projects", "legal", "documents", "compliance", "hr"]'::jsonb,
  '"__all__"'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  departments = EXCLUDED.departments,
  capabilities = EXCLUDED.capabilities;
