-- 298_re_uw_seed.sql
-- Seed underwriting models + links for demo investments.
-- For each investment under the demo fund, creates an underwriting_io model,
-- locks it, populates model results, and links via re_investment_underwriting_link.
-- Safe to re-run: uses ON CONFLICT DO NOTHING and deterministic UUIDs.

DO $$
DECLARE
  v_fund_id uuid := 'a1b2c3d4-0003-0030-0001-000000000001'::uuid;
  v_env_id uuid;
  v_deal record;
  v_model_id uuid;
  v_uw_irr numeric;
  v_uw_moic numeric;
  v_uw_nav numeric;
  v_counter int := 0;
  v_model_ids uuid[] := ARRAY[
    'a1b2c3d4-aa01-0001-0001-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-0002-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-0003-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-0004-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-0005-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-0006-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-0007-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-0008-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-0009-000000000001'::uuid,
    'a1b2c3d4-aa01-0001-000a-000000000001'::uuid
  ];
BEGIN
  -- Find env_id from the fund
  SELECT eb.env_id INTO v_env_id
  FROM repe_fund f
  JOIN app.env_business_bindings eb ON eb.business_id = f.business_id
  WHERE f.fund_id = v_fund_id
  LIMIT 1;

  IF v_env_id IS NULL THEN
    RAISE NOTICE 'UW seed: demo fund not found, skipping';
    RETURN;
  END IF;

  FOR v_deal IN
    SELECT deal_id, name FROM repe_deal WHERE fund_id = v_fund_id ORDER BY name LIMIT 10
  LOOP
    v_counter := v_counter + 1;
    v_model_id := v_model_ids[v_counter];

    -- Vary UW targets by investment index
    v_uw_irr := 0.14 + (v_counter * 0.01);     -- 15% to 24%
    v_uw_moic := 1.7 + (v_counter * 0.05);      -- 1.75x to 2.20x
    v_uw_nav := 15000000 + (v_counter * 3000000);

    -- Create underwriting model
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 're_model' AND column_name = 'fund_id'
    ) THEN
      INSERT INTO re_model (model_id, fund_id, name, description, status, model_type, locked_at, created_by)
      VALUES (
        v_model_id,
        v_fund_id,
        'UW IO - ' || v_deal.name,
        'Initial offering underwriting for ' || v_deal.name,
        'approved',
        'underwriting_io',
        now(),
        'seed'
      )
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO re_model (model_id, primary_fund_id, name, description, status, model_type, locked_at, created_by)
      VALUES (
        v_model_id,
        v_fund_id,
        'UW IO - ' || v_deal.name,
        'Initial offering underwriting for ' || v_deal.name,
        'approved',
        'underwriting_io',
        now(),
        'seed'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Store model results
    INSERT INTO re_model_results_investment (model_id, investment_id, metrics_json, compute_version)
    VALUES (
      v_model_id,
      v_deal.deal_id,
      jsonb_build_object(
        'irr', v_uw_irr,
        'equity_multiple', v_uw_moic,
        'nav', v_uw_nav,
        'tvpi', v_uw_moic + 0.05,
        'dpi', v_uw_moic * 0.3,
        'quarter', '2023Q4'
      ),
      'v1'
    )
    ON CONFLICT DO NOTHING;

    -- Link underwriting
    INSERT INTO re_investment_underwriting_link (investment_id, model_id, linked_by)
    VALUES (v_deal.deal_id, v_model_id, 'seed')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'UW seed: linked model % to investment %', v_model_id, v_deal.deal_id;
  END LOOP;

  RAISE NOTICE 'UW seed: created % underwriting models', v_counter;
END;
$$;
