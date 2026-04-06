-- 444_crm_demo_seed.sql
-- Seeds realistic CRM demo data for the Novendor consulting environment.
-- Creates accounts, contacts, opportunities, and activities with realistic
-- relationships, varied timestamps, and stale follow-ups.
--
-- Depends on: 260_crm_native.sql, business table, tenant table
-- Idempotent: uses ON CONFLICT DO NOTHING

DO $$
DECLARE
  v_env_id text := 'a1b2c3d4-0001-0001-0003-000000000001';
  v_business_id uuid;
  v_tenant_id uuid;

  -- Account IDs (deterministic for idempotency)
  v_acct_branford   uuid := 'd0000001-0000-crm0-0001-000000000001';
  v_acct_redstone   uuid := 'd0000001-0000-crm0-0001-000000000002';
  v_acct_oakhill    uuid := 'd0000001-0000-crm0-0001-000000000003';
  v_acct_pinnacle   uuid := 'd0000001-0000-crm0-0001-000000000004';
  v_acct_greenfield uuid := 'd0000001-0000-crm0-0001-000000000005';

  -- Contact IDs
  v_ct_1 uuid := 'd0000001-0000-crm0-0002-000000000001';
  v_ct_2 uuid := 'd0000001-0000-crm0-0002-000000000002';
  v_ct_3 uuid := 'd0000001-0000-crm0-0002-000000000003';
  v_ct_4 uuid := 'd0000001-0000-crm0-0002-000000000004';
  v_ct_5 uuid := 'd0000001-0000-crm0-0002-000000000005';
  v_ct_6 uuid := 'd0000001-0000-crm0-0002-000000000006';
  v_ct_7 uuid := 'd0000001-0000-crm0-0002-000000000007';
  v_ct_8 uuid := 'd0000001-0000-crm0-0002-000000000008';

  -- Opportunity IDs
  v_opp_1 uuid := 'd0000001-0000-crm0-0003-000000000001';
  v_opp_2 uuid := 'd0000001-0000-crm0-0003-000000000002';
  v_opp_3 uuid := 'd0000001-0000-crm0-0003-000000000003';
  v_opp_4 uuid := 'd0000001-0000-crm0-0003-000000000004';
  v_opp_5 uuid := 'd0000001-0000-crm0-0003-000000000005';
  v_opp_6 uuid := 'd0000001-0000-crm0-0003-000000000006';

