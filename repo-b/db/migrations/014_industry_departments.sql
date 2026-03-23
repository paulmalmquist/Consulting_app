-- Migration 014: Add department rows required by industry-specific templates.
-- These are needed for real_estate_pe and digital_media template module lists.

INSERT INTO app.departments (key, label, icon, sort_order) VALUES
  ('projects',     'Projects',     'folder',      10),
  ('accounting',   'Accounting',   'dollar-sign', 20),
  ('crm',          'CRM',          'users',        30),
  ('waterfall',    'Waterfall',    'trending-up',  40),
  ('underwriting', 'Underwriting', 'search',       50),
  ('reporting',    'Reporting',    'bar-chart',    60),
  ('compliance',   'Compliance',   'shield',       70),
  ('documents',    'Documents',    'folder',       75),
  ('content',      'Content',      'edit',         80),
  ('rankings',     'Rankings',     'star',         90),
  ('analytics',    'Analytics',    'activity',    100)
ON CONFLICT (key) DO NOTHING;
