-- 460_cro_app_intelligence_mining.sql
-- App Intelligence / Opportunity Mining for the Novendor consulting workspace.
-- This module captures raw app research, extracts only actionable workflow + pain
-- structure, and clusters repeated opportunities into compact patterns.
--
-- NOTE: `cro_app_pattern` is intentionally NOT a replacement for `epi_pattern`.
-- They differ in tenancy contract (`env_id text` vs `uuid`), audience, lifecycle,
-- and allowed field shape. Do not join them directly.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── cro_app_inbox_item ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_app_inbox_item (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    source              text CHECK (source IN ('app_store', 'g2', 'capterra', 'website', 'manual')),
    platform            text CHECK (platform IN ('ios', 'android', 'web')),
    app_name            text NOT NULL,
    category            text,
    search_term         text,
    url                 text,
    raw_notes           text,
    screenshot_urls     text[] NOT NULL DEFAULT '{}',
    status              text NOT NULL DEFAULT 'raw'
                        CHECK (status IN ('raw', 'extracted', 'discarded')),
    discarded_reason    text,
    discarded_at        timestamptz,
    processed_at        timestamptz,
    created_by          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'discarded' OR discarded_reason IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cro_app_inbox_item_business_url_active
    ON cro_app_inbox_item (business_id, url)
    WHERE status <> 'discarded' AND url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cro_app_inbox_item_env_status_created
    ON cro_app_inbox_item (env_id, business_id, status, created_at DESC);

ALTER TABLE cro_app_inbox_item ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_app_inbox_item_tenant ON cro_app_inbox_item
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE cro_app_inbox_item IS
    'Transient raw app captures for Novendor App Intelligence. Owned by consulting research module.';

-- ── cro_app_record ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_app_record (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,
    inbox_item_id           uuid REFERENCES cro_app_inbox_item(id) ON DELETE SET NULL,
    app_name                text NOT NULL,
    target_user             text,
    core_workflow_input     text NOT NULL,
    core_workflow_process   text NOT NULL,
    core_workflow_output    text NOT NULL,
    pain_signals            text[] NOT NULL DEFAULT '{}',
    relevance_score         numeric(5,2) NOT NULL DEFAULT 50 CHECK (relevance_score BETWEEN 0 AND 100),
    weakness_score          numeric(5,2) NOT NULL DEFAULT 50 CHECK (weakness_score BETWEEN 0 AND 100),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cro_app_record_env_scores
    ON cro_app_record (env_id, business_id, relevance_score DESC, weakness_score DESC);

CREATE INDEX IF NOT EXISTS idx_cro_app_record_inbox_item
    ON cro_app_record (inbox_item_id);

ALTER TABLE cro_app_record ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_app_record_tenant ON cro_app_record
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE cro_app_record IS
    'Trimmed extracted app records with workflow input/process/output plus pain signals for conversion work.';

-- ── cro_app_pattern ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_app_pattern (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                          text NOT NULL,
    business_id                     uuid NOT NULL,
    pattern_name                    text NOT NULL,
    workflow_shape                  text,
    industries_seen_in              text[] NOT NULL DEFAULT '{}',
    recurring_pain                  text,
    bad_implementation_pattern      text,
    winston_module_opportunity      text,
    consulting_offer_opportunity    text,
    demo_idea                       text,
    priority                        text NOT NULL DEFAULT 'med'
                                    CHECK (priority IN ('low', 'med', 'high')),
    confidence                      numeric(3,2) NOT NULL DEFAULT 0.5
                                    CHECK (confidence BETWEEN 0 AND 1),
    status                          text NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'active', 'archived')),
    notes                           text,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cro_app_pattern_env_priority
    ON cro_app_pattern (env_id, business_id, priority, confidence DESC, updated_at DESC);

ALTER TABLE cro_app_pattern ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_app_pattern_tenant ON cro_app_pattern
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE cro_app_pattern IS
    'High-signal reusable workflow patterns mined from app records for Winston backlog, offers, outreach, and demos.';

-- ── cro_app_pattern_evidence ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_app_pattern_evidence (
    pattern_id           uuid NOT NULL REFERENCES cro_app_pattern(id) ON DELETE CASCADE,
    app_record_id        uuid NOT NULL REFERENCES cro_app_record(id) ON DELETE CASCADE,
    contribution_note    text,
    auto_suggested       boolean NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (pattern_id, app_record_id)
);

CREATE INDEX IF NOT EXISTS idx_cro_app_pattern_evidence_record
    ON cro_app_pattern_evidence (app_record_id, created_at DESC);

ALTER TABLE cro_app_pattern_evidence ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_app_pattern_evidence_tenant ON cro_app_pattern_evidence
        USING (
            EXISTS (
                SELECT 1
                FROM cro_app_pattern p
                WHERE p.id = pattern_id
                  AND p.env_id = current_setting('app.env_id', true)
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1
                FROM cro_app_pattern p
                WHERE p.id = pattern_id
                  AND p.env_id = current_setting('app.env_id', true)
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE cro_app_pattern_evidence IS
    'Many-to-many evidence links between extracted app records and mined opportunity patterns.';
