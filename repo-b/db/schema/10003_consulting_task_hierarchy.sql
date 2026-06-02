-- 10003_consulting_task_hierarchy.sql
-- Novendor Daily Operator Control Plane — additive task hierarchy.
-- Adds Operating Domain → Initiative → Workstream → Task structure ON TOP of
-- the existing cro_execution_task spine (schema 525 + 604). Purely additive:
-- existing rows get NULL hierarchy and continue to render in the current
-- Today/This Week/Waiting/Done lanes. No status/type/impact/date columns are
-- duplicated — those already exist on cro_execution_task and are reused.
--
-- Depends on: 525_execution_board (cro_execution_task), ARCHITECTURE.md RLS
--             template + approved `cro_` prefix.
-- Dispatch:   docs/plans/03-implementation-plans/active/0002-novendor-daily-operator-control-plane.md
--
-- Live-verified 2026-05-19 against Supabase ozboonlsplroialdwuxj:
--   * none of the 10 hierarchy columns exist on cro_execution_task yet
--   * cro_operating_domain / cro_initiative / cro_workstream do not exist
--   * existing RLS pattern: USING (env_id = current_setting('app.env_id', true))
--   * board SELECT lists explicit columns → additive columns are safe
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, policy
-- guarded by duplicate_object, seeds use ON CONFLICT DO NOTHING. Safe re-run.

-- ── 1. Additive hierarchy columns on cro_execution_task ─────────────────────
-- Tasks store domain/initiative/workstream KEYS directly (text). UI/API
-- resolve labels from the reference tables when present; a missing reference
-- row degrades to an honest empty state ("No linked initiative"), it never
-- errors. No hard FK from task → reference rows (keeps the board resilient).
-- parent_task_id is the ONLY new FK: self-referential, ON DELETE SET NULL so
-- deleting a parent never cascades-deletes child checklist items.

ALTER TABLE cro_execution_task
    ADD COLUMN IF NOT EXISTS domain_key          text,
    ADD COLUMN IF NOT EXISTS initiative_key      text,
    ADD COLUMN IF NOT EXISTS workstream_key      text,
    ADD COLUMN IF NOT EXISTS parent_task_id      uuid
        REFERENCES cro_execution_task(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_kind         text,
    ADD COLUMN IF NOT EXISTS related_entity_type text,
    ADD COLUMN IF NOT EXISTS related_entity_id   uuid,
    ADD COLUMN IF NOT EXISTS related_url         text,
    ADD COLUMN IF NOT EXISTS evidence            jsonb,
    ADD COLUMN IF NOT EXISTS last_reviewed_at    timestamptz;

COMMENT ON COLUMN cro_execution_task.domain_key IS
    'Controlled operating-domain key (cro_operating_domain.domain_key). NULL = ungrouped; renders as before.';
COMMENT ON COLUMN cro_execution_task.initiative_key IS
    'Initiative key within the domain (cro_initiative.initiative_key). NULL = no linked initiative.';
COMMENT ON COLUMN cro_execution_task.workstream_key IS
    'Workstream key within the initiative (cro_workstream.workstream_key). NULL = no linked workstream.';
COMMENT ON COLUMN cro_execution_task.parent_task_id IS
    'Self-FK for subtasks / checklist items. ON DELETE SET NULL — deleting a parent orphans, never cascade-deletes.';
COMMENT ON COLUMN cro_execution_task.source_kind IS
    'Origin of the task: manual / generated / crm / coding_plan / accounting / website. Distinct from auto_source (auto-gen pass name).';
COMMENT ON COLUMN cro_execution_task.related_entity_type IS
    'Optional linked-entity type: impl_plan / crm_account / receipt / web_property / etc.';
COMMENT ON COLUMN cro_execution_task.related_entity_id IS
    'Optional linked-entity id (no enforced FK — type-polymorphic).';
COMMENT ON COLUMN cro_execution_task.related_url IS
    'Optional link: plan path, site URL, ticket. Honest empty state when NULL.';
COMMENT ON COLUMN cro_execution_task.evidence IS
    'Optional receipts/screenshots/links payload (jsonb).';
COMMENT ON COLUMN cro_execution_task.last_reviewed_at IS
    'For industry-section "last reviewed" tracking. NULL = never reviewed.';

-- Grouping query support (env-scoped board, grouped by hierarchy).
CREATE INDEX IF NOT EXISTS idx_cro_execution_task_env_domain
    ON cro_execution_task (env_id, domain_key);
CREATE INDEX IF NOT EXISTS idx_cro_execution_task_parent
    ON cro_execution_task (parent_task_id)
    WHERE parent_task_id IS NOT NULL;

-- ── 2. cro_operating_domain (controlled top-level domains) ──────────────────

CREATE TABLE IF NOT EXISTS cro_operating_domain (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id       text NOT NULL,
    business_id  uuid NOT NULL,
    domain_key   text NOT NULL,
    label        text NOT NULL,
    description  text,
    sort_order   int  NOT NULL DEFAULT 100,
    status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'archived')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, domain_key)
);

