-- 609_nv_ai_usage_attribution.sql
-- AI usage attribution + recommendation engine — productizes the cost ledger
-- as a tenant-scoped service. Every AI API call gets logged with full
-- attribution: who, what skill, what workflow, what model, token cost, source.
-- A recommendation engine analyzes the events and writes opportunities.
--
-- Tables:
--   - nv_ai_usage_event     (one row per AI API call, immutable)
--   - nv_ai_recommendation  (detected waste/opportunity, mutable, lifecycle)
--
-- These complement the per-plan ledger in skills/triaged-execution/cost_ledger.py.
-- The skill ledger is a developer-side tool. This schema is the production
-- substrate that powers the customer dashboard at /lab/env/[envId]/ai-usage.
--
-- Idempotent.

-- =============================================================================
-- I. nv_ai_usage_event — per-call ledger, immutable
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_ai_usage_event (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,

    -- WHO + WHERE
    user_email              text,
    business_unit           text,        -- free-text label for the BU (e.g. "plumbing", "equipment_broker")
    source                  text NOT NULL
                            CHECK (source IN ('cowork','cli','api','app','batch','unknown')),
    session_id              text,        -- optional grouping for multi-step plans

    -- WHAT
    skill                   text,        -- skill name if invoked via a skill, else null
    workflow                text,        -- free-text workflow tag (e.g. "vendor_scorecard", "ap_review")
    plan_slug               text,        -- triaged-execution plan slug if applicable
    plan_step               int,         -- step number within the plan
    decision_ref            text,        -- optional pointer to the decision this AI call informed

    -- MODEL CALL
    model                   text NOT NULL
                            CHECK (model IN ('haiku','sonnet','opus','other')),
    model_version           text,        -- e.g. 'haiku-4.5', 'sonnet-4.6'
    cached                  boolean NOT NULL DEFAULT false,
    input_tokens            bigint NOT NULL DEFAULT 0,
    output_tokens           bigint NOT NULL DEFAULT 0,
    thinking_tokens         bigint NOT NULL DEFAULT 0,
    cached_input_tokens     bigint NOT NULL DEFAULT 0,
    duration_ms             int,

    -- COST (computed on insert; cached so reports don't recompute)
    cost_cents              bigint NOT NULL DEFAULT 0,

    -- TIMING
    occurred_at             timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE nv_ai_usage_event IS
    'Immutable per-call AI usage ledger. Captures who/what/model/tokens/cost for every AI API call across Cowork, Claude Code CLI, internal apps, and batch jobs. Owned by ai_usage service.';

CREATE INDEX IF NOT EXISTS idx_nv_ai_usage_event_env_time
    ON nv_ai_usage_event (env_id, business_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_nv_ai_usage_event_skill
    ON nv_ai_usage_event (env_id, business_id, skill, occurred_at DESC)
    WHERE skill IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nv_ai_usage_event_workflow
    ON nv_ai_usage_event (env_id, business_id, workflow, occurred_at DESC)
    WHERE workflow IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nv_ai_usage_event_user
    ON nv_ai_usage_event (env_id, business_id, user_email, occurred_at DESC)
    WHERE user_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nv_ai_usage_event_model
    ON nv_ai_usage_event (env_id, business_id, model, occurred_at DESC);

ALTER TABLE nv_ai_usage_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_ai_usage_event_tenant_isolation ON nv_ai_usage_event;
CREATE POLICY nv_ai_usage_event_tenant_isolation ON nv_ai_usage_event
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- II. nv_ai_recommendation — detected waste or improvement opportunity
-- =============================================================================

CREATE TABLE IF NOT EXISTS nv_ai_recommendation (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  text NOT NULL,
    business_id             uuid NOT NULL,

    -- CLASSIFICATION
    rule_code               text NOT NULL,   -- stable code for the rule, e.g. 'uncached_prefix', 'opus_overspend'
    severity                text NOT NULL
                            CHECK (severity IN ('info','low','medium','high','critical')),
    title                   text NOT NULL,
    body_md                 text NOT NULL,   -- markdown explanation + suggested action

    -- TARGETING (what the rec applies to)
    target_skill            text,
    target_workflow         text,
    target_user_email       text,
    target_model            text,

    -- ECONOMICS
    est_monthly_savings_cents   bigint NOT NULL DEFAULT 0,
    confidence_pct              int NOT NULL DEFAULT 70
                                CHECK (confidence_pct BETWEEN 0 AND 100),

    -- LIFECYCLE
    state                   text NOT NULL
                            CHECK (state IN ('open','dismissed','applied','expired'))
                            DEFAULT 'open',
    dismissed_reason        text,
    applied_at              timestamptz,
    applied_by              text,

    -- SOURCE
    source_query            text,            -- the query the rule used; useful for re-running
    sample_event_ids        uuid[],          -- handful of events that triggered the rec

    first_detected_at       timestamptz NOT NULL DEFAULT now(),
    last_detected_at        timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    UNIQUE (env_id, business_id, rule_code, target_skill, target_workflow, target_user_email)
);

COMMENT ON TABLE nv_ai_recommendation IS
    'Detected waste or improvement opportunities surfaced by the recommendation engine that runs over nv_ai_usage_event. Lifecycle states: open / dismissed / applied / expired. Owned by ai_usage service.';

CREATE INDEX IF NOT EXISTS idx_nv_ai_recommendation_open
    ON nv_ai_recommendation (env_id, business_id, severity, est_monthly_savings_cents DESC)
    WHERE state = 'open';
CREATE INDEX IF NOT EXISTS idx_nv_ai_recommendation_rule
    ON nv_ai_recommendation (env_id, business_id, rule_code, last_detected_at DESC);

ALTER TABLE nv_ai_recommendation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nv_ai_recommendation_tenant_isolation ON nv_ai_recommendation;
CREATE POLICY nv_ai_recommendation_tenant_isolation ON nv_ai_recommendation
    USING (
        env_id = current_setting('app.env_id', true)
        OR current_setting('app.env_id', true) IS NULL
    );

-- =============================================================================
-- III. Convenience views for the dashboard
-- =============================================================================

CREATE OR REPLACE VIEW nv_ai_usage_daily AS
SELECT
    env_id,
    business_id,
    date_trunc('day', occurred_at)::date AS day,
    model,
    business_unit,
    count(*)                              AS calls,
    sum(input_tokens)                     AS input_tokens,
    sum(output_tokens)                    AS output_tokens,
    sum(thinking_tokens)                  AS thinking_tokens,
    sum(cost_cents)                       AS cost_cents
FROM nv_ai_usage_event
GROUP BY 1, 2, 3, 4, 5;

COMMENT ON VIEW nv_ai_usage_daily IS
    'Daily roll-up of AI usage by model + business unit. Drives the dashboard timeline.';

CREATE OR REPLACE VIEW nv_ai_usage_by_skill AS
SELECT
    env_id,
    business_id,
    skill,
    count(*)                              AS calls,
    sum(input_tokens + thinking_tokens)   AS billed_input_tokens,
    sum(output_tokens)                    AS output_tokens,
    sum(cost_cents)                       AS cost_cents,
    avg(duration_ms)::int                 AS avg_duration_ms,
    min(occurred_at)                      AS first_seen,
    max(occurred_at)                      AS last_seen
FROM nv_ai_usage_event
WHERE skill IS NOT NULL
GROUP BY 1, 2, 3;

COMMENT ON VIEW nv_ai_usage_by_skill IS
    'Per-skill spend breakdown. Surfaces hot skills that warrant caching, downgrading, or splitting.';
