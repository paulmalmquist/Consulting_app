-- 312: Seed model run results
-- Populate completed runs for Morgan QA Downside and Base Case Stress Test models
-- This allows the Fund Impact tab to display realistic fund-level TVPI/IRR comparisons

DO $$
DECLARE
  v_morgan_model_id uuid;
  v_base_model_id uuid;
  v_morgan_run_id uuid;
  v_base_run_id uuid;
  v_fund_id uuid;
  v_fund_count int;
BEGIN
  -- Find the models
  SELECT m.model_id INTO v_morgan_model_id
  FROM re_model m
  WHERE m.name = 'Morgan QA Downside'
  LIMIT 1;

  SELECT m.model_id INTO v_base_model_id
  FROM re_model m
  WHERE m.name = 'Base Case Stress Test'
  LIMIT 1;

  -- === Create run record for Morgan QA Downside ===
  IF v_morgan_model_id IS NOT NULL THEN
    INSERT INTO re_model_run (
      id, model_id, status, started_at, completed_at, triggered_by, created_at
    )
    VALUES (
      gen_random_uuid(),
      v_morgan_model_id,
      'completed',
      now() - INTERVAL '1 hour',
      now() - INTERVAL '59 minutes',
      'seed',
      now()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_morgan_run_id;

    -- Get fund_id for this model
    SELECT m.primary_fund_id INTO v_fund_id
    FROM re_model m
    WHERE m.model_id = v_morgan_model_id;

    IF v_morgan_run_id IS NOT NULL AND v_fund_id IS NOT NULL THEN
      -- Insert fund impact results for Morgan QA Downside
      INSERT INTO re_model_run_result (run_id, fund_id, metric, base_value, model_value, variance)
      VALUES
        (v_morgan_run_id, v_fund_id, 'tvpi', 1.21, 1.05, -0.16),
        (v_morgan_run_id, v_fund_id, 'irr', 0.12, 0.07, -0.05),
        (v_morgan_run_id, v_fund_id, 'moic', 1.85, 1.55, -0.30),
        (v_morgan_run_id, v_fund_id, 'dpi', 0.85, 0.75, -0.10)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- === Create run record for Base Case Stress Test ===
  IF v_base_model_id IS NOT NULL THEN
    INSERT INTO re_model_run (
      id, model_id, status, started_at, completed_at, triggered_by, created_at
    )
    VALUES (
      gen_random_uuid(),
      v_base_model_id,
      'completed',
      now() - INTERVAL '2 hours',
      now() - INTERVAL '119 minutes',
      'seed',
      now()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_base_run_id;

    -- Get fund_id for this model
    SELECT m.primary_fund_id INTO v_fund_id
    FROM re_model m
    WHERE m.model_id = v_base_model_id;

    IF v_base_run_id IS NOT NULL AND v_fund_id IS NOT NULL THEN
      -- Insert fund impact results for Base Case Stress Test
      INSERT INTO re_model_run_result (run_id, fund_id, metric, base_value, model_value, variance)
      VALUES
        (v_base_run_id, v_fund_id, 'tvpi', 1.21, 1.18, -0.03),
        (v_base_run_id, v_fund_id, 'irr', 0.12, 0.115, -0.005),
        (v_base_run_id, v_fund_id, 'moic', 1.85, 1.80, -0.05),
        (v_base_run_id, v_fund_id, 'dpi', 0.85, 0.84, -0.01)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RAISE NOTICE 'Seed complete: Created completed model runs with fund impact results';
END $$;
