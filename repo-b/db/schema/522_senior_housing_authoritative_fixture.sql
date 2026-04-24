-- 522_senior_housing_authoritative_fixture.sql
--
-- Released authoritative asset snapshots + matching operational rows for
-- demo-env senior-housing assets. Operator Diagnostics proof-stage fixture.
--
-- FIXTURE IDENTITY:
--   snapshot_version = 'demo_fixture_2026Q2_operator_diag'
--   demo env only / 2026Q2 only
--   Audit block surfaces authoritative_fixture_present=true when any
--   snapshot_version LIKE 'demo_fixture_%'
--   These rows carry NO real GL backing — not safe to promote.
--
-- Assets:
--   Heritage Senior Living  c0000001-0000-0000-0000-000000000012  Five Star/mixed/mid/Charlotte  RELEASED
--   Desert Ridge Senior     c0000002-0000-0000-0000-000000000006  Brookdale/SNF/mid/Scottsdale   RELEASED
--   Oakwood Memory Care     c0000001-0000-0000-0000-000000000013  Sunrise/SNF/mid/Raleigh        draft_audit (unreleased → fallback path)
--
-- Peer math result:
--   Heritage  mixed/Charlotte/mid  → 0 released peers → insufficient_peer_sample
--   Desert Ridge SNF/Scottsdale/mid → 0 released peers (Oakwood is draft_audit) → insufficient_peer_sample
--   Oakwood   unreleased → null NOI/occupancy → all derived suppress

DO $$
DECLARE
  v_audit_run_id uuid := 'f1500522-0000-0000-0000-000000000001'::uuid;
  v_snap         text := 'demo_fixture_2026Q2_operator_diag';
  v_quarter      text := '2026Q2';
  v_env          text := 'demo';
  v_biz          uuid := '86a14dc1-bd54-4b63-8783-eadbc10e19ca';
  v_fund_id      uuid := 'a0000001-0000-0000-0000-000000000003';
  v_now          timestamptz := now();

  v_heritage  uuid := 'c0000001-0000-0000-0000-000000000012';
  v_desert    uuid := 'c0000002-0000-0000-0000-000000000006';
  v_oakwood   uuid := 'c0000001-0000-0000-0000-000000000013';

