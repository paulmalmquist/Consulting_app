-- 605_engagement_routing.sql
-- Engagement Routing: control layer for how work becomes Novendor revenue.
-- Extends cro_engagement and cro_revenue_schedule with routing fields, and
-- adds three sibling tables: cro_engagement_contract (executed contracts),
-- cro_engagement_attribution (credit + economics splits), and
-- cro_engagement_event (timeline).
--
-- Design rules:
--   - Additive only. No destructive ALTERs. No nullability changes on existing
--     columns. Existing INSERTs and reads in cro_engagements / cro_revenue
--     services continue to work.
--   - Personal-vs-Novendor compounding signal lives in contracting_entity,
--     not in the absence of a cro_client row. Engagements always have a
--     client_id; the seed creates synthetic accounts/clients for personal
--     deals.
--
-- Depends on: 260_crm_native (crm_account, crm_opportunity FKs),
--             280_consulting_revenue_os (cro_engagement, cro_revenue_schedule),
--             525_execution_board (cro_execution_task FK for next_action_task_id).

BEGIN;

-- ── cro_engagement: routing columns ─────────────────────────────────────────

ALTER TABLE cro_engagement
    ADD COLUMN IF NOT EXISTS contracting_entity            text NOT NULL DEFAULT 'Novendor LLC',
    ADD COLUMN IF NOT EXISTS originated_by_user_id         text,
    ADD COLUMN IF NOT EXISTS relationship_owner_user_id    text,
    ADD COLUMN IF NOT EXISTS delivery_owner_user_id        text,
    ADD COLUMN IF NOT EXISTS lead_source                   text,
    ADD COLUMN IF NOT EXISTS routing_status                text NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS current_pain                  text,
    ADD COLUMN IF NOT EXISTS what_winston_replaces         text,
    ADD COLUMN IF NOT EXISTS expected_roi_angle            text,
    ADD COLUMN IF NOT EXISTS marketing_permission_status   text NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS next_action_task_id           uuid,
    ADD COLUMN IF NOT EXISTS next_action_text              text,
    ADD COLUMN IF NOT EXISTS next_action_due_date          date,
    ADD COLUMN IF NOT EXISTS source_deal_id                uuid,
    ADD COLUMN IF NOT EXISTS client_name_override          text;

