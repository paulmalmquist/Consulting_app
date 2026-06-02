-- Migration 10004: EnvironmentContract + Promotion Gate — foundation (Ticket 1)
--
-- Adds the governance sidecar for v2 environments:
--   - app.environment_contract          (per-env declarative contract + promotion_state)
--   - app.environment_promotion_event   (append-only transition audit; DEAD in Ticket 1)
--
-- These live in the `app.` internal system schema (alongside app.environments and
-- app.environment_templates). app.* env-registry tables are env_id-keyed and are NOT
-- subject to the public-prefix rule, and do NOT use the public.* env_id TEXT +
-- business_id UUID RLS template. They mirror app.environments style.
--
-- Additive only. ZERO BACKFILL: this migration creates no contract row for any
-- existing environment. Absence of a contract row reads as ungoverned/'draft' — no
-- legacy or v2 env is ever silently promoted by applying this migration.
--
-- No promotion-state-machine / released-immutability trigger here: Ticket 1 performs
-- no transitions, so such a trigger would be dead weight and an extra regression
-- surface. It is introduced in Ticket 2 (migration 10005) when transitions exist.
--
-- 10003 is reserved by Dispatch 0002 (10003_consulting_task_hierarchy.sql); this work
-- intentionally uses 10004.

CREATE SCHEMA IF NOT EXISTS app;

-- ═══════════════════════════════════════════════════════════════════════════════
-- app.environment_contract — one row per governed v2 environment.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app.environment_contract (
  env_id                            uuid PRIMARY KEY
                                      REFERENCES app.environments(env_id) ON DELETE CASCADE,
  template_key                      text NOT NULL,
  template_version                  int  NOT NULL,
  canonical_runtime_path            text,                       -- null -> verifier 'unknown'
  runtime_mode                      text
                                      CHECK (runtime_mode IS NULL OR runtime_mode IN
                                        ('static', 'interactive', 'agentic', 'headless')),
  deployment_target                 text NOT NULL DEFAULT 'local'
                                      CHECK (deployment_target IN
                                        ('local', 'preview', 'staging', 'production')),
  seed_pack_version                 int,
  required_capabilities             text[] NOT NULL DEFAULT '{}',
  required_smoke_tests              text[] NOT NULL DEFAULT '{}',
  required_eval_suite               text,
  authoritative_state_requirements  jsonb  NOT NULL DEFAULT '{}'::jsonb,
  compatibility_version             text   NOT NULL DEFAULT 'env_contract_v1',
  promotion_state                   text   NOT NULL DEFAULT 'draft'
                                      CHECK (promotion_state IN
                                        ('draft', 'seeded', 'verified', 'staging',
                                         'released', 'quarantined', 'failed')),
  last_verification                 jsonb,
  last_verified_at                  timestamptz,
  verified_by                       text,
  released_at                       timestamptz,
  released_by                       text,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

-- Workload: Control Tower / promotion tooling lists environments by non-draft
-- promotion_state; the partial predicate keeps the index small (most envs are draft
-- or ungoverned with no row at all).
CREATE INDEX IF NOT EXISTS idx_environment_contract_promotion_state
  ON app.environment_contract (promotion_state)
  WHERE promotion_state <> 'draft';

-- ═══════════════════════════════════════════════════════════════════════════════
-- app.environment_promotion_event — append-only audit of promotion transitions.
-- Created here for forward compatibility only. In Ticket 1 NO code path inserts into
-- this table; it is written by the Ticket 2 promotion gate.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app.environment_promotion_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id        uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  from_state    text,
  to_state      text NOT NULL,
  actor         text NOT NULL,
  reason        text,
  verification  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_environment_promotion_event_env
  ON app.environment_promotion_event (env_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- updated_at touch trigger (reuses the established idiom from
-- 459_re_authoritative_snapshot_audit.sql / 10002 app.set_updated_at).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.environment_contract_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_environment_contract_updated_at
    BEFORE UPDATE ON app.environment_contract
    FOR EACH ROW EXECUTE FUNCTION app.environment_contract_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE app.environment_contract IS
  'Per-env governance contract + promotion_state. Sidecar to app.environments, '
  'env_id-keyed. Absence of a row = ungoverned/draft. No legacy env is backfilled. '
  'Owning module: backend/app/services/environment_contract_v2.py.';

COMMENT ON TABLE app.environment_promotion_event IS
  'Append-only audit of promotion transitions. Written by Ticket 2 promotion gate; '
  'created here to avoid a second migration. DEAD (no writes) in Ticket 1.';

COMMENT ON COLUMN app.environment_contract.promotion_state IS
  'Governance state, distinct from app.environments.lifecycle_state. '
  'draft -> seeded -> verified -> staging -> released; quarantined / failed are '
  'fail-closed terminals. Transitions are enforced by the Ticket 2 gate, not here.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification queries (run after apply; expect the documented results):
--
--   -- both tables present
--   SELECT to_regclass('app.environment_contract')        IS NOT NULL AS contract_ok,
--          to_regclass('app.environment_promotion_event') IS NOT NULL AS event_ok;
--
--   -- ZERO backfill: no contract row exists immediately after apply
--   SELECT count(*) AS contract_rows FROM app.environment_contract;   -- expect 0
--   SELECT count(*) AS event_rows    FROM app.environment_promotion_event; -- expect 0
--
--   -- no existing environment's lifecycle_state was touched by this migration
--   -- (this migration never writes app.environments)
-- ═══════════════════════════════════════════════════════════════════════════════