BEGIN

  -- ── 0. Snapshot run record (FK on audit_run_id) ───────────────────────────
  INSERT INTO re_authoritative_snapshot_run (
    audit_run_id, snapshot_version, env_id, business_id,
    methodology_version, sample_manifest, run_status,
    findings_summary, created_by,
    released_at, released_by,
    created_at, updated_at
  ) VALUES (
    v_audit_run_id, v_snap, v_env, v_biz,
    'fixture_v1',
    '{"note":"demo fixture for operator diagnostics proof stage","assets":3}'::jsonb,
    'released',
    '{"released":2,"draft_audit":1,"fixture":true}'::jsonb,
    'fixture_migration_522',
    v_now, 'fixture_migration_522',
    v_now, v_now
  )
  ON CONFLICT (audit_run_id) DO NOTHING;

  -- ── 1. Released: Heritage Senior Living (Five Star / mixed / Charlotte) ───
  -- NOI ~38%, occupancy 88%
  INSERT INTO re_authoritative_asset_state_qtr (
    id, audit_run_id, snapshot_version, promotion_state,
    env_id, business_id, fund_id, asset_id,
    quarter, period_start, period_end,
    trust_status, breakpoint_layer,
    canonical_metrics, display_metrics, null_reasons, formulas,
    provenance, source_row_refs, artifact_paths,
    released_at, released_by, created_at
  ) VALUES (
    gen_random_uuid(), v_audit_run_id, v_snap, 'released',
    v_env, v_biz, v_fund_id, v_heritage,
    v_quarter, '2026-04-01', '2026-06-30',
    'trusted', 'asset',
    '{"noi":"756000.00","occupancy":"0.88","revenue":"1980000.00","opex":"1224000.00","capex":"45000.00","reserves":"12000.00"}'::jsonb,
    '{"noi_display":"$756K","occupancy_display":"88%"}'::jsonb,
    '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
    v_now, 'fixture_migration_522', v_now
  )
  ON CONFLICT DO NOTHING;

  -- ── 2. Released: Desert Ridge Senior (Brookdale / SNF / Scottsdale) ───────
  -- NOI ~31%, occupancy 82%
  INSERT INTO re_authoritative_asset_state_qtr (
    id, audit_run_id, snapshot_version, promotion_state,
    env_id, business_id, fund_id, asset_id,
    quarter, period_start, period_end,
    trust_status, breakpoint_layer,
    canonical_metrics, display_metrics, null_reasons, formulas,
    provenance, source_row_refs, artifact_paths,
    released_at, released_by, created_at
  ) VALUES (
    gen_random_uuid(), v_audit_run_id, v_snap, 'released',
    v_env, v_biz, v_fund_id, v_desert,
    v_quarter, '2026-04-01', '2026-06-30',
    'trusted', 'asset',
    '{"noi":"550800.00","occupancy":"0.82","revenue":"1776000.00","opex":"1225200.00","capex":"38000.00","reserves":"10000.00"}'::jsonb,
    '{"noi_display":"$551K","occupancy_display":"82%"}'::jsonb,
    '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
    v_now, 'fixture_migration_522', v_now
  )
  ON CONFLICT DO NOTHING;

  -- ── 3. Draft-audit (unreleased): Oakwood Memory Care (Sunrise / SNF / Raleigh) ──
  -- Not released → endpoint returns null NOI/occupancy with null_reason="authoritative_state_not_released"
  INSERT INTO re_authoritative_asset_state_qtr (
    id, audit_run_id, snapshot_version, promotion_state,
    env_id, business_id, fund_id, asset_id,
    quarter, period_start, period_end,
    trust_status, breakpoint_layer,
    canonical_metrics, display_metrics, null_reasons, formulas,
    provenance, source_row_refs, artifact_paths,
    released_at, released_by, created_at
  ) VALUES (
    gen_random_uuid(), v_audit_run_id, v_snap, 'draft_audit',
    v_env, v_biz, v_fund_id, v_oakwood,
    v_quarter, '2026-04-01', '2026-06-30',
    'untrusted', 'asset',
    '{"noi":"310000.00","occupancy":"0.79","revenue":"1100000.00","opex":"790000.00"}'::jsonb,
    '{}'::jsonb,
    '{"noi":"not_yet_reviewed","occupancy":"not_yet_reviewed"}'::jsonb,
    '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
    NULL, NULL, v_now
  )
  ON CONFLICT DO NOTHING;

  -- ── 4. Operational rows for released assets (source_type=seed) ────────────
  -- inputs_hash = md5("fixture_522:{asset_id}:{quarter}") for determinism
  -- Guard: only insert if the asset exists (378_scenario_v2_seed may have skipped
  -- if no business was present in the environment, e.g. fresh CI database).
  INSERT INTO re_asset_operating_qtr (
    asset_id, quarter, scenario_id,
    revenue, labor_cost, labor_cost_source,
    source_type, inputs_hash, created_at
  )
  SELECT
    t.asset_id, v_quarter, NULL,
    t.rev, t.lc, 'seed', 'seed',
    md5('fixture_522:' || t.asset_id::text || ':' || v_quarter),
    v_now
  FROM (VALUES
    (v_heritage, 1980000.00::numeric, 891000.00::numeric),
    (v_desert,   1776000.00::numeric, 888000.00::numeric)
  ) AS t(asset_id, rev, lc)
  WHERE EXISTS (SELECT 1 FROM repe_asset ra WHERE ra.asset_id = t.asset_id)
    AND NOT EXISTS (
      SELECT 1 FROM re_asset_operating_qtr x
      WHERE x.asset_id = t.asset_id
        AND x.quarter  = v_quarter
        AND x.scenario_id IS NULL
    );

END $$;
