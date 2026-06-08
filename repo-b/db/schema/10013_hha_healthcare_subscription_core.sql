-- 10013_hha_healthcare_subscription_core.sql
-- Healthcare Subscription Analytics module (internal codename: Hone Health demo).
--
-- NOTE: this content was first applied to Supabase (project ozboonlsplroialdwuxj) on
-- 2026-06-08 while the file was numbered 10012; it was renumbered to 10013 because
-- 10012 was taken by 10012_telemetry_copilot_fallback_reason.sql on origin/main. The DDL
-- is unchanged and idempotent (CREATE TABLE IF NOT EXISTS / ON CONFLICT), so the prod DB
-- and this file remain consistent — only the repo ordering number changed.
--
-- SYNTHETIC, DEMO-ONLY, NO PHI. Models the *operating metrics* of a subscription-led
-- longevity / digital-health business: members, subscription economics, acquisition
-- funnel, signup cohorts, and care-operations SLAs. Every value is a synthetic gold
-- rollup. No names, emails, DOBs, addresses, phone numbers, diagnoses, or exact lab
-- values are ever stored — only synthetic IDs and aggregate measures.
--
-- Money is stored as integer minor units (cents); the serving layer casts to decimal
-- only at the edge (platform standard: no floating-point dollars near a financial metric).
--
-- These five tables are the gold "serving" layer. Event-level grain (members,
-- subscriptions, lab_orders, ...) is intentionally deferred to a later phase; in this
-- slice the rollups are seeded deterministically (provenance_label says so), and a later
-- phase will make them *derived* from event tables rather than seeded.
--
-- Per ARCHITECTURE.md: env_id TEXT NOT NULL + business_id UUID NOT NULL + full RLS on
-- every table. business_id is synthesized deterministically by the hha_starter seed pack
-- (the v2 pipeline does not assign one to fresh demo envs).
--
-- Tables:
--   hha_overview_metrics    — exec KPI strip, one row per (env, as_of_date)
--   hha_plans               — membership plan dimension
--   hha_funnel_metrics      — acquisition funnel by stage (+ channel)
--   hha_cohort_metrics      — signup-cohort retention/LTV (+ small-cell suppression)
--   hha_operational_metrics — care-operations SLAs (labs / consults / fulfillment / support)

