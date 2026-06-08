-- 612_outreach_personalizer_opportunity_link.sql
-- Outreach Personalizer Phase 2C: explicit crm_opportunity link on
-- cro_outreach_target so the operator can safely advance an opportunity's
-- pipeline stage. crm_opportunity has no account-cardinality constraint
-- (no UNIQUE on (business_id, crm_account_id), no partial unique on
-- status='open'), so deriving the link from crm_account_id is unsafe.
-- See docs/plans/03-implementation-plans/active/0003-outreach-personalizer-microsite.md.
--
-- Additive only. Idempotent. No destructive ALTERs. Cross-business safety
-- (opportunity.business_id == target.business_id) is enforced at the
-- application layer in op_db.crm_opportunity_exists + crm_svc.move_opportunity_stage.
--
-- Depends on: 260_crm_native (crm_opportunity), 611_outreach_personalizer.

BEGIN;

ALTER TABLE cro_outreach_target
    ADD COLUMN IF NOT EXISTS crm_opportunity_id uuid
    REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cro_outreach_target_opp
    ON cro_outreach_target (crm_opportunity_id)
    WHERE crm_opportunity_id IS NOT NULL;

-- Defense-in-depth: an opportunity cannot be linked without an account.
-- Allows (NULL, NULL), (NULL, X), (X, Y) — rejects only (opp, NULL).
-- The route layer short-circuits this case with a specific operator message
-- ("Clear the linked CRM opportunity before clearing the CRM account.")
-- so the constraint should never actually fire in practice.
DO $$ BEGIN
    ALTER TABLE cro_outreach_target
        ADD CONSTRAINT cro_outreach_target_opp_requires_account
        CHECK (crm_opportunity_id IS NULL OR crm_account_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN cro_outreach_target.crm_opportunity_id IS
  'Explicit FK to the crm_opportunity this outreach target is linked to. Required for pipeline advancement; must belong to the same business_id (enforced at app layer). Phase 2C.';

COMMIT;
