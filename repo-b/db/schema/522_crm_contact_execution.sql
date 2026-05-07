-- 522_crm_contact_execution.sql
-- Contacts as execution engine: junction table, enforcement columns, execution cockpit fields.
-- Module: consulting_revenue_os

-- 1. Explicit M:M deal-contact junction (the missing relational primitive)
CREATE TABLE IF NOT EXISTS cro_opportunity_contact (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              text NOT NULL,
  business_id         uuid NOT NULL,
  crm_opportunity_id  uuid NOT NULL REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE CASCADE,
  crm_contact_id      uuid NOT NULL REFERENCES crm_contact(crm_contact_id) ON DELETE CASCADE,
  role_on_deal        text,           -- 'champion','decision_maker','influencer','blocker','user'
  influence_level     text,           -- 'high','medium','low'
  is_primary          boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  link_source         text,           -- 'contacts_surface','deal_panel','email_sync','manual'
  link_confidence     numeric(5,4),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crm_opportunity_id, crm_contact_id)
);

ALTER TABLE cro_opportunity_contact ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cro_opportunity_contact'
      AND policyname = 'cro_opportunity_contact_tenant'
  ) THEN
    EXECUTE 'CREATE POLICY cro_opportunity_contact_tenant ON cro_opportunity_contact
      USING (env_id = current_setting(''app.env_id'', true))';
  END IF;
END $$;

COMMENT ON TABLE cro_opportunity_contact IS
  'Explicit M:M deal-contact links. Replaces account-membership inference for execution-grade contact mapping. Module: consulting_revenue_os.';

CREATE INDEX IF NOT EXISTS idx_cro_opp_contact_opp
  ON cro_opportunity_contact (crm_opportunity_id);

CREATE INDEX IF NOT EXISTS idx_cro_opp_contact_contact
  ON cro_opportunity_contact (crm_contact_id);

-- 2. crm_contact: enrichment metadata + execution enforcement columns
ALTER TABLE crm_contact
  ADD COLUMN IF NOT EXISTS email_domain        text,
  ADD COLUMN IF NOT EXISTS department          text,
  ADD COLUMN IF NOT EXISTS seniority           text,
  ADD COLUMN IF NOT EXISTS source_system       text,
  ADD COLUMN IF NOT EXISTS source_ref          text,
  ADD COLUMN IF NOT EXISTS enrichment_status   text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_enriched_at    timestamptz,
  ADD COLUMN IF NOT EXISTS persona_tags        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS buying_roles        jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS unassigned_reason   text,
  ADD COLUMN IF NOT EXISTS execution_status    text NOT NULL DEFAULT 'needs_action';

COMMENT ON COLUMN crm_contact.execution_status IS
  'Computed enforcement state: needs_action | active | do_not_contact. Set by evaluate_contact_execution_status().';

COMMENT ON COLUMN crm_contact.unassigned_reason IS
  'Required when contact has no linked deal and is not do_not_contact. Documents why contact is unassigned.';

CREATE INDEX IF NOT EXISTS idx_crm_contact_execution_status
  ON crm_contact (execution_status);

-- 3. cro_contact_profile: execution cockpit columns
ALTER TABLE cro_contact_profile
  ADD COLUMN IF NOT EXISTS preferred_channel   text,
  ADD COLUMN IF NOT EXISTS influence_score     int,
  ADD COLUMN IF NOT EXISTS reachability_score  int,
  ADD COLUMN IF NOT EXISTS buyer_persona       text,
  ADD COLUMN IF NOT EXISTS headline            text,
  ADD COLUMN IF NOT EXISTS linkedin_slug       text,
  ADD COLUMN IF NOT EXISTS do_not_contact      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_owner       text;
