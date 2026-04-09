-- 457_pipeline_operator_layer.sql
-- Agentic Kanban operator layer for consulting pipeline execution.

CREATE TABLE IF NOT EXISTS cro_execution_profile (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              TEXT NOT NULL,
    business_id         UUID NOT NULL,
    crm_opportunity_id  UUID NOT NULL REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE CASCADE,
    personas            JSONB NOT NULL DEFAULT '[]'::jsonb,
    pain_hypothesis     TEXT,
    value_prop          TEXT,
    demo_angle          TEXT,
    priority_score      INT NOT NULL DEFAULT 50 CHECK (priority_score BETWEEN 0 AND 100),
    engagement_summary  TEXT,
    execution_pressure  TEXT NOT NULL DEFAULT 'medium' CHECK (execution_pressure IN ('low', 'medium', 'high', 'critical')),
    momentum_status     TEXT NOT NULL DEFAULT 'flat' CHECK (momentum_status IN ('increasing', 'flat', 'declining')),
    risk_flags          JSONB NOT NULL DEFAULT '[]'::jsonb,
    deal_drift_status   TEXT NOT NULL DEFAULT 'stable' CHECK (deal_drift_status IN ('stable', 'drifting', 'at_risk')),
    deal_playbook       JSONB NOT NULL DEFAULT '{}'::jsonb,
    auto_draft_stack    JSONB NOT NULL DEFAULT '{}'::jsonb,
    execution_state     JSONB NOT NULL DEFAULT '{}'::jsonb,
    narrative_memory    JSONB NOT NULL DEFAULT '{}'::jsonb,
    snoozed_until       TIMESTAMPTZ,
    snooze_reason       TEXT,
    last_ai_generated_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (crm_opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_cro_execution_profile_env_business
    ON cro_execution_profile (env_id, business_id);

CREATE INDEX IF NOT EXISTS idx_cro_execution_profile_pressure
    ON cro_execution_profile (business_id, execution_pressure, updated_at DESC);

ALTER TABLE cro_execution_profile ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY cro_execution_profile_tenant_isolation
        ON cro_execution_profile
        FOR ALL
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cro_execution_audit (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              TEXT NOT NULL,
    business_id         UUID NOT NULL,
    crm_opportunity_id  UUID REFERENCES crm_opportunity(crm_opportunity_id) ON DELETE SET NULL,
    crm_account_id      UUID REFERENCES crm_account(crm_account_id) ON DELETE SET NULL,
    event_type          TEXT NOT NULL,
    actor               TEXT,
    command_text        TEXT,
    requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at        TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending_confirmation', 'completed', 'cancelled', 'failed')),
    payload_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cro_execution_audit_opp
    ON cro_execution_audit (crm_opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cro_execution_audit_business
    ON cro_execution_audit (env_id, business_id, created_at DESC);

ALTER TABLE cro_execution_audit ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY cro_execution_audit_tenant_isolation
        ON cro_execution_audit
        FOR ALL
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
