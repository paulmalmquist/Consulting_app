-- 310: Seed model scope, assumption overrides, and run results
-- for the Morgan QA Downside and Base Case Stress Test models in Meridian Capital Management

DO $$
DECLARE
  v_morgan_model_id uuid;
  v_base_model_id uuid;
  v_fund_id uuid;
  v_run_id uuid;
  v_asset_count int;
  i int;
BEGIN
  -- Find the Morgan QA Downside model (if it exists)
  SELECT m.model_id INTO v_morgan_model_id
  FROM re_model m
  WHERE m.name = 'Morgan QA Downside'
  LIMIT 1;

  -- Find the Base Case Stress Test model (if it exists)
  SELECT m.model_id INTO v_base_model_id
  FROM re_model m
  WHERE m.name = 'Base Case Stress Test'
  LIMIT 1;

  -- If neither model exists, create them
  IF v_morgan_model_id IS NULL THEN
    -- Get a fund from repe_fund
    SELECT f.fund_id INTO v_fund_id
    FROM repe_fund f
    LIMIT 1;

    IF v_fund_id IS NOT NULL THEN
      INSERT INTO re_model (model_id, primary_fund_id, name, description, status, strategy_type, created_at)
      VALUES (
        gen_random_uuid(),
        v_fund_id,
        'Morgan QA Downside',
        'Downside scenario for Morgan QA testing',
        'draft',
        'equity',
        now()
      )
      RETURNING model_id INTO v_morgan_model_id;
    END IF;
  END IF;

  IF v_base_model_id IS NULL AND v_fund_id IS NOT NULL THEN
    INSERT INTO re_model (model_id, primary_fund_id, name, description, status, strategy_type, created_at)
    VALUES (
      gen_random_uuid(),
      v_fund_id,
      'Base Case Stress Test',
      'Base case scenario for stress testing',
      'draft',
      'equity',
      now()
    )
    RETURNING model_id INTO v_base_model_id;
  END IF;

  -- === Seed scope for Morgan QA Downside ===
  IF v_morgan_model_id IS NOT NULL THEN
    -- Add 8 assets to scope (if they exist)
    INSERT INTO re_model_scope (model_id, scope_type, scope_node_id, include, created_at)
    SELECT
      v_morgan_model_id,
      'asset',
      a.asset_id,
      true,
      now()
    FROM repe_asset a
    LIMIT 8
    ON CONFLICT (model_id, scope_type, scope_node_id) DO NOTHING;

    GET DIAGNOSTICS v_asset_count = ROW_COUNT;

    -- === Seed assumption overrides for Morgan QA Downside ===
    IF v_asset_count > 0 THEN
      -- Get the fund_id for this model
      SELECT m.primary_fund_id INTO v_fund_id
      FROM re_model m
      WHERE m.model_id = v_morgan_model_id;

      -- Insert fund-level overrides
      INSERT INTO re_model_override (
        model_id, scope_node_type, scope_node_id, key, value_type, value_decimal, reason, is_active, created_at
      )
      VALUES
        (v_morgan_model_id, 'fund', v_fund_id, 'exit_cap_rate', 'decimal', 0.065, 'Downside: 50bps cap rate expansion vs base', true, now()),
        (v_morgan_model_id, 'fund', v_fund_id, 'revenue_growth', 'decimal', -0.02, 'Downside: 2% NOI decline stress scenario', true, now()),
        (v_morgan_model_id, 'fund', v_fund_id, 'hold_period_years', 'decimal', 7.0, 'Extended hold under downside scenario', true, now()),
        (v_morgan_model_id, 'fund', v_fund_id, 'discount_rate', 'decimal', 0.095, 'Risk-adjusted discount rate for downside', true, now()),
        (v_morgan_model_id, 'fund', v_fund_id, 'vacancy_rate', 'decimal', 0.12, 'Downside: elevated vacancy assumption', true, now())
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- === Seed scope for Base Case Stress Test ===
  IF v_base_model_id IS NOT NULL THEN
    -- Add 12 assets to scope
    INSERT INTO re_model_scope (model_id, scope_type, scope_node_id, include, created_at)
    SELECT
      v_base_model_id,
      'asset',
      a.asset_id,
      true,
      now()
    FROM repe_asset a
    LIMIT 12
    ON CONFLICT (model_id, scope_type, scope_node_id) DO NOTHING;

    GET DIAGNOSTICS v_asset_count = ROW_COUNT;

    -- === Seed assumption overrides for Base Case Stress Test ===
    IF v_asset_count > 0 THEN
      SELECT m.primary_fund_id INTO v_fund_id
      FROM re_model m
      WHERE m.model_id = v_base_model_id;

      INSERT INTO re_model_override (
        model_id, scope_node_type, scope_node_id, key, value_type, value_decimal, reason, is_active, created_at
      )
      VALUES
        (v_base_model_id, 'fund', v_fund_id, 'exit_cap_rate', 'decimal', 0.055, 'Base case market exit assumption', true, now()),
        (v_base_model_id, 'fund', v_fund_id, 'revenue_growth', 'decimal', 0.03, 'Base case: 3% NOI growth', true, now()),
        (v_base_model_id, 'fund', v_fund_id, 'hold_period_years', 'decimal', 5.0, 'Standard 5-year hold period', true, now()),
        (v_base_model_id, 'fund', v_fund_id, 'discount_rate', 'decimal', 0.08, 'Blended cost of capital base case', true, now())
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RAISE NOTICE 'Seed complete: Created/updated scope and overrides for Morgan QA Downside and Base Case Stress Test models';
END $$;
