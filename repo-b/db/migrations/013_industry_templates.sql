-- Migration 013: Replace generic templates with industry-specific ones.
-- Removes starter/growth/enterprise; inserts real_estate_pe and digital_media.

-- Remove the three generic templates (and any snapshot rows referencing them)
DELETE FROM app.business_template_snapshot
  WHERE template_key IN ('starter', 'growth', 'enterprise');

DELETE FROM app.templates
  WHERE key IN ('starter', 'growth', 'enterprise');

-- Insert industry-specific templates
INSERT INTO app.templates (key, label, description, departments, capabilities) VALUES
(
  'real_estate_pe',
  'Real Estate Private Equity',
  'Full REPE platform: fund management, underwriting, waterfall, compliance, and reporting.',
  '["projects", "accounting", "crm", "waterfall", "underwriting", "reporting", "compliance", "documents"]'::jsonb,
  '"__all__"'::jsonb
),
(
  'digital_media',
  'Digital Media / Website (Floyorker)',
  'Content-first platform: publishing, rankings, analytics, CRM, reporting, and documents.',
  '["projects", "accounting", "crm", "content", "rankings", "reporting", "analytics", "documents"]'::jsonb,
  '"__all__"'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  label        = EXCLUDED.label,
  description  = EXCLUDED.description,
  departments  = EXCLUDED.departments,
  capabilities = EXCLUDED.capabilities;
