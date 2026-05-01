-- 606_outreach_email_sync.sql
-- Normalized email source messages + Microsoft Graph subscription state for
-- Novendor outreach imports and live mailbox hooks.
-- Depends on: 280_consulting_revenue_os, 525_execution_board, 604_cro_execution_task_re_engage.

CREATE TABLE IF NOT EXISTS cro_email_source_message (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                     text NOT NULL,
    business_id                uuid NOT NULL,
    provider                   text NOT NULL CHECK (provider IN ('gmail','outlook_com','msgraph','outlook_com_backfill','manual')),
    mailbox                    text NOT NULL,
    provider_message_id        text NOT NULL,
    internet_message_id        text,
    thread_id                  text,
    logical_dedupe_hash        text NOT NULL,
    direction                  text NOT NULL CHECK (direction IN ('outbound','inbound')),
    message_ts                 timestamptz NOT NULL,
    sender_email               text NOT NULL,
    sender_name                text,
    to_emails                  text[] NOT NULL DEFAULT '{}'::text[],
    cc_emails                  text[] NOT NULL DEFAULT '{}'::text[],
    subject                    text,
    body_preview               text,
    has_attachments            boolean NOT NULL DEFAULT false,
    attachment_names           text[] NOT NULL DEFAULT '{}'::text[],
    raw_metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
    crm_account_id             uuid REFERENCES crm_account(crm_account_id) ON DELETE SET NULL,
    crm_contact_id             uuid REFERENCES crm_contact(crm_contact_id) ON DELETE SET NULL,
    crm_opportunity_id         uuid REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE SET NULL,
    outreach_log_id            uuid REFERENCES cro_outreach_log(id) ON DELETE SET NULL,
    execution_task_id          uuid REFERENCES cro_execution_task(id) ON DELETE SET NULL,
    duplicate_of_source_id     uuid REFERENCES cro_email_source_message(id) ON DELETE SET NULL,
    status                     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','imported','ignored','error')),
    error                      text,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, mailbox, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_cro_email_source_env_hash
    ON cro_email_source_message (env_id, business_id, logical_dedupe_hash);

CREATE INDEX IF NOT EXISTS idx_cro_email_source_account_ts
    ON cro_email_source_message (crm_account_id, message_ts DESC);

CREATE INDEX IF NOT EXISTS idx_cro_email_source_status
    ON cro_email_source_message (env_id, business_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS cro_email_sync_subscription (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                     text NOT NULL,
    business_id                uuid NOT NULL,
    provider                   text NOT NULL DEFAULT 'msgraph' CHECK (provider IN ('msgraph')),
    mailbox                    text NOT NULL,
    graph_user_id              text,
    subscription_id            text UNIQUE,
    resource                   text NOT NULL,
    change_type                text NOT NULL DEFAULT 'created',
    client_state_hash          text,
    notification_url           text NOT NULL,
    lifecycle_notification_url text,
    expiration_at              timestamptz,
    status                     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','removed','error')),
    last_renewed_at            timestamptz,
    last_notification_at       timestamptz,
    cursor_delta_link          text,
    error                      text,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cro_email_sync_subscription_mailbox
    ON cro_email_sync_subscription (provider, mailbox, status);

CREATE INDEX IF NOT EXISTS idx_cro_email_sync_subscription_expiration
    ON cro_email_sync_subscription (expiration_at)
    WHERE status = 'active';

-- Keep email-triggered reply tasks idempotent through the existing open-task
-- unique index on (env_id, auto_source, auto_source_ref).
DO $$ BEGIN
    ALTER TABLE cro_execution_task DROP CONSTRAINT IF EXISTS cro_execution_task_auto_source_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE cro_execution_task
    ADD CONSTRAINT cro_execution_task_auto_source_check
    CHECK (auto_source IS NULL OR auto_source IN (
        'pipeline_no_next_action',
        'pipeline_stale_3d',
        'pipeline_no_outreach',
        'pipeline_proposal_sent_no_followup',
        'outreach_no_reply_2d',
        'email_inbound_reply',
        'proof_backlog_top',
        'quick_capture',
        'manual',
        'ai_generated'
    ));

COMMENT ON TABLE cro_email_source_message IS
    'Provider-normalized email source records feeding Novendor outreach logs and email-triggered tasks.';

COMMENT ON TABLE cro_email_sync_subscription IS
    'Microsoft Graph mailbox subscription state for live Novendor outreach email hooks.';
