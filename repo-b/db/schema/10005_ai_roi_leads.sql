-- Public AI ROI intake leads.
--
-- This table is pre-tenant marketing intake. It intentionally has no env_id or
-- business_id because a visitor has not been mapped to a Winston environment.
-- ARCHITECTURE.md records the exemption.

CREATE TABLE IF NOT EXISTS nv_ai_roi_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  email         text NOT NULL,
  company_name  text,
  source        text NOT NULL,
  payload_json  jsonb,
  user_agent    text,
  ip_hash       text
);

ALTER TABLE nv_ai_roi_leads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE nv_ai_roi_leads IS
  'Pre-tenant public intake for the AI ROI reframing exercise, discovery form, and gated resources. '
  'Exempt from env_id/business_id because no environment exists at capture time. '
  'Owning module: repo-b marketing public API.';

