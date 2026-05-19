-- 611_outreach_personalizer.sql
-- Outreach Personalizer (Phase 1): turn a single named firm into a public,
-- personalized business-development microsite with tracked views/CTA clicks.
--
-- Tables:
--   cro_outreach_target  — one row per firm targeted for a personalized microsite
--   cro_outreach_asset   — generated assets (insight / loom_script / cold_email / microsite_section)
--   cro_microsite_event  — anonymous public engagement events (microsite_view / microsite_cta)
--
-- Design rules:
--   - Additive only. No destructive ALTERs. No nullability changes on existing
--     columns. Existing cro_engagement_event email-tracking reads/writes are untouched.
--   - cro_microsite_event is a DELIBERATE separate table, not an extension of
--     cro_engagement_event. cro_engagement_event (437_engagement_tracking.sql:13-18)
--     has tracking_id uuid NOT NULL + business_id uuid NOT NULL + an email-specific
--     CHECK (event_type IN ('open','click')). Public microsite events are anonymous
--     (no tracking_id, no guaranteed business_id). Weakening those NOT NULLs to
--     overload an email table would be an unsafe hack, so microsite events get a
--     clearly-named additive table instead.
--   - RLS uses the env_id session pattern WITH the unset-context escape so the
--     public, sessionless microsite read still resolves (the backend pool role
--     also bypasses RLS; this is defense-in-depth).
--
-- Depends on: 000_extensions (citext), 260_crm_native (crm_account.crm_account_id).

BEGIN;

-- ── cro_outreach_target ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_outreach_target (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid,
    crm_account_id  uuid REFERENCES crm_account(crm_account_id) ON DELETE SET NULL,
    firm_name       text NOT NULL,
    firm_slug       citext NOT NULL,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'enriching', 'assets_ready', 'microsite_live', 'failed')),
    logo_url        text,
    accent_hsl      text,
    profile_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    microsite_url   text,
    loom_url        text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, firm_slug)
);

ALTER TABLE cro_outreach_target ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_outreach_target_tenant_isolation ON cro_outreach_target
        USING (
            env_id = current_setting('app.env_id', true)
            OR current_setting('app.env_id', true) IS NULL
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_outreach_target_env_slug
    ON cro_outreach_target (env_id, firm_slug);

COMMENT ON TABLE cro_outreach_target IS
    'One row per firm targeted for a personalized outreach microsite. profile_json holds operator-supplied seed fields. microsite_url is the public /for/{firm_slug} path. Owned by outreach_personalizer service.';

-- ── cro_outreach_asset ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cro_outreach_asset (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id           uuid NOT NULL REFERENCES cro_outreach_target(id) ON DELETE CASCADE,
    asset_type          text NOT NULL
                        CHECK (asset_type IN ('insight', 'loom_script', 'cold_email', 'microsite_section')),
    position            integer NOT NULL DEFAULT 0,
    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    generated_at        timestamptz NOT NULL DEFAULT now(),
    regenerated_count   integer NOT NULL DEFAULT 0
);

ALTER TABLE cro_outreach_asset ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_outreach_asset_tenant_isolation ON cro_outreach_asset
        USING (
            target_id IN (
                SELECT id FROM cro_outreach_target
                WHERE env_id = current_setting('app.env_id', true)
                   OR current_setting('app.env_id', true) IS NULL
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_outreach_asset_lookup
    ON cro_outreach_asset (target_id, asset_type, position);

COMMENT ON TABLE cro_outreach_asset IS
    'Generated assets for an outreach target. asset_type one of insight / loom_script / cold_email / microsite_section. payload.source distinguishes ai vs deterministic_seed. Owned by outreach_personalizer service.';

-- ── cro_microsite_event ─────────────────────────────────────────────────────
-- Anonymous public engagement events. Separate from cro_engagement_event by
-- design (see header). target_id/env_id nullable: a public visitor has no
-- session context; the slug is the stable key.

CREATE TABLE IF NOT EXISTS cro_microsite_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id       uuid REFERENCES cro_outreach_target(id) ON DELETE SET NULL,
    env_id          text,
    microsite_slug  text NOT NULL,
    event_type      text NOT NULL
                    CHECK (event_type IN ('microsite_view', 'microsite_cta')),
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_address      text,
    user_agent      text,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cro_microsite_event ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_microsite_event_tenant_isolation ON cro_microsite_event
        USING (
            env_id IS NULL
            OR env_id = current_setting('app.env_id', true)
            OR current_setting('app.env_id', true) IS NULL
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_microsite_event_slug
    ON cro_microsite_event (microsite_slug, occurred_at DESC);

COMMENT ON TABLE cro_microsite_event IS
    'Anonymous public engagement events (microsite_view / microsite_cta) for outreach microsites. Deliberately separate from cro_engagement_event, which is email-tracking specific and requires tracking_id/business_id NOT NULL. Owned by outreach_personalizer service.';

COMMIT;
