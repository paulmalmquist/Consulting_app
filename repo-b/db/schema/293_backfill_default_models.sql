-- 293_backfill_default_models.sql
-- Creates a "Default Model" (status=approved) for each fund that has scenarios,
-- links existing scenarios to their fund's default model,
-- and creates version 1 for each existing scenario.

-- Step 1: Create "Default Model" for each fund with at least one scenario
INSERT INTO re_model (model_id, fund_id, name, description, status, approved_at, created_at)
SELECT
  gen_random_uuid(),
  s.fund_id,
  'Default Model',
  'Auto-generated default model for existing scenarios',
  'approved',
  now(),
  now()
FROM re_scenario s
GROUP BY s.fund_id
ON CONFLICT (fund_id, name) DO NOTHING;

-- Step 2: Link existing scenarios to their fund's default model
UPDATE re_scenario s
SET model_id = m.model_id
FROM re_model m
WHERE m.fund_id = s.fund_id
  AND m.name = 'Default Model'
  AND s.model_id IS NULL;

-- Step 3: Create version 1 for each existing scenario that doesn't have one
INSERT INTO re_scenario_version (version_id, scenario_id, model_id, version_number, label, is_locked, created_at)
SELECT
  gen_random_uuid(),
  s.scenario_id,
  s.model_id,
  1,
  'Initial Version',
  false,
  now()
FROM re_scenario s
WHERE s.model_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM re_scenario_version sv
    WHERE sv.scenario_id = s.scenario_id AND sv.version_number = 1
  );
