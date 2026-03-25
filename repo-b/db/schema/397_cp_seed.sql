-- 397_cp_seed.sql
-- Seed data for Capital Projects OS.
-- References PDS projects seeded via POST /api/pds/v1/seed.
-- Uses DO block to look up existing project IDs by name.

DO $$
DECLARE
  v_proj_a uuid;  -- Downtown Tower Renovation
  v_proj_b uuid;  -- Riverside Mixed Use Phase II
  v_env    uuid;
  v_biz    uuid;
  v_contract_a1 uuid;
  v_contract_a2 uuid;
  v_contract_b1 uuid;
  v_vendor_a1   uuid;
  v_vendor_a2   uuid;
  v_vendor_b1   uuid;
  v_meeting_id  uuid;
  v_today       date := CURRENT_DATE;
  v_base_month  date;
BEGIN

  -- ── Look up PDS-seeded projects ──────────────────────────────────
  SELECT project_id, env_id, business_id
    INTO v_proj_a, v_env, v_biz
    FROM pds_projects
   WHERE name LIKE '%%Downtown Tower%%'
   ORDER BY created_at ASC LIMIT 1;

  IF v_proj_a IS NULL THEN
    RAISE NOTICE 'cp_seed: no PDS projects found — skipping seed';
    RETURN;
  END IF;

  SELECT project_id INTO v_proj_b
    FROM pds_projects
   WHERE name LIKE '%%Riverside Mixed%%'
     AND env_id = v_env AND business_id = v_biz
   ORDER BY created_at ASC LIMIT 1;

  IF v_proj_b IS NULL THEN v_proj_b := v_proj_a; END IF;

  -- ── Enrich existing PDS projects with CP fields ──────────────────
  UPDATE pds_projects SET
    region = 'Southeast', market = 'Atlanta', address = '191 Peachtree St NE, Atlanta, GA 30303',
    latitude = 33.7590, longitude = -84.3880,
    gc_name = 'Turner Construction', architect_name = 'HOK Architects',
    owner_rep = 'JLL Project Management', original_budget = 22000000,
    management_reserve = 500000, sector = 'commercial_office',
    project_type = 'renovation', project_code = 'DTR-2026',
    description = 'Full renovation of 40-story downtown office tower including lobby, MEP systems, facade, and tenant improvements.'
  WHERE project_id = v_proj_a;

  UPDATE pds_projects SET
    region = 'Southeast', market = 'Charleston', address = '75 Calhoun St, Charleston, SC 29401',
    latitude = 32.7876, longitude = -79.9371,
    gc_name = 'Brasfield & Gorrie', architect_name = 'Gensler',
    owner_rep = 'Cushman & Wakefield PM', original_budget = 16500000,
    management_reserve = 400000, sector = 'mixed_use',
    project_type = 'ground_up', project_code = 'RMU-II',
    description = 'Phase II mixed-use development with 200 residential units, 25k SF retail, and structured parking.'
  WHERE project_id = v_proj_b;

  -- ── Look up vendors and contracts ─────────────────────────────────
  SELECT vendor_id INTO v_vendor_a1 FROM pds_vendors
    WHERE env_id = v_env AND business_id = v_biz
    ORDER BY created_at ASC LIMIT 1;

  SELECT vendor_id INTO v_vendor_a2 FROM pds_vendors
    WHERE env_id = v_env AND business_id = v_biz
    ORDER BY created_at ASC LIMIT 1 OFFSET 1;

  IF v_vendor_a2 IS NULL THEN v_vendor_a2 := v_vendor_a1; END IF;
  v_vendor_b1 := v_vendor_a1;

  SELECT contract_id INTO v_contract_a1 FROM pds_contracts
    WHERE project_id = v_proj_a ORDER BY created_at ASC LIMIT 1;

  SELECT contract_id INTO v_contract_a2 FROM pds_contracts
    WHERE project_id = v_proj_a ORDER BY created_at ASC LIMIT 1 OFFSET 1;

  IF v_contract_a2 IS NULL THEN v_contract_a2 := v_contract_a1; END IF;

  SELECT contract_id INTO v_contract_b1 FROM pds_contracts
    WHERE project_id = v_proj_b ORDER BY created_at ASC LIMIT 1;

  -- ── Enrich existing punch items ──────────────────────────────────
  UPDATE pds_punch_items SET
    description = COALESCE(description, title),
    location = 'Lobby', floor = '1', room = 'Main Entrance',
    trade = 'Finish Carpentry', severity = 'minor'
  WHERE project_id = v_proj_a AND description IS NULL;

  UPDATE pds_punch_items SET
    description = COALESCE(description, title),
    location = 'Parking Garage', floor = 'B1', room = 'Ramp Entry',
    trade = 'Concrete', severity = 'major'
  WHERE project_id = v_proj_b AND description IS NULL;

  -- ── Enrich existing RFIs ─────────────────────────────────────────
  UPDATE pds_rfis SET
    discipline = 'structural', reference_drawing = 'S-201',
    cost_impact = 15000, schedule_impact_days = 3
  WHERE project_id = v_proj_a AND discipline IS NULL;

  UPDATE pds_rfis SET
    discipline = 'architectural', reference_drawing = 'A-101',
    cost_impact = 0, schedule_impact_days = 0
  WHERE project_id = v_proj_b AND discipline IS NULL;

  -- ── Enrich existing submittals ───────────────────────────────────
  UPDATE pds_submittals SET
    revision = 'A', review_round = 1,
    reviewer_name = 'HOK Architects', review_action = 'approved'
  WHERE project_id = v_proj_a AND revision IS NULL;

  UPDATE pds_submittals SET
    revision = 'B', review_round = 2,
    reviewer_name = 'Gensler', review_action = 'revise_resubmit'
  WHERE project_id = v_proj_b AND revision IS NULL;


  -- ═══════════════════════════════════════════════════════════════════
  -- DAILY LOGS — 30 days for project A, 15 for project B
  -- ═══════════════════════════════════════════════════════════════════
  v_base_month := v_today - INTERVAL '45 days';

  FOR i IN 0..29 LOOP
    INSERT INTO cp_daily_log (
      env_id, business_id, project_id, log_date,
      weather_high, weather_low, weather_conditions,
      manpower_count, superintendent, work_completed,
      visitors, incidents, deliveries, equipment,
      safety_observations, notes, created_by
    ) VALUES (
      v_env, v_biz, v_proj_a, v_base_month + i,
      65 + (i % 20), 42 + (i % 15),
      CASE (i % 5) WHEN 0 THEN 'Clear' WHEN 1 THEN 'Partly Cloudy' WHEN 2 THEN 'Overcast' WHEN 3 THEN 'Rain' ELSE 'Clear' END,
      45 + (i % 30),
      'M. Rodriguez',
      CASE (i % 6)
        WHEN 0 THEN 'Structural steel erection floors 12-14. Curtain wall installation floor 8.'
        WHEN 1 THEN 'MEP rough-in floors 5-7. Fire suppression testing floors 3-4.'
        WHEN 2 THEN 'Drywall finishing floors 2-3. Elevator shaft framing complete.'
        WHEN 3 THEN 'Lobby marble installation in progress. IT backbone cable pulls floors 1-4.'
        WHEN 4 THEN 'Roof membrane installation 50%% complete. Generator pad poured.'
        ELSE     'Exterior glazing floors 15-17. Interior framing floors 9-10.'
      END,
      CASE WHEN i % 7 = 0 THEN 'Owner walkthrough by JLL PM team' WHEN i % 10 = 0 THEN 'City inspector — fire rated assembly' ELSE NULL END,
      CASE WHEN i = 12 THEN 'Minor hand laceration — first aid applied on site' ELSE NULL END,
      CASE WHEN i % 3 = 0 THEN 'Steel delivery from Nucor — 14 beams' WHEN i % 4 = 0 THEN 'Curtain wall panels — 8 units' ELSE NULL END,
      CASE WHEN i % 2 = 0 THEN 'Tower crane, 2 man-lifts, concrete pump' ELSE 'Tower crane, 1 man-lift' END,
      CASE WHEN i % 8 = 0 THEN 'Housekeeping fair — debris on floor 6 stairwell' ELSE 'No observations' END,
      NULL,
      'system'
    ) ON CONFLICT (project_id, log_date) DO NOTHING;
  END LOOP;

  FOR i IN 0..14 LOOP
    INSERT INTO cp_daily_log (
      env_id, business_id, project_id, log_date,
      weather_high, weather_low, weather_conditions,
      manpower_count, superintendent, work_completed,
      deliveries, equipment, notes, created_by
    ) VALUES (
      v_env, v_biz, v_proj_b, v_base_month + i,
      70 + (i % 15), 52 + (i % 10),
      CASE (i % 4) WHEN 0 THEN 'Clear' WHEN 1 THEN 'Humid' WHEN 2 THEN 'Partly Cloudy' ELSE 'Thunderstorms' END,
      28 + (i % 20),
      'K. Washington',
      CASE (i % 4)
        WHEN 0 THEN 'Foundation excavation south wing complete. Formwork for grade beams.'
        WHEN 1 THEN 'Rebar placement parking level B1. Waterproofing east wall.'
        WHEN 2 THEN 'Concrete pour — mat slab section 3 of 6. 180 CY placed.'
        ELSE     'Backfill and compaction north side. Utility stub-outs complete.'
      END,
      CASE WHEN i % 3 = 0 THEN 'Ready-mix concrete — 6 trucks' ELSE NULL END,
      'Excavator, 2 skid steers, concrete pump',
      NULL,
      'system'
    ) ON CONFLICT (project_id, log_date) DO NOTHING;
  END LOOP;


  -- ═══════════════════════════════════════════════════════════════════
  -- MEETINGS — 8 meetings across both projects
  -- ═══════════════════════════════════════════════════════════════════

  -- Meeting 1: OAC for project A
  v_meeting_id := gen_random_uuid();
  INSERT INTO cp_meeting (meeting_id, env_id, business_id, project_id, meeting_type, meeting_date, location, called_by, attendees, agenda, minutes, status, created_by)
  VALUES (v_meeting_id, v_env, v_biz, v_proj_a, 'oac', v_today - 14, 'Owner Conference Room', 'JLL PM',
    '["A. Thompson (PM)", "M. Chen (Owner Rep)", "J. Davis (Turner)", "S. Park (HOK)"]'::jsonb,
    'Budget status, schedule update, RFI log review, submittal status, change order approvals',
    'Budget tracking within contingency. Schedule shows 3-day slip on curtain wall — recovery plan presented. 4 RFIs pending architect response. CO-002 approved for additional structural reinforcement.',
    'completed', 'system');
  INSERT INTO cp_meeting_item (env_id, business_id, meeting_id, item_number, topic, discussion, action_required, responsible_party, due_date, status, created_by) VALUES
    (v_env, v_biz, v_meeting_id, 1, 'Curtain wall schedule recovery', 'Turner proposed weekend shifts to recover 3-day slip', 'Submit revised schedule by Friday', 'J. Davis (Turner)', v_today - 7, 'closed', 'system'),
    (v_env, v_biz, v_meeting_id, 2, 'RFI-007 structural embed locations', 'HOK reviewing clash detection results', 'Issue RFI response', 'S. Park (HOK)', v_today - 5, 'closed', 'system'),
    (v_env, v_biz, v_meeting_id, 3, 'Lobby material samples', 'Owner reviewing marble vs porcelain options', 'Confirm material selection', 'M. Chen (Owner Rep)', v_today + 7, 'open', 'system'),
    (v_env, v_biz, v_meeting_id, 4, 'CO-003 MEP coordination scope', 'Additional ductwork rerouting needed on floors 6-8', 'Price and submit PCO', 'J. Davis (Turner)', v_today + 3, 'in_progress', 'system');

  -- Meeting 2: Progress for project A
  v_meeting_id := gen_random_uuid();
  INSERT INTO cp_meeting (meeting_id, env_id, business_id, project_id, meeting_type, meeting_date, location, called_by, attendees, minutes, status, created_by)
  VALUES (v_meeting_id, v_env, v_biz, v_proj_a, 'progress', v_today - 7, 'Site Trailer', 'A. Thompson',
    '["A. Thompson (PM)", "M. Rodriguez (Super)", "R. Kim (MEP Sub)"]'::jsonb,
    'MEP rough-in on track for floors 5-7. Fire suppression testing passed floors 3-4. Elevator machine room framing behind by 2 days.',
    'completed', 'system');
  INSERT INTO cp_meeting_item (env_id, business_id, meeting_id, item_number, topic, action_required, responsible_party, due_date, status, created_by) VALUES
    (v_env, v_biz, v_meeting_id, 1, 'Elevator machine room recovery', 'Add crew for weekend work', 'M. Rodriguez', v_today - 3, 'closed', 'system'),
    (v_env, v_biz, v_meeting_id, 2, 'Fire alarm panel delivery', 'Confirm delivery date with supplier', 'R. Kim', v_today + 5, 'open', 'system'),
    (v_env, v_biz, v_meeting_id, 3, 'Floor 7 duct coordination', 'Resolve clash at grid C-7', 'R. Kim', v_today + 2, 'in_progress', 'system');

  -- Meeting 3: Safety for project A
  v_meeting_id := gen_random_uuid();
  INSERT INTO cp_meeting (meeting_id, env_id, business_id, project_id, meeting_type, meeting_date, location, called_by, minutes, status, created_by)
  VALUES (v_meeting_id, v_env, v_biz, v_proj_a, 'safety', v_today - 10, 'Site', 'Safety Officer',
    '["Safety Officer", "All Foremen"]'::jsonb,
    'Reviewed fall protection compliance on upper floors. One near-miss reported — guardrail not secured on floor 14. Corrected immediately.',
    'completed', 'system');
  INSERT INTO cp_meeting_item (env_id, business_id, meeting_id, item_number, topic, action_required, responsible_party, due_date, status, created_by) VALUES
    (v_env, v_biz, v_meeting_id, 1, 'Guardrail inspection protocol', 'Daily guardrail checklist for all floors above 10', 'Safety Officer', v_today - 8, 'closed', 'system'),
    (v_env, v_biz, v_meeting_id, 2, 'PPE audit', 'Conduct full PPE audit next Monday', 'Safety Officer', v_today - 3, 'closed', 'system');

  -- Meeting 4: OAC for project B
  v_meeting_id := gen_random_uuid();
  INSERT INTO cp_meeting (meeting_id, env_id, business_id, project_id, meeting_type, meeting_date, location, called_by, attendees, minutes, status, created_by)
  VALUES (v_meeting_id, v_env, v_biz, v_proj_b, 'oac', v_today - 7, 'Owner Office', 'Cushman PM',
    '["L. Morgan (PM)", "T. Brooks (Owner)", "W. Chen (B&G)", "A. Patel (Gensler)"]'::jsonb,
    'Foundation work on schedule. Structural steel shop drawings submitted for review. Budget under by $120K. Permit for vertical construction expected next week.',
    'completed', 'system');
  INSERT INTO cp_meeting_item (env_id, business_id, meeting_id, item_number, topic, action_required, responsible_party, due_date, status, created_by) VALUES
    (v_env, v_biz, v_meeting_id, 1, 'Steel shop drawing review', 'Complete review and return comments', 'A. Patel (Gensler)', v_today + 3, 'open', 'system'),
    (v_env, v_biz, v_meeting_id, 2, 'Vertical permit status', 'Follow up with city planning', 'L. Morgan', v_today + 5, 'open', 'system'),
    (v_env, v_biz, v_meeting_id, 3, 'Utility connection coordination', 'Schedule pre-con with Charleston Water', 'W. Chen (B&G)', v_today + 10, 'open', 'system');

  -- Meeting 5: Preconstruction for project B
  v_meeting_id := gen_random_uuid();
  INSERT INTO cp_meeting (meeting_id, env_id, business_id, project_id, meeting_type, meeting_date, location, called_by, minutes, status, created_by)
  VALUES (v_meeting_id, v_env, v_biz, v_proj_b, 'preconstruction', v_today - 21, 'B&G Office', 'W. Chen',
    '["L. Morgan (PM)", "W. Chen (B&G)", "A. Patel (Gensler)", "MEP Subs"]'::jsonb,
    'Reviewed 90%% CD set. MEP coordination model at 60%%. Agreed on phased pour schedule for parking structure.',
    'completed', 'system');
  INSERT INTO cp_meeting_item (env_id, business_id, meeting_id, item_number, topic, action_required, responsible_party, due_date, status, created_by) VALUES
    (v_env, v_biz, v_meeting_id, 1, 'MEP coordination model', 'Complete 100%% model and run clash detection', 'MEP Subs', v_today - 7, 'closed', 'system'),
    (v_env, v_biz, v_meeting_id, 2, 'Phased pour schedule', 'Issue final pour schedule', 'W. Chen (B&G)', v_today - 14, 'closed', 'system');

  -- Meetings 6-8: additional meetings
  v_meeting_id := gen_random_uuid();
  INSERT INTO cp_meeting (meeting_id, env_id, business_id, project_id, meeting_type, meeting_date, location, called_by, minutes, status, created_by)
  VALUES (v_meeting_id, v_env, v_biz, v_proj_a, 'design_review', v_today - 28, 'HOK Studio', 'S. Park',
    '["S. Park (HOK)", "A. Thompson (PM)", "Interior Designer"]'::jsonb,
    'Reviewed lobby design intent, elevator cab finishes, and restroom fixture selections. Owner approved marble option A.',
    'completed', 'system');

  v_meeting_id := gen_random_uuid();
  INSERT INTO cp_meeting (meeting_id, env_id, business_id, project_id, meeting_type, meeting_date, location, called_by, status, created_by)
  VALUES (v_meeting_id, v_env, v_biz, v_proj_a, 'progress', v_today + 7, 'Site Trailer', 'A. Thompson',
    '["A. Thompson (PM)", "All Subs"]'::jsonb, 'scheduled', 'system');

  v_meeting_id := gen_random_uuid();
  INSERT INTO cp_meeting (meeting_id, env_id, business_id, project_id, meeting_type, meeting_date, location, called_by, status, created_by)
  VALUES (v_meeting_id, v_env, v_biz, v_proj_b, 'oac', v_today + 14, 'Owner Office', 'Cushman PM',
    '["L. Morgan (PM)", "T. Brooks (Owner)", "W. Chen (B&G)"]'::jsonb, 'scheduled', 'system');


  -- ═══════════════════════════════════════════════════════════════════
  -- DRAWINGS — 25 drawings across both projects
  -- ═══════════════════════════════════════════════════════════════════

  INSERT INTO cp_drawing (env_id, business_id, project_id, discipline, sheet_number, title, revision, issue_date, status, created_by) VALUES
    -- Project A: Architectural
    (v_env, v_biz, v_proj_a, 'architectural', 'A-001', 'Cover Sheet & Drawing Index', 'C', v_today - 60, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'architectural', 'A-101', 'Floor Plan — Level 1 Lobby', 'D', v_today - 30, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'architectural', 'A-102', 'Floor Plan — Typical Office (Floors 5-30)', 'B', v_today - 45, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'architectural', 'A-201', 'Building Sections', 'B', v_today - 45, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'architectural', 'A-301', 'Exterior Elevations — North & South', 'C', v_today - 30, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'architectural', 'A-501', 'Lobby Finish Details', 'A', v_today - 20, 'for_review', 'system'),
    -- Project A: Structural
    (v_env, v_biz, v_proj_a, 'structural', 'S-101', 'Foundation Plan', 'B', v_today - 90, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'structural', 'S-201', 'Framing Plan — Typical Floor', 'C', v_today - 60, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'structural', 'S-301', 'Steel Connection Details', 'B', v_today - 50, 'current', 'system'),
    -- Project A: MEP
    (v_env, v_biz, v_proj_a, 'mechanical', 'M-101', 'HVAC Floor Plan — Typical', 'B', v_today - 40, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'mechanical', 'M-201', 'Mechanical Room Layout', 'A', v_today - 40, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'electrical', 'E-101', 'Electrical Floor Plan — Typical', 'B', v_today - 40, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'electrical', 'E-201', 'Electrical Panel Schedules', 'A', v_today - 35, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'plumbing', 'P-101', 'Plumbing Floor Plan — Typical', 'A', v_today - 40, 'current', 'system'),
    (v_env, v_biz, v_proj_a, 'fire_protection', 'FP-101', 'Fire Suppression Floor Plan', 'B', v_today - 35, 'current', 'system'),
    -- Project A: Civil
    (v_env, v_biz, v_proj_a, 'civil', 'C-101', 'Site Plan & Grading', 'A', v_today - 120, 'superseded', 'system'),
    (v_env, v_biz, v_proj_a, 'civil', 'C-101', 'Site Plan & Grading', 'B', v_today - 90, 'current', 'system'),
    -- Project B: Architectural
    (v_env, v_biz, v_proj_b, 'architectural', 'A-001', 'Cover Sheet', 'A', v_today - 45, 'current', 'system'),
    (v_env, v_biz, v_proj_b, 'architectural', 'A-101', 'Site Plan', 'B', v_today - 30, 'current', 'system'),
    (v_env, v_biz, v_proj_b, 'architectural', 'A-201', 'Parking Level B1 Plan', 'A', v_today - 30, 'current', 'system'),
    (v_env, v_biz, v_proj_b, 'architectural', 'A-301', 'Typical Residential Floor Plan', 'A', v_today - 25, 'for_review', 'system'),
    -- Project B: Structural
    (v_env, v_biz, v_proj_b, 'structural', 'S-101', 'Foundation Plan', 'A', v_today - 40, 'current', 'system'),
    (v_env, v_biz, v_proj_b, 'structural', 'S-201', 'Parking Structure Framing', 'A', v_today - 35, 'current', 'system'),
    -- Project B: Civil
    (v_env, v_biz, v_proj_b, 'civil', 'C-101', 'Grading & Drainage Plan', 'B', v_today - 50, 'current', 'system'),
    (v_env, v_biz, v_proj_b, 'civil', 'C-201', 'Utility Plan', 'A', v_today - 45, 'current', 'system')
  ON CONFLICT (project_id, discipline, sheet_number, revision) DO NOTHING;


  -- ═══════════════════════════════════════════════════════════════════
  -- PAY APPLICATIONS — 6 pay apps across both projects
  -- ═══════════════════════════════════════════════════════════════════

  IF v_contract_a1 IS NOT NULL THEN
    -- Pay App #1: Paid
    INSERT INTO cp_pay_app (
      env_id, business_id, project_id, contract_id, vendor_id, pay_app_number,
      billing_period_start, billing_period_end,
      scheduled_value, work_completed_previous, work_completed_this_period,
      stored_materials_previous, stored_materials_current,
      total_completed_stored, retainage_pct, retainage_amount,
      total_earned_less_retainage, previous_payments, current_payment_due, balance_to_finish,
      status, submitted_date, approved_date, paid_date, created_by
    ) VALUES (
      v_env, v_biz, v_proj_a, v_contract_a1, v_vendor_a1, 1,
      v_today - 90, v_today - 61,
      3500000, 0, 420000,
      0, 35000,
      455000, 10.0000, 45500,
      409500, 0, 409500, 3045000,
      'paid', v_today - 58, v_today - 52, v_today - 45, 'system'
    ) ON CONFLICT (project_id, contract_id, pay_app_number) DO NOTHING;

    -- Pay App #2: Paid
    INSERT INTO cp_pay_app (
      env_id, business_id, project_id, contract_id, vendor_id, pay_app_number,
      billing_period_start, billing_period_end,
      scheduled_value, work_completed_previous, work_completed_this_period,
      stored_materials_previous, stored_materials_current,
      total_completed_stored, retainage_pct, retainage_amount,
      total_earned_less_retainage, previous_payments, current_payment_due, balance_to_finish,
      status, submitted_date, approved_date, paid_date, created_by
    ) VALUES (
      v_env, v_biz, v_proj_a, v_contract_a1, v_vendor_a1, 2,
      v_today - 60, v_today - 31,
      3500000, 420000, 580000,
      35000, 42000,
      1077000, 10.0000, 107700,
      969300, 409500, 559800, 2423000,
      'paid', v_today - 28, v_today - 22, v_today - 15, 'system'
    ) ON CONFLICT (project_id, contract_id, pay_app_number) DO NOTHING;

    -- Pay App #3: Approved, awaiting payment
    INSERT INTO cp_pay_app (
      env_id, business_id, project_id, contract_id, vendor_id, pay_app_number,
      billing_period_start, billing_period_end,
      scheduled_value, work_completed_previous, work_completed_this_period,
      stored_materials_previous, stored_materials_current,
      total_completed_stored, retainage_pct, retainage_amount,
      total_earned_less_retainage, previous_payments, current_payment_due, balance_to_finish,
      status, submitted_date, approved_date, created_by
    ) VALUES (
      v_env, v_biz, v_proj_a, v_contract_a1, v_vendor_a1, 3,
      v_today - 30, v_today - 1,
      3500000, 1000000, 650000,
      77000, 28000,
      1755000, 10.0000, 175500,
      1579500, 969300, 610200, 1745000,
      'approved', v_today - 5, v_today - 2, 'system'
    ) ON CONFLICT (project_id, contract_id, pay_app_number) DO NOTHING;
  END IF;

  IF v_contract_a2 IS NOT NULL THEN
    -- Pay App #1 for second contract: Submitted, under review
    INSERT INTO cp_pay_app (
      env_id, business_id, project_id, contract_id, vendor_id, pay_app_number,
      billing_period_start, billing_period_end,
      scheduled_value, work_completed_previous, work_completed_this_period,
      stored_materials_previous, stored_materials_current,
      total_completed_stored, retainage_pct, retainage_amount,
      total_earned_less_retainage, previous_payments, current_payment_due, balance_to_finish,
      status, submitted_date, created_by
    ) VALUES (
      v_env, v_biz, v_proj_a, v_contract_a2, v_vendor_a2, 1,
      v_today - 30, v_today - 1,
      6400000, 0, 890000,
      0, 120000,
      1010000, 10.0000, 101000,
      909000, 0, 909000, 5390000,
      'submitted', v_today - 3, 'system'
    ) ON CONFLICT (project_id, contract_id, pay_app_number) DO NOTHING;
  END IF;

  IF v_contract_b1 IS NOT NULL THEN
    -- Pay App #1 for project B: Paid
    INSERT INTO cp_pay_app (
      env_id, business_id, project_id, contract_id, vendor_id, pay_app_number,
      billing_period_start, billing_period_end,
      scheduled_value, work_completed_previous, work_completed_this_period,
      stored_materials_previous, stored_materials_current,
      total_completed_stored, retainage_pct, retainage_amount,
      total_earned_less_retainage, previous_payments, current_payment_due, balance_to_finish,
      status, submitted_date, approved_date, paid_date, created_by
    ) VALUES (
      v_env, v_biz, v_proj_b, v_contract_b1, v_vendor_b1, 1,
      v_today - 60, v_today - 31,
      2800000, 0, 340000,
      0, 55000,
      395000, 10.0000, 39500,
      355500, 0, 355500, 2405000,
      'paid', v_today - 28, v_today - 22, v_today - 14, 'system'
    ) ON CONFLICT (project_id, contract_id, pay_app_number) DO NOTHING;

    -- Pay App #2 for project B: Draft
    INSERT INTO cp_pay_app (
      env_id, business_id, project_id, contract_id, vendor_id, pay_app_number,
      billing_period_start, billing_period_end,
      scheduled_value, work_completed_previous, work_completed_this_period,
      stored_materials_previous, stored_materials_current,
      total_completed_stored, retainage_pct, retainage_amount,
      total_earned_less_retainage, previous_payments, current_payment_due, balance_to_finish,
      status, created_by
    ) VALUES (
      v_env, v_biz, v_proj_b, v_contract_b1, v_vendor_b1, 2,
      v_today - 30, v_today - 1,
      2800000, 340000, 410000,
      55000, 30000,
      835000, 10.0000, 83500,
      751500, 355500, 396000, 1965000,
      'draft', 'system'
    ) ON CONFLICT (project_id, contract_id, pay_app_number) DO NOTHING;
  END IF;

  RAISE NOTICE 'cp_seed: seeded daily logs, meetings, drawings, pay apps for projects % and %', v_proj_a, v_proj_b;

END $$;
