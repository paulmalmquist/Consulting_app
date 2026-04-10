-- 459_re_authoritative_snapshot_audit.sql
--
-- Meridian authoritative snapshot layer.
--
-- Purpose:
-- 1. Persist versioned, audit-run-backed authoritative period states for sampled
--    asset, investment, and fund entities.
-- 2. Separate audit-grade serving state from mixed legacy quarter-state tables.
-- 3. Make gross-to-net explanations queryable as structured rows, not only CSV.
-- 4. Enforce promotion-state progression and released-row immutability.

CREATE TABLE IF NOT EXISTS re_authoritative_snapshot_run (
  audit_run_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_version     text NOT NULL UNIQUE,
  env_id               text NOT NULL,
  business_id          uuid NOT NULL,
  methodology_version  text NOT NULL DEFAULT 'meridian_authoritative_snapshot_v1',
  sample_manifest      jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_root        text,
  run_status           text NOT NULL DEFAULT 'draft_audit'
    CHECK (run_status IN ('draft_audit', 'verified', 'released', 'failed')),
  findings_summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by           text,
  verified_at          timestamptz,
  verified_by          text,
  released_at          timestamptz,
  released_by          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_authoritative_snapshot_run_business
  ON re_authoritative_snapshot_run (business_id, created_at DESC);

CREATE OR REPLACE FUNCTION re_authoritative_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_re_authoritative_snapshot_run_updated_at
    BEFORE UPDATE ON re_authoritative_snapshot_run
    FOR EACH ROW EXECUTE FUNCTION re_authoritative_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION re_authoritative_enforce_promotion()
RETURNS trigger AS $$
DECLARE
  allowed_keys text[] := ARRAY[
    'promotion_state',
    'verified_at',
    'verified_by',
    'released_at',
    'released_by'
  ];
BEGIN
  IF TG_OP = 'DELETE' AND OLD.promotion_state = 'released' THEN
    RAISE EXCEPTION 'Released authoritative snapshot rows are immutable (table=%, id=%)', TG_TABLE_NAME, OLD.id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - allowed_keys <> to_jsonb(OLD) - allowed_keys THEN
      RAISE EXCEPTION 'Authoritative snapshot payloads are immutable after insert (table=%, id=%)', TG_TABLE_NAME, OLD.id;
    END IF;

    IF OLD.promotion_state = 'draft_audit'
       AND NEW.promotion_state NOT IN ('draft_audit', 'verified', 'released') THEN
      RAISE EXCEPTION 'Invalid promotion transition % -> %', OLD.promotion_state, NEW.promotion_state;
    END IF;

    IF OLD.promotion_state = 'verified'
       AND NEW.promotion_state NOT IN ('verified', 'released') THEN
      RAISE EXCEPTION 'Invalid promotion transition % -> %', OLD.promotion_state, NEW.promotion_state;
    END IF;

    IF OLD.promotion_state = 'released'
       AND NEW.promotion_state <> 'released' THEN
      RAISE EXCEPTION 'Released authoritative snapshot rows cannot be downgraded';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS re_authoritative_asset_state_qtr (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id        uuid NOT NULL REFERENCES re_authoritative_snapshot_run(audit_run_id) ON DELETE CASCADE,
  snapshot_version    text NOT NULL,
  promotion_state     text NOT NULL DEFAULT 'draft_audit'
    CHECK (promotion_state IN ('draft_audit', 'verified', 'released')),
  env_id              text NOT NULL,
  business_id         uuid NOT NULL,
  fund_id             uuid,
  investment_id       uuid,
  asset_id            uuid NOT NULL,
  quarter             text NOT NULL,
  period_start        date,
  period_end          date,
  trust_status        text NOT NULL DEFAULT 'untrusted'
    CHECK (trust_status IN ('trusted', 'untrusted', 'missing_source')),
  breakpoint_layer    text,
  canonical_metrics   jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_metrics     jsonb NOT NULL DEFAULT '{}'::jsonb,
  null_reasons        jsonb NOT NULL DEFAULT '{}'::jsonb,
  formulas            jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance          jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_row_refs     jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_paths      jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_hash         text,
  verified_at         timestamptz,
  verified_by         text,
  released_at         timestamptz,
  released_by         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_run_id, asset_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_re_authoritative_asset_state_lookup
  ON re_authoritative_asset_state_qtr (asset_id, quarter, promotion_state, created_at DESC);

CREATE TABLE IF NOT EXISTS re_authoritative_investment_state_qtr (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id        uuid NOT NULL REFERENCES re_authoritative_snapshot_run(audit_run_id) ON DELETE CASCADE,
  snapshot_version    text NOT NULL,
  promotion_state     text NOT NULL DEFAULT 'draft_audit'
    CHECK (promotion_state IN ('draft_audit', 'verified', 'released')),
  env_id              text NOT NULL,
  business_id         uuid NOT NULL,
  fund_id             uuid,
  investment_id       uuid NOT NULL,
  quarter             text NOT NULL,
  period_start        date,
  period_end          date,
  trust_status        text NOT NULL DEFAULT 'untrusted'
    CHECK (trust_status IN ('trusted', 'untrusted', 'missing_source')),
  breakpoint_layer    text,
  canonical_metrics   jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_metrics     jsonb NOT NULL DEFAULT '{}'::jsonb,
  null_reasons        jsonb NOT NULL DEFAULT '{}'::jsonb,
  formulas            jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance          jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_row_refs     jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_paths      jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_hash         text,
  verified_at         timestamptz,
  verified_by         text,
  released_at         timestamptz,
  released_by         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_run_id, investment_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_re_authoritative_investment_state_lookup
  ON re_authoritative_investment_state_qtr (investment_id, quarter, promotion_state, created_at DESC);

CREATE TABLE IF NOT EXISTS re_authoritative_fund_state_qtr (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id        uuid NOT NULL REFERENCES re_authoritative_snapshot_run(audit_run_id) ON DELETE CASCADE,
  snapshot_version    text NOT NULL,
  promotion_state     text NOT NULL DEFAULT 'draft_audit'
    CHECK (promotion_state IN ('draft_audit', 'verified', 'released')),
  env_id              text NOT NULL,
  business_id         uuid NOT NULL,
  fund_id             uuid NOT NULL,
  quarter             text NOT NULL,
  period_start        date,
  period_end          date,
  trust_status        text NOT NULL DEFAULT 'untrusted'
    CHECK (trust_status IN ('trusted', 'untrusted', 'missing_source')),
  breakpoint_layer    text,
  canonical_metrics   jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_metrics     jsonb NOT NULL DEFAULT '{}'::jsonb,
  null_reasons        jsonb NOT NULL DEFAULT '{}'::jsonb,
  formulas            jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance          jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_row_refs     jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_paths      jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_hash         text,
  verified_at         timestamptz,
  verified_by         text,
  released_at         timestamptz,
  released_by         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_run_id, fund_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_re_authoritative_fund_state_lookup
  ON re_authoritative_fund_state_qtr (fund_id, quarter, promotion_state, created_at DESC);

CREATE TABLE IF NOT EXISTS re_authoritative_fund_gross_to_net_qtr (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id        uuid NOT NULL REFERENCES re_authoritative_snapshot_run(audit_run_id) ON DELETE CASCADE,
  snapshot_version    text NOT NULL,
  promotion_state     text NOT NULL DEFAULT 'draft_audit'
    CHECK (promotion_state IN ('draft_audit', 'verified', 'released')),
  env_id              text NOT NULL,
  business_id         uuid NOT NULL,
  fund_id             uuid NOT NULL,
  quarter             text NOT NULL,
  trust_status        text NOT NULL DEFAULT 'untrusted'
    CHECK (trust_status IN ('trusted', 'untrusted', 'missing_source')),
  breakpoint_layer    text,
  gross_return_amount numeric(28,12),
  management_fees     numeric(28,12),
  fund_expenses       numeric(28,12),
  net_return_amount   numeric(28,12),
  bridge_items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  null_reasons        jsonb NOT NULL DEFAULT '{}'::jsonb,
  formulas            jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance          jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_row_refs     jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_paths      jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_hash         text,
  verified_at         timestamptz,
  verified_by         text,
  released_at         timestamptz,
  released_by         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_run_id, fund_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_re_authoritative_gross_to_net_lookup
  ON re_authoritative_fund_gross_to_net_qtr (fund_id, quarter, promotion_state, created_at DESC);

DO $$ BEGIN
  CREATE TRIGGER trg_re_authoritative_asset_state_guard
    BEFORE UPDATE OR DELETE ON re_authoritative_asset_state_qtr
    FOR EACH ROW EXECUTE FUNCTION re_authoritative_enforce_promotion();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_re_authoritative_investment_state_guard
    BEFORE UPDATE OR DELETE ON re_authoritative_investment_state_qtr
    FOR EACH ROW EXECUTE FUNCTION re_authoritative_enforce_promotion();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_re_authoritative_fund_state_guard
    BEFORE UPDATE OR DELETE ON re_authoritative_fund_state_qtr
    FOR EACH ROW EXECUTE FUNCTION re_authoritative_enforce_promotion();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_re_authoritative_gross_to_net_guard
    BEFORE UPDATE OR DELETE ON re_authoritative_fund_gross_to_net_qtr
    FOR EACH ROW EXECUTE FUNCTION re_authoritative_enforce_promotion();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE re_authoritative_snapshot_run IS
  'Versioned Meridian authoritative snapshot run metadata. One row per runner execution.';
COMMENT ON TABLE re_authoritative_asset_state_qtr IS
  'Persisted authoritative asset period state written only by the Meridian audit runner.';
COMMENT ON TABLE re_authoritative_investment_state_qtr IS
  'Persisted authoritative investment period state written only by the Meridian audit runner.';
COMMENT ON TABLE re_authoritative_fund_state_qtr IS
  'Persisted authoritative fund period state written only by the Meridian audit runner.';
COMMENT ON TABLE re_authoritative_fund_gross_to_net_qtr IS
  'Structured gross-to-net explanation layer for authoritative fund snapshots.';