BEGIN
  -- Resolve business + tenant
  SELECT business_id INTO v_business_id
  FROM app.env_business_bindings
  WHERE env_id = v_env_id::uuid
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE NOTICE 'No business binding for env %, skipping CRM seed', v_env_id;
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM business
  WHERE business_id = v_business_id;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenant for business %, skipping CRM seed', v_business_id;
    RETURN;
  END IF;

  -- ════════════════════════════════════════════════════════════════════
  -- 1. ACCOUNTS (5 realistic REPE/consulting prospects)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO crm_account (crm_account_id, tenant_id, business_id, name, account_type, industry, website, created_at)
  VALUES
    (v_acct_branford,   v_tenant_id, v_business_id, 'Branford Castle Partners',   'prospect', 'real_estate',  'branfordcastle.com',   now() - interval '45 days'),
    (v_acct_redstone,   v_tenant_id, v_business_id, 'Redstone Capital Advisors',  'prospect', 'real_estate',  'redstonecap.com',      now() - interval '30 days'),
    (v_acct_oakhill,    v_tenant_id, v_business_id, 'Oak Hill Advisory',          'prospect', 'financial',    'oakhilladvisory.com',  now() - interval '21 days'),
    (v_acct_pinnacle,   v_tenant_id, v_business_id, 'Pinnacle RE Group',          'customer', 'real_estate',  'pinnacleregroup.com',  now() - interval '90 days'),
    (v_acct_greenfield, v_tenant_id, v_business_id, 'Greenfield Ventures',        'prospect', 'technology',   'greenfieldvc.com',     now() - interval '14 days')
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 2. CONTACTS (8 across accounts, varied titles)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO crm_contact (crm_contact_id, tenant_id, business_id, crm_account_id, full_name, first_name, last_name, email, title, created_at)
  VALUES
    (v_ct_1, v_tenant_id, v_business_id, v_acct_branford,   'James Reddington', 'James', 'Reddington', 'jreddington@branfordcastle.com', 'Managing Director',      now() - interval '45 days'),
    (v_ct_2, v_tenant_id, v_business_id, v_acct_branford,   'Sarah Chen',       'Sarah', 'Chen',       'schen@branfordcastle.com',       'VP Data & Analytics',    now() - interval '40 days'),
    (v_ct_3, v_tenant_id, v_business_id, v_acct_redstone,   'Michael Torres',   'Michael', 'Torres',   'mtorres@redstonecap.com',        'CFO',                    now() - interval '30 days'),
    (v_ct_4, v_tenant_id, v_business_id, v_acct_redstone,   'Emily Park',       'Emily', 'Park',       'epark@redstonecap.com',          'Director of Operations', now() - interval '28 days'),
    (v_ct_5, v_tenant_id, v_business_id, v_acct_oakhill,    'David Nakamura',   'David', 'Nakamura',   'dnakamura@oakhilladvisory.com',  'Head of Technology',     now() - interval '21 days'),
    (v_ct_6, v_tenant_id, v_business_id, v_acct_pinnacle,   'Lisa Montgomery',  'Lisa', 'Montgomery',  'lmontgomery@pinnacleregroup.com','COO',                    now() - interval '90 days'),
    (v_ct_7, v_tenant_id, v_business_id, v_acct_pinnacle,   'Robert Kim',       'Robert', 'Kim',       'rkim@pinnacleregroup.com',       'VP Portfolio Analytics', now() - interval '85 days'),
    (v_ct_8, v_tenant_id, v_business_id, v_acct_greenfield, 'Anna Petrova',     'Anna', 'Petrova',     'apetrova@greenfieldvc.com',      'Partner',                now() - interval '14 days')
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 3. OPPORTUNITIES (6 across stages, varied amounts)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO crm_opportunity (crm_opportunity_id, tenant_id, business_id, crm_account_id, primary_contact_id, name, amount, status, expected_close_date, created_at)
  VALUES
    (v_opp_1, v_tenant_id, v_business_id, v_acct_branford,   v_ct_1, 'Branford Castle — AI Fund Diagnostics',  75000, 'open', (now() + interval '30 days')::date,  now() - interval '35 days'),
    (v_opp_2, v_tenant_id, v_business_id, v_acct_redstone,   v_ct_3, 'Redstone — Data Warehouse Assessment',   45000, 'open', (now() + interval '45 days')::date,  now() - interval '20 days'),
    (v_opp_3, v_tenant_id, v_business_id, v_acct_oakhill,    v_ct_5, 'Oak Hill — LP Reporting Automation',      25000, 'open', (now() + interval '60 days')::date,  now() - interval '14 days'),
    (v_opp_4, v_tenant_id, v_business_id, v_acct_pinnacle,   v_ct_6, 'Pinnacle — Winston Platform Deployment',  65000, 'open', (now() + interval '15 days')::date,  now() - interval '60 days'),
    (v_opp_5, v_tenant_id, v_business_id, v_acct_greenfield, v_ct_8, 'Greenfield — AI Strategy Workshop',       7500,  'open', (now() + interval '14 days')::date,  now() - interval '10 days'),
    (v_opp_6, v_tenant_id, v_business_id, v_acct_pinnacle,   v_ct_7, 'Pinnacle — Portfolio Analytics Sprint',   35000, 'won',  (now() - interval '20 days')::date,  now() - interval '80 days')
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════════════════
  -- 4. ACTIVITIES (10: 3 stale, 2 today, 5 recent)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO crm_activity (tenant_id, business_id, crm_account_id, crm_contact_id, crm_opportunity_id, activity_type, subject, activity_at, payload_json)
  VALUES
    -- STALE follow-ups (past due)
    (v_tenant_id, v_business_id, v_acct_branford,   v_ct_1, v_opp_1, 'task',    'Follow up on diagnostic scope with James',    now() - interval '5 days',  '{"status":"pending","due":"overdue"}'::jsonb),
    (v_tenant_id, v_business_id, v_acct_redstone,   v_ct_3, v_opp_2, 'task',    'Send pricing proposal to Michael',            now() - interval '3 days',  '{"status":"pending","due":"overdue"}'::jsonb),
    (v_tenant_id, v_business_id, v_acct_oakhill,    v_ct_5, v_opp_3, 'email',   'Schedule intro call with David re: LP reports',now() - interval '7 days',  '{"status":"pending","due":"overdue"}'::jsonb),
    -- Due today
    (v_tenant_id, v_business_id, v_acct_pinnacle,   v_ct_6, v_opp_4, 'call',    'Check in with Lisa on deployment timeline',   now(),                       '{"status":"pending","due":"today"}'::jsonb),
    (v_tenant_id, v_business_id, v_acct_greenfield, v_ct_8, v_opp_5, 'meeting', 'Workshop prep call with Anna',                now(),                       '{"status":"pending","due":"today"}'::jsonb),
    -- Recent completed
    (v_tenant_id, v_business_id, v_acct_branford,   v_ct_2, v_opp_1, 'call',    'Discovery call with Sarah — data stack review',now() - interval '10 days', '{"status":"completed"}'::jsonb),
    (v_tenant_id, v_business_id, v_acct_redstone,   v_ct_4, v_opp_2, 'email',   'Sent case study to Emily',                    now() - interval '8 days',  '{"status":"completed"}'::jsonb),
    (v_tenant_id, v_business_id, v_acct_pinnacle,   v_ct_7, v_opp_6, 'meeting', 'Sprint kickoff with Robert',                  now() - interval '18 days', '{"status":"completed"}'::jsonb),
    (v_tenant_id, v_business_id, v_acct_pinnacle,   v_ct_6, v_opp_4, 'note',    'Lisa confirmed budget approval for deployment',now() - interval '12 days', '{"status":"completed"}'::jsonb),
    (v_tenant_id, v_business_id, v_acct_greenfield, v_ct_8, NULL,     'email',   'Initial outreach to Anna — AI strategy',      now() - interval '14 days', '{"status":"completed"}'::jsonb)
  ON CONFLICT DO NOTHING;

END $$;

COMMENT ON TABLE crm_account IS 'CRM accounts — seeded with 5 REPE/consulting prospects for demo';