COMMENT ON TABLE cro_operating_domain IS
    'Controlled top-level operating domains for the Novendor Daily Operator Control Plane (dispatch 0002). Owned by the consulting/CRO module.';

ALTER TABLE cro_operating_domain ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_operating_domain_tenant ON cro_operating_domain
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_operating_domain_env
    ON cro_operating_domain (env_id, sort_order);

-- ── 3. cro_initiative (initiatives within a domain) ─────────────────────────

CREATE TABLE IF NOT EXISTS cro_initiative (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    domain_key      text NOT NULL,
    initiative_key  text NOT NULL,
    label           text NOT NULL,
    description     text,
    sort_order      int  NOT NULL DEFAULT 100,
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, domain_key, initiative_key)
);

COMMENT ON TABLE cro_initiative IS
    'Initiatives within an operating domain (dispatch 0002). domain_key references cro_operating_domain by key (no hard FK — resilient lookup).';

ALTER TABLE cro_initiative ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_initiative_tenant ON cro_initiative
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_initiative_env_domain
    ON cro_initiative (env_id, domain_key, sort_order);

-- ── 4. cro_workstream (workstreams within an initiative) ────────────────────

CREATE TABLE IF NOT EXISTS cro_workstream (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    domain_key      text NOT NULL,
    initiative_key  text NOT NULL,
    workstream_key  text NOT NULL,
    label           text NOT NULL,
    description     text,
    sort_order      int  NOT NULL DEFAULT 100,
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, domain_key, initiative_key, workstream_key)
);

COMMENT ON TABLE cro_workstream IS
    'Workstreams within an initiative (dispatch 0002). Keys reference cro_initiative/cro_operating_domain by key (no hard FK).';

