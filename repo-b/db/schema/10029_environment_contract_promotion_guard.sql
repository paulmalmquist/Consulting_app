-- Migration 10029: EnvironmentContract promotion guard (Dispatch 0004 — Ticket 2)
--
-- Adds a fail-closed promotion state machine to app.environment_contract:
--   - released rows are immutable (no DELETE, no field change except a no-op)
--   - only legal promotion_state transitions are allowed
--
-- Mirrors re_authoritative_enforce_promotion() in
-- repo-b/db/schema/459_re_authoritative_snapshot_audit.sql (the proven idiom):
-- allowed-keys diff via `to_jsonb(NEW) - allowed_keys`, explicit per-state guards.
--
-- KEY DIFFERENCE vs. the snapshot table: there, the whole payload freezes at
-- 'verified'. Here, non-released rows are legitimately re-verified (the verifier
-- materializes last_verification/last_verified_at, and the gate flips
-- promotion_state + the verify/release timestamps). So the "payload immutable"
-- rule applies ONLY to rows already in 'released' (a true terminal). Everything
-- else is governed purely by the transition whitelist.
--
-- updated_at MUST be in allowed_keys: the BEFORE UPDATE touch trigger fires on
-- every legitimate allowed-key update of a released row, and would otherwise
-- falsely trip the payload-immutability diff.
--
-- Legal transition graph (enforced below):
--   draft       -> draft | seeded | verified | quarantined | failed
--   seeded      -> seeded | verified | quarantined | failed
--   verified    -> verified | staging | quarantined | failed
--   staging     -> staging | verified | released | quarantined | failed
--   released    -> released                              (terminal, immutable)
--   quarantined -> quarantined | verified                (recovery via re-verify)
--   failed      -> failed | draft | quarantined          (operator reset)
--
-- Additive only. No data backfill. No existing row is transitioned by applying
-- this migration.
-- Dispatch: docs/plans/03-implementation-plans/active/0004-environment-contract-promotion-gate.md

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.environment_contract_enforce_promotion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Fields the gate / verifier may legitimately change WITHOUT it counting as a
  -- payload mutation of a released row. updated_at is touched by a separate
  -- BEFORE UPDATE trigger; include it so the immutability diff ignores it.
  allowed_keys text[] := ARRAY[
    'promotion_state',
    'last_verification',
    'last_verified_at',
    'verified_by',
    'released_at',
    'released_by',
    'updated_at'
  ];
BEGIN
  IF TG_OP = 'DELETE' AND OLD.promotion_state = 'released' THEN
    RAISE EXCEPTION
      'Released environment contract rows are immutable (env_id=%)', OLD.env_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Released is terminal: the only legal "change" is a no-op, and even then
    -- nothing outside allowed_keys may differ.
    IF OLD.promotion_state = 'released' THEN
      IF NEW.promotion_state <> 'released' THEN
        RAISE EXCEPTION
          'Released environment contract cannot be downgraded (env_id=%, % -> %)',
          OLD.env_id, OLD.promotion_state, NEW.promotion_state;
      END IF;
      IF to_jsonb(NEW) - allowed_keys <> to_jsonb(OLD) - allowed_keys THEN
        RAISE EXCEPTION
          'Released environment contract payload is immutable (env_id=%)',
          OLD.env_id;
      END IF;
      RETURN NEW;
    END IF;

    -- Non-released: enforce the transition whitelist on promotion_state.
    IF NEW.promotion_state <> OLD.promotion_state THEN
      IF NOT (
           (OLD.promotion_state = 'draft'
              AND NEW.promotion_state IN ('seeded','verified','quarantined','failed'))
        OR (OLD.promotion_state = 'seeded'
              AND NEW.promotion_state IN ('verified','quarantined','failed'))
        OR (OLD.promotion_state = 'verified'
              AND NEW.promotion_state IN ('staging','quarantined','failed'))
        OR (OLD.promotion_state = 'staging'
              AND NEW.promotion_state IN ('verified','released','quarantined','failed'))
        OR (OLD.promotion_state = 'quarantined'
              AND NEW.promotion_state IN ('verified'))
        OR (OLD.promotion_state = 'failed'
              AND NEW.promotion_state IN ('draft','quarantined'))
      ) THEN
        RAISE EXCEPTION
          'Invalid environment promotion transition (env_id=%, % -> %)',
          OLD.env_id, OLD.promotion_state, NEW.promotion_state;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_environment_contract_enforce_promotion
    BEFORE UPDATE OR DELETE ON app.environment_contract
    FOR EACH ROW EXECUTE FUNCTION app.environment_contract_enforce_promotion();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON FUNCTION app.environment_contract_enforce_promotion() IS
  'Fail-closed promotion state machine for app.environment_contract. Released '
  'rows immutable; only whitelisted transitions allowed. Mirrors '
  're_authoritative_enforce_promotion (migration 459). Owning module: '
  'backend/app/services/environment_contract_v2.py.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification queries (run after apply):
--
--   -- trigger present
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'app.environment_contract'::regclass
--      AND tgname = 'trg_environment_contract_enforce_promotion';
--
--   -- no row was transitioned by this migration (it only adds a trigger)
--   SELECT promotion_state, count(*) FROM app.environment_contract
--    GROUP BY promotion_state;
--
--   -- illegal transition is rejected (run in a rolled-back tx against a draft row):
--   --   UPDATE app.environment_contract SET promotion_state='released'
--   --    WHERE promotion_state='draft';   -- expect: P0001 EXCEPTION
-- ═══════════════════════════════════════════════════════════════════════════════
