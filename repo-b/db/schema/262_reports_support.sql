-- 262_reports_support.sql
-- Support tables for reporting lineage against app-provisioning state.

CREATE TABLE IF NOT EXISTS app.business_template_snapshot (
  business_id         uuid PRIMARY KEY REFERENCES business(business_id) ON DELETE CASCADE,
  template_key        text NOT NULL,
  expected_departments text[] NOT NULL DEFAULT '{}',
  expected_capabilities text[] NOT NULL DEFAULT '{}',
  captured_at         timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_template_snapshot_template_idx
  ON app.business_template_snapshot (template_key);
