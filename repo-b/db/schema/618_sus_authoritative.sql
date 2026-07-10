-- 618_sus_authoritative.sql
--
-- Sustainability authoritative snapshot layer.
--
-- Purpose:
-- 1. Persist versioned, audit-run-backed authoritative period states for
--    sustainability metrics scoped to portfolio, fund, investment, or asset.
-- 2. Mirror the REPE authoritative-state contract (see
--    459_re_authoritative_snapshot_audit.sql and
--    docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md) so sustainability serving reads
--    can fail closed on trust_status and null_reason instead of approximating.
-- 3. Keep per-metric values and per-metric provenance separable from the
--    snapshot header so a released snapshot can be inspected metric-by-metric.
-- 4. Enforce released-row immutability for the snapshot header so audited
--    values cannot be silently rewritten.
--
-- Tenant scoping follows the same app-layer convention as
-- 287_re_sustainability.sql and 459_re_authoritative_snapshot_audit.sql:
-- every table carries env_id TEXT NOT NULL + business_id UUID NOT NULL and
-- reader/writer services scope on those columns. No inline RLS is added here,
-- consistent with the sibling sus_* and re_authoritative_* families.

CREATE TABLE IF NOT EXISTS sus_authoritative_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_version    text NOT NULL UNIQUE,
  env_id              text NOT NULL,
  business_id         uuid NOT NULL,
  entity_scope        text NOT NULL
    CHECK (entity_scope IN ('portfolio', 'fund', 'investment', 'asset')),
  period_key          text NOT NULL,
  metric_family       text NOT NULL,
  promotion_state     text NOT NULL DEFAULT 'draft_audit'
    CHECK (promotion_state IN ('draft_audit', 'verified', 'released')),
  state_origin        text,
  trust_status        text NOT NULL DEFAULT 'untrusted'
    CHECK (trust_status IN ('trusted', 'untrusted', 'missing_source')),
  formula_id          text,
  input_hash          text,
  period_exact        boolean NOT NULL DEFAULT false,
  null_reason         text,
  canonical_metrics   jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_metrics     jsonb NOT NULL DEFAULT '{}'::jsonb,
  null_reasons        jsonb NOT NULL DEFAULT '{}'::jsonb,
  formulas            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          text,
  verified_at         timestamptz,
  verified_by         text,
  released_at         timestamptz,
  released_by         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sus_authoritative_snapshots_lookup
  ON sus_authoritative_snapshots (business_id, env_id, period_key, promotion_state);

CREATE INDEX IF NOT EXISTS idx_sus_authoritative_snapshots_scope
  ON sus_authoritative_snapshots (business_id, entity_scope, metric_family, period_key);

CREATE TABLE IF NOT EXISTS sus_authoritative_metric_value (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_version    text NOT NULL,
  env_id              text NOT NULL,
  business_id         uuid NOT NULL,
  metric_key          text NOT NULL,
  value_numeric       numeric(28,12),
  unit                text,
  null_reason         text,
  promotion_state     text NOT NULL DEFAULT 'draft_audit'
    CHECK (promotion_state IN ('draft_audit', 'verified', 'released')),
  trust_status        text NOT NULL DEFAULT 'untrusted'
    CHECK (trust_status IN ('trusted', 'untrusted', 'missing_source')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_version, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_sus_authoritative_metric_value_lookup
  ON sus_authoritative_metric_value (snapshot_version, metric_key);

CREATE INDEX IF NOT EXISTS idx_sus_authoritative_metric_value_tenant
  ON sus_authoritative_metric_value (business_id, env_id, metric_key);

CREATE TABLE IF NOT EXISTS sus_authoritative_evidence (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_version        text NOT NULL,
  env_id                  text NOT NULL,
  business_id             uuid NOT NULL,
  metric_key              text NOT NULL,
  source_table            text NOT NULL,
  source_row_ref          text,
  emission_factor_set_id  uuid,
  ingestion_run_id        uuid,
  formula_id              text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sus_authoritative_evidence_lookup
  ON sus_authoritative_evidence (snapshot_version, metric_key);

CREATE INDEX IF NOT EXISTS idx_sus_authoritative_evidence_tenant
  ON sus_authoritative_evidence (business_id, env_id, snapshot_version);

CREATE OR REPLACE FUNCTION sus_authoritative_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_sus_authoritative_snapshots_updated_at
    BEFORE UPDATE ON sus_authoritative_snapshots
    FOR EACH ROW EXECUTE FUNCTION sus_authoritative_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION sus_authoritative_enforce_promotion()
RETURNS trigger AS $$
DECLARE
  allowed_keys text[] := ARRAY[
    'promotion_state',
    'verified_at',
    'verified_by',
    'released_at',
    'released_by',
    'updated_at'
  ];
BEGIN
  IF TG_OP = 'DELETE' AND OLD.promotion_state = 'released' THEN
    RAISE EXCEPTION 'Released sustainability authoritative snapshot rows are immutable (table=%, id=%)', TG_TABLE_NAME, OLD.id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - allowed_keys <> to_jsonb(OLD) - allowed_keys THEN
      RAISE EXCEPTION 'Sustainability authoritative snapshot payloads are immutable after insert (table=%, id=%)', TG_TABLE_NAME, OLD.id;
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
      RAISE EXCEPTION 'Released sustainability authoritative snapshot rows cannot be downgraded';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_sus_authoritative_snapshots_guard
    BEFORE UPDATE OR DELETE ON sus_authoritative_snapshots
    FOR EACH ROW EXECUTE FUNCTION sus_authoritative_enforce_promotion();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE sus_authoritative_snapshots IS
  'Sustainability authoritative-state snapshot header. Owning module: Sustainability (BOS). One row per snapshot_version; released rows are immutable and drive fail-closed reads for governed ESG metrics.';
COMMENT ON TABLE sus_authoritative_metric_value IS
  'Sustainability authoritative-state per-metric numeric values keyed by snapshot_version + metric_key. Owning module: Sustainability (BOS). value_numeric is NULL when null_reason is set (fail-closed).';
COMMENT ON TABLE sus_authoritative_evidence IS
  'Sustainability authoritative-state per-metric provenance rows pointing back to source_table / source_row_ref / emission_factor_set_id / ingestion_run_id / formula_id. Owning module: Sustainability (BOS).';
