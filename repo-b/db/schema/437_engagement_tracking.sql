-- 437_engagement_tracking.sql
-- Engagement tracking: email open/click tracking for outreach logs.
-- Adds open/click columns to cro_outreach_log and a new event table for pixel hits.

-- ── Extend cro_outreach_log with tracking columns ───────────────────────────

ALTER TABLE cro_outreach_log ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE cro_outreach_log ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE cro_outreach_log ADD COLUMN IF NOT EXISTS link_clicks INT DEFAULT 0;

-- ── Engagement event table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_engagement_event (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          TEXT NOT NULL,
    business_id     UUID NOT NULL,
    tracking_id     UUID NOT NULL,
    event_type      TEXT NOT NULL CHECK (event_type IN ('open', 'click')),
    target_url      TEXT,
    ip_address      TEXT,
    user_agent      TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cro_engagement_event ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY cro_engagement_event_tenant_isolation
        ON cro_engagement_event
        FOR ALL
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE cro_engagement_event IS 'Tracks email open (pixel) and click (redirect) events for outreach engagement analytics. Owned by consulting-revenue-os.';

-- Index for fast lookup by tracking_id
CREATE INDEX IF NOT EXISTS idx_cro_engagement_event_tracking_id
    ON cro_engagement_event (tracking_id);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_cro_engagement_event_occurred_at
    ON cro_engagement_event (env_id, occurred_at DESC);
