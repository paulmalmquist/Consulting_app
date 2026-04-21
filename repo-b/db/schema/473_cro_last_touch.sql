-- 473_cro_last_touch.sql
-- Denormalized last-touch convenience columns on cro_strategic_lead.
-- Avoids per-card lateral joins against cro_outreach_log + crm_activity
-- when rendering the pipeline kanban and right-rail aggregations.
-- Idempotent.

ALTER TABLE cro_strategic_lead
    ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;
ALTER TABLE cro_strategic_lead
    ADD COLUMN IF NOT EXISTS last_touched_by text;
ALTER TABLE cro_strategic_lead
    ADD COLUMN IF NOT EXISTS last_touch_channel text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
         WHERE constraint_name = 'cro_strategic_lead_last_touch_channel_chk'
    ) THEN
        ALTER TABLE cro_strategic_lead
            ADD CONSTRAINT cro_strategic_lead_last_touch_channel_chk
            CHECK (last_touch_channel IN ('email','linkedin','phone','meeting','other','stage_advance','note')
                   OR last_touch_channel IS NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cro_strategic_lead_last_touch
    ON cro_strategic_lead (env_id, business_id, last_touch_at DESC NULLS LAST);

COMMENT ON COLUMN cro_strategic_lead.last_touch_at IS
    'Last outbound or inbound touch for this account. Updated by cro_outreach.log_outreach and cro_pipeline.advance_opportunity_stage.';

-- Backfill: seed last_touch_at from existing outreach/activity history.
-- Safe to re-run: only touches rows where last_touch_at IS NULL.
UPDATE cro_strategic_lead sl
   SET last_touch_at = GREATEST(
           COALESCE((SELECT MAX(sent_at) FROM cro_outreach_log ol
                      WHERE ol.crm_account_id = sl.crm_account_id
                        AND ol.business_id = sl.business_id),
                    'epoch'::timestamptz),
           COALESCE((SELECT MAX(activity_at) FROM crm_activity a
                      WHERE a.crm_account_id = sl.crm_account_id
                        AND a.business_id = sl.business_id),
                    'epoch'::timestamptz)
       )
 WHERE sl.last_touch_at IS NULL;

-- Normalize: the GREATEST() above leaves 'epoch' for accounts with no history.
-- Drop those back to NULL so "never touched" is distinguishable.
UPDATE cro_strategic_lead
   SET last_touch_at = NULL
 WHERE last_touch_at = 'epoch'::timestamptz;