-- Add FK to cro_execution_task for next-action linkage. ON DELETE SET NULL
-- so completing/deleting a task doesn't cascade-delete the engagement.
DO $$ BEGIN
    ALTER TABLE cro_engagement
        ADD CONSTRAINT cro_engagement_next_action_task_fk
        FOREIGN KEY (next_action_task_id)
        REFERENCES cro_execution_task(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cro_engagement
        ADD CONSTRAINT cro_engagement_source_deal_fk
        FOREIGN KEY (source_deal_id)
        REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Routing status enum constraint (separate from existing status column).
DO $$ BEGIN
    ALTER TABLE cro_engagement
        ADD CONSTRAINT cro_engagement_routing_status_check
        CHECK (routing_status IN (
            'draft', 'routing_review', 'active', 'paused',
            'renewal_risk', 'closed', 'lost'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cro_engagement
        ADD CONSTRAINT cro_engagement_lead_source_check
        CHECK (lead_source IS NULL OR lead_source IN (
            'inbound', 'referral', 'personal_network', 'outbound',
            'partner_originated', 'existing_relationship', 'marketplace', 'other'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cro_engagement
        ADD CONSTRAINT cro_engagement_marketing_perm_check
        CHECK (marketing_permission_status IN (
            'unknown', 'internal_only', 'anonymized',
            'approved_logo', 'approved_case_study'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_engagement_routing_status
    ON cro_engagement (env_id, routing_status);

CREATE INDEX IF NOT EXISTS idx_cro_engagement_contracting_entity
    ON cro_engagement (env_id, contracting_entity);

CREATE INDEX IF NOT EXISTS idx_cro_engagement_relationship_owner
    ON cro_engagement (env_id, relationship_owner_user_id);

CREATE INDEX IF NOT EXISTS idx_cro_engagement_source_deal
    ON cro_engagement (env_id, source_deal_id);

COMMENT ON COLUMN cro_engagement.contracting_entity IS
    'The legal entity contracting this engagement. "Novendor LLC" means the work compounds Novendor; anything else is personal/non-compounding.';

COMMENT ON COLUMN cro_engagement.routing_status IS
    'Engagement Routing workflow state. Separate from cro_engagement.status (delivery state).';

COMMENT ON COLUMN cro_engagement.client_name_override IS
    'Display name shown in routing UI when the linked cro_client name is not the right label (e.g., contractor-role engagements).';

-- ── cro_revenue_schedule: revenue stream columns ────────────────────────────
-- Existing semantics (amount, period_date, invoice_status, invoiced_at, paid_at,
-- notes, currency) are preserved. New columns are additive and nullable.

ALTER TABLE cro_revenue_schedule
    ADD COLUMN IF NOT EXISTS revenue_type           text,
    ADD COLUMN IF NOT EXISTS hourly_rate            numeric(28,12),
    ADD COLUMN IF NOT EXISTS estimated_hours        numeric(28,12),
    ADD COLUMN IF NOT EXISTS retainer_amount        numeric(28,12),
    ADD COLUMN IF NOT EXISTS total_contract_value   numeric(28,12),
    ADD COLUMN IF NOT EXISTS billing_frequency      text,
    ADD COLUMN IF NOT EXISTS margin_split_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS start_date             date,
    ADD COLUMN IF NOT EXISTS end_date               date,
    ADD COLUMN IF NOT EXISTS revenue_notes          text,
    ADD COLUMN IF NOT EXISTS invoice_number         text,
    ADD COLUMN IF NOT EXISTS due_date               date,
    ADD COLUMN IF NOT EXISTS is_revenue_stream      boolean NOT NULL DEFAULT false;

DO $$ BEGIN
    ALTER TABLE cro_revenue_schedule
        ADD CONSTRAINT cro_revenue_schedule_revenue_type_check
        CHECK (revenue_type IS NULL OR revenue_type IN (
            'fixed', 'hourly', 'retainer', 'milestone', 'success_fee', 'hybrid'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE cro_revenue_schedule
        ADD CONSTRAINT cro_revenue_schedule_billing_freq_check
        CHECK (billing_frequency IS NULL OR billing_frequency IN (
            'once', 'weekly', 'monthly', 'quarterly', 'milestone', 'ad_hoc'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_revenue_schedule_stream
    ON cro_revenue_schedule (env_id, engagement_id)
    WHERE is_revenue_stream = true;

COMMENT ON COLUMN cro_revenue_schedule.is_revenue_stream IS
    'When true, this row represents a revenue stream (full contract metadata) for Engagement Routing. When false, it is a legacy scheduled-amount entry. Existing dashboards continue to read both.';

-- ── cro_engagement_contract ─────────────────────────────────────────────────
-- Models the executed contract layer. cro_proposal handles the sales stage;
-- this table captures MSA/SOW/amendment lifecycle once contracting begins.

CREATE TABLE IF NOT EXISTS cro_engagement_contract (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    engagement_id       uuid NOT NULL REFERENCES cro_engagement(id) ON DELETE CASCADE,
    contract_type       text NOT NULL CHECK (contract_type IN (
        'MSA', 'SOW', 'amendment', 'contractor_agreement',
        'subcontractor_agreement', 'NDA', 'other'
    )),
    status              text NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'sent', 'partially_signed', 'fully_signed', 'expired', 'superseded'
    )),
    signed_by_client    boolean NOT NULL DEFAULT false,
    signed_by_novendor  boolean NOT NULL DEFAULT false,
    effective_date      date,
    expiration_date     date,
    file_url            text,
    file_storage_key    text,
    billing_terms       text,
    legal_notes         text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cro_engagement_contract ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_engagement_contract_tenant ON cro_engagement_contract
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_engagement_contract_engagement
    ON cro_engagement_contract (env_id, engagement_id, status);

COMMENT ON TABLE cro_engagement_contract IS
    'Executed contract records for engagements (MSA/SOW/amendments/etc). Owned by Engagement Routing module. Sits alongside cro_proposal: proposals are sales-stage; contracts are post-acceptance execution records.';

-- ── cro_engagement_attribution ──────────────────────────────────────────────
-- Credit attribution and economics splits are kept as separate percentages so
-- "who gets credit" and "who gets paid" can diverge.

CREATE TABLE IF NOT EXISTS cro_engagement_attribution (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    engagement_id           uuid NOT NULL REFERENCES cro_engagement(id) ON DELETE CASCADE,
    user_id                 text,
    operator_name           text,
    role                    text NOT NULL CHECK (role IN (
        'originator', 'seller', 'relationship_owner', 'delivery_owner',
        'delivery_support', 'partner', 'admin_support'
    )),
    credit_percentage       numeric(6,4),
    economics_percentage    numeric(6,4),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (credit_percentage IS NULL OR (credit_percentage >= 0 AND credit_percentage <= 1)),
    CHECK (economics_percentage IS NULL OR (economics_percentage >= 0 AND economics_percentage <= 1))
);

ALTER TABLE cro_engagement_attribution ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_engagement_attribution_tenant ON cro_engagement_attribution
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_engagement_attribution_engagement
    ON cro_engagement_attribution (env_id, engagement_id);

CREATE INDEX IF NOT EXISTS idx_cro_engagement_attribution_user
    ON cro_engagement_attribution (env_id, user_id)
    WHERE user_id IS NOT NULL;

COMMENT ON TABLE cro_engagement_attribution IS
    'Credit attribution and economics splits per engagement. credit_percentage answers "who gets credit"; economics_percentage answers "who gets paid". They can diverge.';

-- ── cro_routing_event ───────────────────────────────────────────────────────
-- Timeline of routing-relevant events. Powers the right-rail recent-activity
-- and the detail-page timeline section.
-- Note: cro_engagement_event (437) is the email-tracking table; this table is
-- the routing timeline and uses a distinct name to avoid collision.

CREATE TABLE IF NOT EXISTS cro_routing_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    engagement_id   uuid NOT NULL REFERENCES cro_engagement(id) ON DELETE CASCADE,
    event_type      text NOT NULL CHECK (event_type IN (
        'created', 'converted_from_deal', 'contract_added', 'contract_signed',
        'revenue_defined', 'invoice_added', 'invoice_sent', 'invoice_paid',
        'attribution_changed', 'routing_health_changed', 'routing_status_changed',
        'note_added', 'case_study_flagged', 'next_action_set'
    )),
    event_date      timestamptz NOT NULL DEFAULT now(),
    actor_user_id   text,
    summary         text NOT NULL,
    metadata_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cro_routing_event ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_routing_event_tenant ON cro_routing_event
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_routing_event_engagement
    ON cro_routing_event (env_id, engagement_id, event_date DESC);

COMMENT ON TABLE cro_routing_event IS
    'Timeline of routing-relevant events per engagement. Powers the detail timeline and right-rail recent-activity. Owned by Engagement Routing module.';

COMMIT;
