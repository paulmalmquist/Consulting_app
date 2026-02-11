-- 002_department_capability_refactor.sql
-- Refactor from 7 departments to 10 with expanded capability registries.
-- Uses ON CONFLICT for idempotency.

-- ═══════════════════════════════════════════════════════
-- DEPARTMENTS (10 total)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.departments (key, label, icon, sort_order) VALUES
  ('crm',        'CRM',        'users',       10),
  ('accounting', 'Accounting', 'dollar-sign', 20),
  ('operations', 'Operations', 'settings',    30),
  ('projects',   'Projects',   'clipboard',   40),
  ('it',         'IT',         'cpu',         50),
  ('legal',      'Legal',      'shield',      60),
  ('hr',         'HR',         'heart',       70),
  ('executive',  'Executive',  'bar-chart',   80),
  ('documents',  'Documents',  'folder',      90),
  ('admin',      'Admin',      'lock',        100)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- Soft-deprecate old departments that are being replaced
UPDATE app.departments SET sort_order = 999
WHERE key IN ('finance', 'sales', 'marketing')
  AND key NOT IN ('crm', 'accounting', 'operations', 'projects', 'it', 'legal', 'hr', 'executive', 'documents', 'admin');

-- ═══════════════════════════════════════════════════════
-- CRM CAPABILITIES (10)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('accounts',      'Accounts',      'data_grid', 10, '{}'),
  ('contacts',      'Contacts',      'data_grid', 20, '{}'),
  ('leads',         'Leads',         'kanban',    30, '{}'),
  ('opportunities', 'Opportunities', 'kanban',    40, '{}'),
  ('activities',    'Activities',    'data_grid', 50, '{}'),
  ('tasks',         'Tasks',         'kanban',    60, '{}'),
  ('campaigns',     'Campaigns',     'data_grid', 70, '{}'),
  ('products',      'Products',      'data_grid', 80, '{}'),
  ('forecast',      'Forecast',      'dashboard', 90, '{}'),
  ('reports',       'Reports',       'dashboard', 100, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'crm'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- ACCOUNTING CAPABILITIES (13)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('chart_of_accounts',    'Chart of Accounts',    'tree',      10, '{}'),
  ('journal_entries',      'Journal Entries',       'data_grid', 20, '{}'),
  ('ledger',               'General Ledger',       'data_grid', 30, '{}'),
  ('ar',                   'Accounts Receivable',  'data_grid', 40, '{}'),
  ('ap',                   'Accounts Payable',     'data_grid', 50, '{}'),
  ('vendors',              'Vendors',              'data_grid', 55, '{}'),
  ('invoices',             'Invoices',             'data_grid', 60, '{}'),
  ('payments',             'Payments',             'data_grid', 70, '{}'),
  ('reconciliations',      'Reconciliations',      'data_grid', 80, '{}'),
  ('budgets',              'Budgets',              'dashboard', 85, '{}'),
  ('financial_statements', 'Financial Statements', 'dashboard', 90, '{}'),
  ('controls',             'Controls',             'data_grid', 95, '{}'),
  ('audit_log',            'Audit Log',            'history',   100, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'accounting'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- OPERATIONS CAPABILITIES (8)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('workflows',         'Workflows',         'kanban',    10, '{}'),
  ('sop_library',       'SOP Library',       'data_grid', 20, '{}'),
  ('task_boards',       'Task Boards',       'kanban',    30, '{}'),
  ('kpi_dashboard',     'KPI Dashboard',     'dashboard', 40, '{}'),
  ('vendor_tracker',    'Vendor Tracker',    'data_grid', 50, '{}'),
  ('inventory',         'Inventory',         'data_grid', 60, '{}'),
  ('milestones',        'Milestones',        'timeline',  70, '{}'),
  ('automation_engine', 'Automation Engine', 'data_grid', 80, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'operations'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- PROJECTS CAPABILITIES (8)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('active_projects',      'Active Projects',      'data_grid', 10, '{}'),
  ('gantt',                'Gantt',                'timeline',  20, '{}'),
  ('milestones',           'Milestones',           'timeline',  30, '{}'),
  ('budget_tracking',      'Budget Tracking',      'dashboard', 40, '{}'),
  ('issues',               'Issues',               'kanban',    50, '{}'),
  ('resource_allocation',  'Resource Allocation',  'dashboard', 60, '{}'),
  ('change_orders',        'Change Orders',        'data_grid', 70, '{}'),
  ('reports',              'Reports',              'dashboard', 80, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'projects'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- IT CAPABILITIES (9)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('ticket_queue',     'Ticket Queue',     'kanban',    10, '{}'),
  ('create_ticket',    'Create Ticket',    'form',      20, '{}'),
  ('sla_dashboard',    'SLA Dashboard',    'dashboard', 30, '{}'),
  ('knowledge_base',   'Knowledge Base',   'data_grid', 40, '{}'),
  ('assets',           'Assets',           'data_grid', 50, '{}'),
  ('change_requests',  'Change Requests',  'data_grid', 60, '{}'),
  ('incidents',        'Incidents',        'kanban',    70, '{}'),
  ('automation_rules', 'Automation Rules', 'data_grid', 80, '{}'),
  ('metrics',          'Metrics',          'dashboard', 90, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'it'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- LEGAL CAPABILITIES (9)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('contracts',                'Contracts',                'data_grid', 10, '{}'),
  ('obligations',              'Obligations',              'data_grid', 20, '{}'),
  ('renewals',                 'Renewals',                 'data_grid', 30, '{}'),
  ('regulatory_requirements',  'Regulatory Requirements',  'data_grid', 40, '{}'),
  ('policies',                 'Policies',                 'data_grid', 50, '{}'),
  ('risk_register',            'Risk Register',            'data_grid', 60, '{}'),
  ('evidence_requests',        'Evidence Requests',        'kanban',    70, '{}'),
  ('compliance_tests',         'Compliance Tests',         'data_grid', 80, '{}'),
  ('attestations',             'Attestations',             'data_grid', 90, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'legal'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- HR CAPABILITIES (9)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('employees',           'Employees',           'data_grid', 10, '{}'),
  ('roles',               'Roles',               'data_grid', 20, '{}'),
  ('compensation',        'Compensation',        'data_grid', 30, '{}'),
  ('performance_reviews', 'Performance Reviews', 'data_grid', 40, '{}'),
  ('time_off',            'Time Off',            'data_grid', 50, '{}'),
  ('recruiting',          'Recruiting',          'kanban',    60, '{}'),
  ('onboarding',          'Onboarding',          'kanban',    70, '{}'),
  ('training',            'Training',            'data_grid', 80, '{}'),
  ('org_chart',           'Org Chart',           'tree',      90, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'hr'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- EXECUTIVE CAPABILITIES (7)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('revenue_summary',   'Revenue Summary',   'dashboard', 10, '{}'),
  ('cash_position',     'Cash Position',     'dashboard', 20, '{}'),
  ('risk_heatmap',      'Risk Heatmap',      'dashboard', 30, '{}'),
  ('compliance_status', 'Compliance Status', 'dashboard', 40, '{}'),
  ('sla_performance',   'SLA Performance',   'dashboard', 50, '{}'),
  ('project_health',    'Project Health',    'dashboard', 60, '{}'),
  ('ai_insights',       'AI Insights',       'dashboard', 70, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'executive'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- DOCUMENTS CAPABILITIES (5)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('document_library', 'Document Library', 'data_grid', 10, '{}'),
  ('uploads',          'Uploads',          'form',      20, '{}'),
  ('versions',         'Versions',         'data_grid', 30, '{}'),
  ('categories',       'Categories',       'tree',      40, '{}'),
  ('permissions',      'Permissions',      'data_grid', 50, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'documents'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- ADMIN CAPABILITIES (6)
-- ═══════════════════════════════════════════════════════

INSERT INTO app.capabilities (department_id, key, label, kind, sort_order, metadata_json)
SELECT d.department_id, v.key, v.label, v.kind, v.sort_order, v.metadata_json::jsonb
FROM app.departments d,
(VALUES
  ('user_management',      'User Management',      'data_grid', 10, '{}'),
  ('role_management',      'Role Management',      'data_grid', 20, '{}'),
  ('department_config',    'Department Config',    'data_grid', 30, '{}'),
  ('capability_config',    'Capability Config',    'data_grid', 40, '{}'),
  ('audit_logs',           'Audit Logs',           'history',   50, '{}'),
  ('environment_settings', 'Environment Settings', 'form',      60, '{}')
) AS v(key, label, kind, sort_order, metadata_json)
WHERE d.key = 'admin'
ON CONFLICT (department_id, key) DO UPDATE SET
  label = EXCLUDED.label, kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════
-- UPDATE TEMPLATES
-- ═══════════════════════════════════════════════════════

UPDATE app.templates SET
  departments = '["crm", "accounting", "operations", "hr"]'::jsonb,
  capabilities = '"__all__"'::jsonb
WHERE key = 'starter';

UPDATE app.templates SET
  departments = '["crm", "accounting", "operations", "projects", "hr", "legal"]'::jsonb,
  capabilities = '"__all__"'::jsonb
WHERE key = 'growth';

UPDATE app.templates SET
  departments = '["crm", "accounting", "operations", "projects", "it", "legal", "hr", "executive", "documents", "admin"]'::jsonb,
  capabilities = '"__all__"'::jsonb
WHERE key = 'enterprise';