-- ---------------------------------------------------------------------------
-- hha_overview_metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hha_overview_metrics (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  TEXT NOT NULL,
    business_id             UUID NOT NULL,
    as_of_date              DATE NOT NULL,

    -- Membership
    active_members          INTEGER,
    new_members_mtd         INTEGER,

    -- Subscription economics (money in integer minor units / cents)
    mrr_minor_units         BIGINT,
    arr_minor_units         BIGINT,
    arpu_minor_units        BIGINT,
    blended_cac_minor_units BIGINT,
    ltv_minor_units         BIGINT,
    ltv_cac_ratio           NUMERIC(8, 4),
    payback_months          NUMERIC(6, 2),

    -- Rates stored as fractions in [0,1] (NRR/GRR may exceed 1.0 on expansion)
    trial_to_paid_pct       NUMERIC(7, 6),
    activation_rate_pct     NUMERIC(7, 6),
    gross_churn_pct         NUMERIC(7, 6),
    net_churn_pct           NUMERIC(7, 6),
    nrr_pct                 NUMERIC(7, 6),
    grr_pct                 NUMERIC(7, 6),
    month3_retention_pct    NUMERIC(7, 6),

    -- Care-operations health (on-time SLA fractions)
    lab_sla_pct             NUMERIC(7, 6),
    consult_sla_pct         NUMERIC(7, 6),

    -- Freshness / provenance (user-facing, per platform standard #6)
    source_freshness_at     TIMESTAMPTZ,
    provenance_label        TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hha_overview_metrics_env_date_unique UNIQUE (env_id, as_of_date)
);

COMMENT ON TABLE hha_overview_metrics IS
    'Healthcare Subscription Analytics (SYNTHETIC, NO PHI): exec KPI strip, one row per '
    '(env_id, as_of_date). MRR/ARR/CAC/LTV in integer minor units; rates as [0,1] '
    'fractions. Seeded gold rollup; see provenance_label. Owning module: hha (Hone demo).';

ALTER TABLE hha_overview_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hha_overview_metrics_tenant_isolation ON hha_overview_metrics;
CREATE POLICY hha_overview_metrics_tenant_isolation ON hha_overview_metrics
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_hha_overview_metrics_env_date
    ON hha_overview_metrics (env_id, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- hha_plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hha_plans (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  TEXT NOT NULL,
    business_id             UUID NOT NULL,

    plan_key                TEXT NOT NULL,
    plan_name               TEXT NOT NULL,
    tier                    TEXT,
    program                 TEXT,            -- synthetic program family (e.g. hormone, metabolic, longevity)
    price_minor_units       BIGINT,
    billing_interval        TEXT,            -- 'monthly' | 'annual'
    is_active               BOOLEAN NOT NULL DEFAULT true,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hha_plans_env_key_unique UNIQUE (env_id, plan_key)
);

COMMENT ON TABLE hha_plans IS
    'Healthcare Subscription Analytics (SYNTHETIC, NO PHI): membership plan dimension. '
    'Synthetic program families only. Price in integer minor units. Owning module: hha.';

ALTER TABLE hha_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hha_plans_tenant_isolation ON hha_plans;
CREATE POLICY hha_plans_tenant_isolation ON hha_plans
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_hha_plans_env
    ON hha_plans (env_id, tier);

-- ---------------------------------------------------------------------------
-- hha_funnel_metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hha_funnel_metrics (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  TEXT NOT NULL,
    business_id             UUID NOT NULL,
    as_of_date              DATE NOT NULL,

    stage_key               TEXT NOT NULL,   -- visitor|lead|trial|activated|subscribed|retained
    stage_label             TEXT NOT NULL,
    stage_order             INTEGER NOT NULL,
    acquisition_channel     TEXT NOT NULL DEFAULT 'all',

    entered_count           INTEGER,
    converted_count         INTEGER,
    conversion_pct          NUMERIC(7, 6),   -- fraction of entered that converted to next stage
    cac_minor_units         BIGINT,          -- channel CAC (NULL for blended 'all')

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hha_funnel_metrics_env_stage_unique
        UNIQUE (env_id, as_of_date, stage_key, acquisition_channel)
);

COMMENT ON TABLE hha_funnel_metrics IS
    'Healthcare Subscription Analytics (SYNTHETIC, NO PHI): acquisition funnel by stage and '
    'channel, one row per (env_id, as_of_date, stage_key, acquisition_channel). Owning module: hha.';

ALTER TABLE hha_funnel_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hha_funnel_metrics_tenant_isolation ON hha_funnel_metrics;
CREATE POLICY hha_funnel_metrics_tenant_isolation ON hha_funnel_metrics
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_hha_funnel_metrics_env_date
    ON hha_funnel_metrics (env_id, as_of_date DESC, stage_order);

-- ---------------------------------------------------------------------------
-- hha_cohort_metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hha_cohort_metrics (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                      TEXT NOT NULL,
    business_id                 UUID NOT NULL,

    signup_cohort_month         DATE NOT NULL,   -- first day of the signup month
    months_since_signup         INTEGER NOT NULL,
    acquisition_channel         TEXT NOT NULL DEFAULT 'all',

    cohort_size                 INTEGER NOT NULL,  -- denominator, locked at cohort birth
    retained_count              INTEGER,
    retention_pct               NUMERIC(7, 6),
    cumulative_revenue_minor_units BIGINT,
    ltv_minor_units             BIGINT,

    -- Conservative small-cell suppression: true when cohort_size < 11 so a tiny group
    -- cannot be singled out. (Formal rationale + source cited in the env plan docs.)
    is_suppressed               BOOLEAN NOT NULL DEFAULT false,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hha_cohort_metrics_env_cohort_unique
        UNIQUE (env_id, signup_cohort_month, months_since_signup, acquisition_channel)
);

COMMENT ON TABLE hha_cohort_metrics IS
    'Healthcare Subscription Analytics (SYNTHETIC, NO PHI): signup-cohort retention and LTV, '
    'one row per (env_id, signup_cohort_month, months_since_signup, acquisition_channel). '
    'cohort_size denominator is locked; is_suppressed flags small cells (<11). Owning module: hha.';

ALTER TABLE hha_cohort_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hha_cohort_metrics_tenant_isolation ON hha_cohort_metrics;
CREATE POLICY hha_cohort_metrics_tenant_isolation ON hha_cohort_metrics
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_hha_cohort_metrics_env_cohort
    ON hha_cohort_metrics (env_id, signup_cohort_month, months_since_signup);

-- ---------------------------------------------------------------------------
-- hha_operational_metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hha_operational_metrics (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                  TEXT NOT NULL,
    business_id             UUID NOT NULL,
    as_of_date              DATE NOT NULL,

    ops_domain              TEXT NOT NULL,   -- labs | consults | fulfillment | support
    metric_label            TEXT,
    volume                  INTEGER,
    sla_target_hours        NUMERIC(8, 2),
    sla_actual_p50_hours    NUMERIC(8, 2),
    sla_actual_p90_hours    NUMERIC(8, 2),
    sla_breach_pct          NUMERIC(7, 6),
    backlog_count           INTEGER,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hha_operational_metrics_env_domain_unique
        UNIQUE (env_id, as_of_date, ops_domain)
);

COMMENT ON TABLE hha_operational_metrics IS
    'Healthcare Subscription Analytics (SYNTHETIC, NO PHI): care-operations SLAs by domain '
    '(labs/consults/fulfillment/support), one row per (env_id, as_of_date, ops_domain). '
    'Turnaround hours and breach fractions only — no patient-level data. Owning module: hha.';

ALTER TABLE hha_operational_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hha_operational_metrics_tenant_isolation ON hha_operational_metrics;
CREATE POLICY hha_operational_metrics_tenant_isolation ON hha_operational_metrics
    USING (env_id = current_setting('app.env_id', true))
    WITH CHECK (env_id = current_setting('app.env_id', true));

CREATE INDEX IF NOT EXISTS idx_hha_operational_metrics_env_date
    ON hha_operational_metrics (env_id, as_of_date DESC, ops_domain);

-- ---------------------------------------------------------------------------
-- v2 environment template registration
-- ---------------------------------------------------------------------------
-- Pairs with backend/app/services/environment_seed_packs_v2/hha_starter.py and the frontend
-- standalone shell at repo-b/src/app/lab/env/[envId]/healthcare-subscription/.
-- Reviewer access model = authenticated lab tenant (private); the reviewer logs in and opens
-- /lab/env/{env_id}/healthcare-subscription. Idempotent via ON CONFLICT (template_key, version).
INSERT INTO app.environment_templates (
  template_key, version, display_name, description, env_kind_default, industry_type,
  default_home_route, default_auth_mode,
  enabled_modules, theme_tokens, login_copy,
  default_seed_pack, available_seed_packs, is_active, is_latest, notes
) VALUES (
  'healthcare_subscription', 1,
  'Healthcare Subscription Analytics',
  'Synthetic, no-PHI analytics for a subscription-led longevity / digital-health business: membership economics (MRR/ARR/NRR/LTV:CAC/payback), acquisition funnel, signup-cohort retention with small-cell suppression, and care-operations SLAs (labs/consults/fulfillment/support). Demonstrates a governed analytics operating layer — business metrics kept strictly separate from medical advice.',
  'demo', 'healthcare',
  '/lab/env/{env_id}/healthcare-subscription', 'private',
  ARRAY['overview','funnel','cohorts','operations'],
  jsonb_build_object('accent', '168 76% 42%', 'accent_soft', '168 70% 78%', 'glow', '45, 212, 191'),
  jsonb_build_object('title', 'Healthcare Subscription Analytics', 'subtitle', 'Sign in to the synthetic longevity-membership analytics console.'),
  'hha_starter', ARRAY['hha_starter','empty'], true, true,
  'SYNTHETIC / NO-PHI demo. Business analytics only — no diagnosis, treatment, or patient-level data. See docs/plans/healthcare-subscription/.'
)
ON CONFLICT (template_key, version) DO UPDATE SET
  display_name         = EXCLUDED.display_name,
  description          = EXCLUDED.description,
  env_kind_default     = EXCLUDED.env_kind_default,
  industry_type        = EXCLUDED.industry_type,
  default_home_route   = EXCLUDED.default_home_route,
  default_auth_mode    = EXCLUDED.default_auth_mode,
  enabled_modules      = EXCLUDED.enabled_modules,
  theme_tokens         = EXCLUDED.theme_tokens,
  login_copy           = EXCLUDED.login_copy,
  default_seed_pack    = EXCLUDED.default_seed_pack,
  available_seed_packs = EXCLUDED.available_seed_packs,
  is_active            = EXCLUDED.is_active,
  notes                = EXCLUDED.notes,
  updated_at           = now();
