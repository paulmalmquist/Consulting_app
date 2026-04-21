-- 520_senior_housing_operator_profile.sql
-- Senior-housing operator / acuity profile with provenance, plus labor_cost
-- provenance on the operational table. Keeps seeded demo values out of the
-- canonical repe_property_asset table by routing operator/acuity identity
-- into a dedicated, effective-dated, source-tagged table.
--
-- Owning module: Operator Diagnostics (re/operator-diagnostics page).
-- Guardrails:
--   * Canonical asset table (repe_property_asset) is NOT mutated. Operator
--     and acuity identity live here, not there.
--   * Every source field is required (operator_name_source, acuity_type_source,
--     labor_cost_source) so imported/manual data can supersede seed rows.
--   * RLS ENABLED with tenant-isolation policy using env_id from app.env_id
--     setting, per CLAUDE.md database rules.

-- ─────────────────────────────────────────────────────────────
-- 1. Profile table (operator / acuity truth)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS re_asset_operator_profile (
  profile_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id              uuid NOT NULL REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  env_id                text NOT NULL,
  business_id           uuid NOT NULL,
  operator_name         text,
  operator_name_source  text NOT NULL CHECK (operator_name_source IN ('seed','imported','manual','derived')),
  acuity_type           text CHECK (acuity_type IN ('AL','IL','MC','SNF','mixed')),
  acuity_type_source    text NOT NULL CHECK (acuity_type_source IN ('seed','imported','manual','derived')),
  size_band             text CHECK (size_band IN ('small','mid','large')),
  effective_from        date NOT NULL,
  effective_to          date,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE re_asset_operator_profile IS
  'Senior-housing operator + acuity identity with provenance and effective-date history. Owning module: Operator Diagnostics. Kept out of repe_property_asset so seeded demo values do not masquerade as canonical asset truth.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_re_asset_operator_profile_unique_history
  ON re_asset_operator_profile(asset_id, effective_from);

CREATE INDEX IF NOT EXISTS idx_re_asset_operator_profile_env
  ON re_asset_operator_profile(env_id, asset_id);

CREATE INDEX IF NOT EXISTS idx_re_asset_operator_profile_operator
  ON re_asset_operator_profile(operator_name)
  WHERE operator_name IS NOT NULL;

ALTER TABLE re_asset_operator_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS re_asset_operator_profile_tenant ON re_asset_operator_profile;
CREATE POLICY re_asset_operator_profile_tenant ON re_asset_operator_profile
  USING (env_id = current_setting('app.env_id', true))
  WITH CHECK (env_id = current_setting('app.env_id', true));

-- ─────────────────────────────────────────────────────────────
-- 2. Labor cost + provenance on the operational table
-- ─────────────────────────────────────────────────────────────

ALTER TABLE re_asset_operating_qtr
  ADD COLUMN IF NOT EXISTS labor_cost numeric(28,12);

ALTER TABLE re_asset_operating_qtr
  ADD COLUMN IF NOT EXISTS labor_cost_source text
  CHECK (labor_cost_source IN ('seed','imported_gl','manual','derived'));

-- ─────────────────────────────────────────────────────────────
-- 3. Demo seed — provenance-tagged, non-destructive
-- ─────────────────────────────────────────────────────────────
--
-- Seeds operator + acuity profiles for existing senior-housing assets
-- only when no effective-current row already exists. Labor cost is seeded
-- only into operational rows whose source_type already indicates synthetic
-- data ('seed' or 'derived') — never into imported_gl or manual rows.

DO $$
DECLARE
  v_operators      text[] := ARRAY['Brookdale','Five Star','Atria','Sunrise','Holiday','Enlivant'];
  v_acuity_pool    text[] := ARRAY['AL','IL','MC','SNF','mixed'];
  v_asset          RECORD;
  v_idx            int;
  v_op             text;
  v_acu            text;
  v_units          int;
  v_band           text;
  v_intensity      numeric(18,12);
  v_env_id         text;
  v_business_id    uuid;
BEGIN
  FOR v_asset IN
    SELECT
      a.asset_id,
      pa.units,
      f.env_id,
      f.business_id
    FROM repe_asset a
    JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
    JOIN repe_deal d            ON d.deal_id = a.deal_id
    JOIN repe_fund f            ON f.fund_id = d.fund_id
    WHERE LOWER(COALESCE(pa.property_type, '')) IN ('senior_housing','senior housing')
  LOOP
    -- Deterministic operator selection via md5 modulo array length
    v_idx := (('x' || SUBSTRING(md5(v_asset.asset_id::text), 1, 8))::bit(32)::int);
    v_idx := ABS(v_idx) % array_length(v_operators, 1) + 1;
    v_op  := v_operators[v_idx];

    -- Deterministic acuity (different md5 slice)
    v_idx := (('x' || SUBSTRING(md5(v_asset.asset_id::text), 9, 8))::bit(32)::int);
    v_idx := ABS(v_idx) % array_length(v_acuity_pool, 1) + 1;
    v_acu := v_acuity_pool[v_idx];

    -- Size band from unit count
    v_units := COALESCE(v_asset.units, 0);
    IF v_units >= 150 THEN
      v_band := 'large';
    ELSIF v_units >= 75 THEN
      v_band := 'mid';
    ELSE
      v_band := 'small';
    END IF;

    v_env_id      := v_asset.env_id;
    v_business_id := v_asset.business_id;

    -- Only insert if no effective-current row exists for this asset
    IF NOT EXISTS (
      SELECT 1 FROM re_asset_operator_profile p
      WHERE p.asset_id = v_asset.asset_id
        AND p.effective_to IS NULL
    ) AND v_env_id IS NOT NULL AND v_business_id IS NOT NULL THEN
      INSERT INTO re_asset_operator_profile (
        asset_id, env_id, business_id,
        operator_name, operator_name_source,
        acuity_type, acuity_type_source,
        size_band, effective_from, effective_to
      ) VALUES (
        v_asset.asset_id, v_env_id, v_business_id,
        v_op, 'seed',
        v_acu, 'seed',
        v_band, DATE '2020-01-01', NULL
      );
    END IF;

    -- Per-operator labor intensity band (reproducible, operator-specific signal).
    v_intensity := CASE v_op
      WHEN 'Brookdale' THEN 0.48
      WHEN 'Five Star' THEN 0.55
      WHEN 'Atria'     THEN 0.42
      WHEN 'Sunrise'   THEN 0.40
      WHEN 'Holiday'   THEN 0.52
      WHEN 'Enlivant'  THEN 0.46
      ELSE                 0.48
    END;

    -- Seed labor_cost ONLY into synthetic operational rows
    UPDATE re_asset_operating_qtr
       SET labor_cost        = ROUND(COALESCE(revenue, 0) * v_intensity, 2)::numeric(28,12),
           labor_cost_source = 'seed'
     WHERE asset_id          = v_asset.asset_id
       AND source_type       IN ('seed','derived')
       AND labor_cost        IS NULL
       AND revenue           IS NOT NULL;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Idempotency note
-- ─────────────────────────────────────────────────────────────
-- Re-running this migration is safe:
--   * profile inserts gated on absence of effective-current row
--   * labor_cost updates gated on labor_cost IS NULL
--   * ALTER TABLE ... ADD COLUMN IF NOT EXISTS on columns
