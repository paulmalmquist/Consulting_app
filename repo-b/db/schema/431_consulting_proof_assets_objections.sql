-- 431_consulting_proof_assets_objections.sql
-- Adds proof-asset tracking, objection/product-feedback log, and demo readiness
-- for the Novendor Consulting Revenue OS environment.
-- Depends on: 260_crm_native (crm_account FK)

-- ── cro_proof_asset ─────────────────────────────────────────────────────────
-- Reusable collateral items: questionnaires, offer sheets, workflow examples.
-- Unlike cro_deliverable (per-lead), these are org-wide proof materials.

CREATE TABLE IF NOT EXISTS cro_proof_asset (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    asset_type          text NOT NULL CHECK (asset_type IN (
        'diagnostic_questionnaire', 'offer_sheet', 'workflow_example',
        'case_study', 'roi_calculator', 'demo_script', 'competitive_comparison', 'other'
    )),
    title               text NOT NULL,
    description         text,
    status              text NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'ready', 'needs_update', 'archived'
    )),
    linked_offer_type   text,
    file_path           text,
    content_markdown    text,
    last_used_at        timestamptz,
    use_count           int NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cro_proof_asset ENABLE ROW LEVEL SECURITY;
CREATE POLICY cro_proof_asset_tenant ON cro_proof_asset
    USING (env_id = current_setting('app.env_id', true));

CREATE INDEX idx_cro_proof_asset_env ON cro_proof_asset (env_id, business_id);
CREATE INDEX idx_cro_proof_asset_status ON cro_proof_asset (env_id, status);

COMMENT ON TABLE cro_proof_asset IS
    'Reusable proof collateral (questionnaires, offer sheets, workflow examples) for the Consulting Revenue OS. Owned by consulting module.';

-- ── cro_objection ───────────────────────────────────────────────────────────
-- Product feedback and objection tracking tied to accounts/opportunities.

CREATE TABLE IF NOT EXISTS cro_objection (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    crm_account_id      uuid REFERENCES crm_account(crm_account_id) ON DELETE SET NULL,
    crm_opportunity_id  uuid,
    objection_type      text NOT NULL CHECK (objection_type IN (
        'pricing', 'timing', 'authority', 'need', 'competition',
        'trust', 'technical', 'integration', 'other'
    )),
    summary             text NOT NULL,
    source_conversation text,
    response_strategy   text,
    confidence          int CHECK (confidence BETWEEN 1 AND 5),
    outcome             text DEFAULT 'pending' CHECK (outcome IN (
        'overcome', 'deferred', 'lost', 'pending'
    )),
    linked_feature_gap  text,
    linked_offer_type   text,
    detected_at         timestamptz NOT NULL DEFAULT now(),
    resolved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cro_objection ENABLE ROW LEVEL SECURITY;
CREATE POLICY cro_objection_tenant ON cro_objection
    USING (env_id = current_setting('app.env_id', true));

CREATE INDEX idx_cro_objection_env ON cro_objection (env_id, business_id);
CREATE INDEX idx_cro_objection_type ON cro_objection (env_id, objection_type);
CREATE INDEX idx_cro_objection_outcome ON cro_objection (env_id, outcome);

COMMENT ON TABLE cro_objection IS
    'Objection and product-feedback log tied to accounts/opportunities. Owned by consulting module.';

-- ── cro_demo_readiness ──────────────────────────────────────────────────────
-- Tracks readiness state per product vertical demo.

CREATE TABLE IF NOT EXISTS cro_demo_readiness (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    demo_name           text NOT NULL,
    vertical            text,
    status              text NOT NULL DEFAULT 'not_started' CHECK (status IN (
        'not_started', 'in_progress', 'ready', 'needs_refresh', 'blocked'
    )),
    blockers            text[] DEFAULT '{}',
    last_tested_at      timestamptz,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, business_id, demo_name)
);

ALTER TABLE cro_demo_readiness ENABLE ROW LEVEL SECURITY;
CREATE POLICY cro_demo_readiness_tenant ON cro_demo_readiness
    USING (env_id = current_setting('app.env_id', true));

CREATE INDEX idx_cro_demo_readiness_env ON cro_demo_readiness (env_id, business_id);

COMMENT ON TABLE cro_demo_readiness IS
    'Demo readiness status per product vertical. Owned by consulting module.';
