-- 445_pds_demo_seed.sql
-- Seeds realistic PDS project delivery demo data for the Stone PDS environment.
-- Creates 1 program, 3 projects (mixed health), budget lines, and contracts.
--
-- Depends on: 272_pds_core.sql, environment + business bindings
-- Idempotent: uses ON CONFLICT DO NOTHING

DO $$
DECLARE
  -- Stone PDS environment
  v_env_id uuid;
  v_business_id uuid;

  -- Program
  v_program_id uuid := 'e0000001-0000-4da0-0001-000000000001';

  -- Projects
  v_proj_hq       uuid := 'e0000001-0000-4da0-0002-000000000001';
  v_proj_lab      uuid := 'e0000001-0000-4da0-0002-000000000002';
  v_proj_parking  uuid := 'e0000001-0000-4da0-0002-000000000003';

  -- Budget versions
  v_bv_hq       uuid := 'e0000001-0000-4da0-0003-000000000001';
  v_bv_lab      uuid := 'e0000001-0000-4da0-0003-000000000002';
  v_bv_parking  uuid := 'e0000001-0000-4da0-0003-000000000003';

BEGIN
  -- Resolve Stone PDS environment
  SELECT e.env_id, eb.business_id INTO v_env_id, v_business_id
  FROM app.environments e
  JOIN app.env_business_bindings eb ON eb.env_id = e.env_id
  WHERE e.industry = 'pds'
  LIMIT 1;

  IF v_env_id IS NULL THEN
    -- Try by name
    SELECT e.env_id, eb.business_id INTO v_env_id, v_business_id
    FROM app.environments e
    JOIN app.env_business_bindings eb ON eb.env_id = e.env_id
    WHERE e.name ILIKE '%stone%' OR e.name ILIKE '%pds%'
    LIMIT 1;
  END IF;

  IF v_env_id IS NULL THEN
    RAISE NOTICE 'No PDS environment found, skipping PDS seed';
    RETURN;
  END IF;

  -- ════════════════════════════════════════════════════════════════════
  -- 1. PROGRAM
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO pds_programs (program_id, env_id, business_id, name, status, created_by)
  VALUES (v_program_id, v_env_id, v_business_id, 'Stone Capital Projects 2025', 'active', 'system')
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 2. PROJECTS (3: on_track, at_risk, delayed)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO pds_projects (
    project_id, env_id, business_id, program_id, name, stage,
    project_manager, approved_budget, committed_amount, spent_amount,
    forecast_at_completion, contingency_budget, contingency_remaining,
    pending_change_order_amount, next_milestone_date, risk_score, status
  ) VALUES
    -- ON TRACK: HQ Renovation — 65% spent, on budget, low risk
    (v_proj_hq, v_env_id, v_business_id, v_program_id,
     'Corporate HQ Renovation — Phase 2', 'construction',
     'Jennifer Walsh', 12500000, 11200000, 8125000,
     12100000, 625000, 420000,
     0, (now() + interval '45 days')::date, 25, 'active'),
    -- AT RISK: Lab Buildout — 40% spent but 15% over forecast, change orders pending
    (v_proj_lab, v_env_id, v_business_id, v_program_id,
     'Research Lab Buildout — Building C', 'preconstruction',
     'Marcus Rivera', 8700000, 5200000, 3480000,
     9800000, 435000, 110000,
     650000, (now() + interval '20 days')::date, 72, 'active'),
    -- DELAYED: Parking Structure — permitting delays, 80% contingency consumed
    (v_proj_parking, v_env_id, v_business_id, v_program_id,
     'Visitor Parking Structure Expansion', 'planning',
     'Diana Okafor', 4200000, 1800000, 840000,
     4900000, 210000, 42000,
     320000, (now() - interval '10 days')::date, 88, 'active')
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 3. BUDGET VERSIONS (1 baseline per project)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO pds_budget_versions (budget_version_id, env_id, business_id, project_id, version_no, period, approved_budget, status, is_baseline)
  VALUES
    (v_bv_hq,      v_env_id, v_business_id, v_proj_hq,      1, '2025', 12500000, 'published', true),
    (v_bv_lab,     v_env_id, v_business_id, v_proj_lab,     1, '2025', 8700000,  'published', true),
    (v_bv_parking, v_env_id, v_business_id, v_proj_parking, 1, '2025', 4200000,  'published', true)
  ON CONFLICT (project_id, version_no) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 4. BUDGET LINES (6 per project)
  -- ════════════════════════════════════════════════════════════════════

  -- HQ Renovation budget lines (on track — committed ≈ approved)
  INSERT INTO pds_budget_lines (env_id, business_id, project_id, budget_version_id, cost_code, line_label, approved_amount, committed_amount, invoiced_amount, paid_amount)
  VALUES
    (v_env_id, v_business_id, v_proj_hq, v_bv_hq, 'DESIGN',       'Architecture & Engineering',  1250000, 1250000, 1250000, 1180000),
    (v_env_id, v_business_id, v_proj_hq, v_bv_hq, 'CONSTRUCTION', 'General Contractor',          8750000, 7800000, 5200000, 4900000),
    (v_env_id, v_business_id, v_proj_hq, v_bv_hq, 'FFE',          'Furniture, Fixtures & Equip', 1000000,  850000,  425000,  380000),
    (v_env_id, v_business_id, v_proj_hq, v_bv_hq, 'CONTINGENCY',  'Contingency',                  625000,  205000,  205000,  205000),
    (v_env_id, v_business_id, v_proj_hq, v_bv_hq, 'MGMT',         'Project Management',           500000,  500000,  450000,  420000),
    (v_env_id, v_business_id, v_proj_hq, v_bv_hq, 'SOFT',         'Permits, Legal, Insurance',    375000,  375000,  375000,  375000)
  ON CONFLICT (budget_version_id, cost_code) DO NOTHING;

  -- Lab Buildout budget lines (at risk — committed exceeds some lines)
  INSERT INTO pds_budget_lines (env_id, business_id, project_id, budget_version_id, cost_code, line_label, approved_amount, committed_amount, invoiced_amount, paid_amount)
  VALUES
    (v_env_id, v_business_id, v_proj_lab, v_bv_lab, 'DESIGN',       'Architecture & Engineering',   870000,  920000,  870000,  820000),
    (v_env_id, v_business_id, v_proj_lab, v_bv_lab, 'CONSTRUCTION', 'General Contractor',          5220000, 3100000, 1740000, 1600000),
    (v_env_id, v_business_id, v_proj_lab, v_bv_lab, 'FFE',          'Lab Equipment & Fixtures',    1305000,  650000,  310000,  280000),
    (v_env_id, v_business_id, v_proj_lab, v_bv_lab, 'CONTINGENCY',  'Contingency',                  435000,  325000,  325000,  325000),
    (v_env_id, v_business_id, v_proj_lab, v_bv_lab, 'MGMT',         'Project Management',           520000,  205000,  180000,  160000),
    (v_env_id, v_business_id, v_proj_lab, v_bv_lab, 'SOFT',         'Permits, Legal, Insurance',    350000,  350000,  350000,  350000)
  ON CONFLICT (budget_version_id, cost_code) DO NOTHING;

  -- Parking Structure budget lines (delayed — heavy change orders, contingency spent)
  INSERT INTO pds_budget_lines (env_id, business_id, project_id, budget_version_id, cost_code, line_label, approved_amount, committed_amount, invoiced_amount, paid_amount)
  VALUES
    (v_env_id, v_business_id, v_proj_parking, v_bv_parking, 'DESIGN',       'Civil & Structural Design',    420000,  420000,  420000,  420000),
    (v_env_id, v_business_id, v_proj_parking, v_bv_parking, 'CONSTRUCTION', 'General Contractor',          2940000,  980000,  280000,  250000),
    (v_env_id, v_business_id, v_proj_parking, v_bv_parking, 'FFE',          'Parking Systems & Signage',    210000,   85000,       0,       0),
    (v_env_id, v_business_id, v_proj_parking, v_bv_parking, 'CONTINGENCY',  'Contingency',                  210000,  168000,  168000,  168000),
    (v_env_id, v_business_id, v_proj_parking, v_bv_parking, 'MGMT',         'Project Management',           252000,  147000,   84000,   75000),
    (v_env_id, v_business_id, v_proj_parking, v_bv_parking, 'SOFT',         'Permits, Legal, Insurance',    168000,  168000,  168000,  168000)
  ON CONFLICT (budget_version_id, cost_code) DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 5. CONTRACTS (2 per project)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO pds_contracts (env_id, business_id, project_id, contract_number, vendor_name, contract_value, status)
  VALUES
    (v_env_id, v_business_id, v_proj_hq,      'HQ-GC-001',   'Turner Construction',      8750000, 'active'),
    (v_env_id, v_business_id, v_proj_hq,      'HQ-AE-001',   'Gensler',                  1250000, 'complete'),
    (v_env_id, v_business_id, v_proj_lab,     'LAB-GC-001',  'Skanska USA',              5220000, 'active'),
    (v_env_id, v_business_id, v_proj_lab,     'LAB-AE-001',  'Perkins&Will',              870000, 'active'),
    (v_env_id, v_business_id, v_proj_parking, 'PKG-GC-001',  'Clark Construction',       2940000, 'active'),
    (v_env_id, v_business_id, v_proj_parking, 'PKG-CE-001',  'Kimley-Horn',               420000, 'complete')
  ON CONFLICT (project_id, contract_number) DO NOTHING;

END $$;
