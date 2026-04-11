-- 461_cro_app_intelligence_converter.sql
-- Converter / money layer for App Intelligence. Turns mined app records and
-- patterns into downstream Winston backlog items, consulting offers, outreach
-- angles, and demo briefs.

-- ── cro_app_opportunity ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_app_opportunity (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    pattern_id          uuid REFERENCES cro_app_pattern(id) ON DELETE SET NULL,
    app_record_id       uuid REFERENCES cro_app_record(id) ON DELETE SET NULL,
    kind                text NOT NULL CHECK (kind IN (
        'winston_backlog', 'consulting_offer', 'outreach_angle', 'demo_brief'
    )),
    title               text NOT NULL,
    payload             jsonb NOT NULL,
    brief_markdown      text,
    status              text NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'ready', 'sent', 'exported', 'discarded'
    )),
    exported_to         text,
    exported_ref        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (pattern_id IS NOT NULL OR app_record_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cro_app_opportunity_env_kind_status
    ON cro_app_opportunity (env_id, business_id, kind, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cro_app_opportunity_record
    ON cro_app_opportunity (app_record_id, kind, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cro_app_opportunity_pattern_kind
    ON cro_app_opportunity (pattern_id, kind)
    WHERE pattern_id IS NOT NULL;

ALTER TABLE cro_app_opportunity ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_app_opportunity_tenant ON cro_app_opportunity
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE cro_app_opportunity IS
    'Canonical outbox for App Intelligence conversions into backlog items, offers, outreach, and demo briefs.';

-- ── cro_app_weekly_memo ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_app_weekly_memo (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                          text NOT NULL,
    business_id                     uuid NOT NULL,
    period_start                    date NOT NULL,
    period_end                      date NOT NULL,
    summary_markdown                text NOT NULL,
    memo_payload                    jsonb NOT NULL,
    generated_at                    timestamptz NOT NULL DEFAULT now(),
    generated_by                    text,
    UNIQUE (business_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_cro_app_weekly_memo_env_period
    ON cro_app_weekly_memo (env_id, business_id, period_start DESC);

ALTER TABLE cro_app_weekly_memo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_app_weekly_memo_tenant ON cro_app_weekly_memo
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE cro_app_weekly_memo IS
    'Action-driven weekly memo for App Intelligence with required pattern, outreach, and demo decisions.';

-- ── cro_outreach_template back-reference ────────────────────────────────────

ALTER TABLE cro_outreach_template
    ADD COLUMN IF NOT EXISTS source_opportunity_id uuid;

DO $$ BEGIN
    ALTER TABLE cro_outreach_template
        ADD CONSTRAINT cro_outreach_template_source_opportunity_fk
        FOREIGN KEY (source_opportunity_id)
        REFERENCES cro_app_opportunity(id)
        ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cro_outreach_template_source_opportunity
    ON cro_outreach_template (source_opportunity_id);