ALTER TABLE cro_workstream ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY cro_workstream_tenant ON cro_workstream
        USING (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cro_workstream_env_init
    ON cro_workstream (env_id, domain_key, initiative_key, sort_order);

-- ── 5. Seed controlled domains / initiatives / workstreams ──────────────────
-- Scoped to the Novendor consulting env. Verified live: env_id
-- '62cfd59c-a171-4224-ad1e-fffc35bd1ef4' is the active consulting env whose
-- board returns HTTP 200. business_id is resolved from the authoritative
-- env→business mapping (app.environments), falling back to existing tenant
-- rows (cro_outreach_log, then cro_execution_task) so seeds match the tenant
-- exactly. If none resolve, the seed block self-skips — it never fabricates a
-- business_id. Live-verified business_id for this env:
-- 225f52ca-cdf4-4af9-a973-d1d310ddcba1 (app.environments == cro_outreach_log).

DO $$
DECLARE
    v_env_id      text := '62cfd59c-a171-4224-ad1e-fffc35bd1ef4';
    v_business_id uuid;
BEGIN
    -- app.environments.env_id is uuid (verified live); cro_* env_id is text.
    SELECT business_id INTO v_business_id
      FROM app.environments
     WHERE env_id = v_env_id::uuid
     LIMIT 1;

    IF v_business_id IS NULL THEN
        SELECT business_id INTO v_business_id
          FROM cro_outreach_log
         WHERE env_id = v_env_id
         LIMIT 1;
    END IF;

    IF v_business_id IS NULL THEN
        SELECT business_id INTO v_business_id
          FROM cro_execution_task
         WHERE env_id = v_env_id
         LIMIT 1;
    END IF;

    IF v_business_id IS NULL THEN
        RAISE NOTICE 'cro hierarchy seed skipped: could not resolve business_id for env % from app.environments / cro_outreach_log / cro_execution_task', v_env_id;
        RETURN;
    END IF;

    -- 5a. Five controlled operating domains
    INSERT INTO cro_operating_domain (env_id, business_id, domain_key, label, sort_order)
    VALUES
        (v_env_id, v_business_id, 'web_properties', 'Web Properties',                  10),
        (v_env_id, v_business_id, 'outreach_crm',   'Outreach / CRM',                  20),
        (v_env_id, v_business_id, 'coding_platform','Coding / Winston Platform',       30),
        (v_env_id, v_business_id, 'novendor_web',   'Novendor Web / Industry Sections',40),
        (v_env_id, v_business_id, 'admin_ops',      'Admin / Accounting / Operations', 50)
    ON CONFLICT (env_id, domain_key) DO NOTHING;

    -- 5b. Initiatives — FlowYorker under web_properties
    INSERT INTO cro_initiative (env_id, business_id, domain_key, initiative_key, label, sort_order)
    VALUES
        (v_env_id, v_business_id, 'web_properties', 'flowyorker', 'FlowYorker.com', 10)
    ON CONFLICT (env_id, domain_key, initiative_key) DO NOTHING;

    -- 5c. Initiatives — Novendor industry sections under novendor_web
    INSERT INTO cro_initiative (env_id, business_id, domain_key, initiative_key, label, sort_order)
    VALUES
        (v_env_id, v_business_id, 'novendor_web', 'real_estate',        'Real Estate',                    10),
        (v_env_id, v_business_id, 'novendor_web', 'private_equity',     'Private Equity',                 20),
        (v_env_id, v_business_id, 'novendor_web', 'medical',            'Medical',                        30),
        (v_env_id, v_business_id, 'novendor_web', 'legal',              'Legal',                          40),
        (v_env_id, v_business_id, 'novendor_web', 'construction_pds',   'Construction / PDS',             50),
        (v_env_id, v_business_id, 'novendor_web', 'ai_operating_system','AI Operating System / Governance',60)
    ON CONFLICT (env_id, domain_key, initiative_key) DO NOTHING;

    -- 5d. FlowYorker workstreams
    INSERT INTO cro_workstream (env_id, business_id, domain_key, initiative_key, workstream_key, label, sort_order)
    VALUES
        (v_env_id, v_business_id, 'web_properties', 'flowyorker', 'site_ops',                  'Site Operations',           10),
        (v_env_id, v_business_id, 'web_properties', 'flowyorker', 'content_seo',               'Content / SEO',             20),
        (v_env_id, v_business_id, 'web_properties', 'flowyorker', 'design_ux',                 'Design / UX',               30),
        (v_env_id, v_business_id, 'web_properties', 'flowyorker', 'publishing_deployment',     'Publishing / Deployment',   40),
        (v_env_id, v_business_id, 'web_properties', 'flowyorker', 'monetization_partnerships', 'Monetization / Partnerships',50),
        (v_env_id, v_business_id, 'web_properties', 'flowyorker', 'analytics_performance',     'Analytics / Performance',   60),
        (v_env_id, v_business_id, 'web_properties', 'flowyorker', 'backlog_ideas',             'Backlog / Ideas',           70)
    ON CONFLICT (env_id, domain_key, initiative_key, workstream_key) DO NOTHING;
END $$;

-- ── 6. Verification queries ─────────────────────────────────────────────────
-- Run these post-apply (psql / supabase db query --linked) to prove the
-- migration landed and did not break the existing board. Each should return
-- the asserted result. They are SELECT-only and safe to run repeatedly.
--
-- 6a. All 10 hierarchy columns exist on cro_execution_task (expect: 10)
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name='cro_execution_task'
--      AND column_name IN ('domain_key','initiative_key','workstream_key',
--        'parent_task_id','source_kind','related_entity_type',
--        'related_entity_id','related_url','evidence','last_reviewed_at');
--
-- 6b. Three reference tables exist (expect: 3)
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_name IN ('cro_operating_domain','cro_initiative','cro_workstream');
--
-- 6c. RLS enabled on all three new tables (expect: 3 rows, relrowsecurity=t)
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('cro_operating_domain','cro_initiative','cro_workstream');
--
-- 6d. Five operating domains seeded (expect: 5)
--   SELECT count(*) FROM cro_operating_domain
--    WHERE env_id='62cfd59c-a171-4224-ad1e-fffc35bd1ef4';
--
-- 6e. FlowYorker initiative seeded (expect: 1)
--   SELECT count(*) FROM cro_initiative
--    WHERE env_id='62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
--      AND domain_key='web_properties' AND initiative_key='flowyorker';
--
-- 6f. Six Novendor industry initiatives seeded (expect: 6)
--   SELECT count(*) FROM cro_initiative
--    WHERE env_id='62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
--      AND domain_key='novendor_web';
--
-- 6g. Seven FlowYorker workstreams seeded (expect: 7)
--   SELECT count(*) FROM cro_workstream
--    WHERE env_id='62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
--      AND initiative_key='flowyorker';
--
-- 6h. Existing rows remain valid with NULL hierarchy (expect: every existing
--     row, all hierarchy cols NULL — no data rewritten)
--   SELECT count(*) AS rows_with_null_hierarchy FROM cro_execution_task
--    WHERE domain_key IS NULL AND initiative_key IS NULL
--      AND workstream_key IS NULL AND parent_task_id IS NULL;
--
-- 6i. Existing board query shape still works (expect: no error, returns rows)
--   SELECT t.id, t.status, t.type, t.domain_key
--     FROM cro_execution_task t
--    WHERE t.env_id='62cfd59c-a171-4224-ad1e-fffc35bd1ef4'
--    LIMIT 5;
