-- 406_cp_draw_seed.sql
-- Seed data for draw management — demo draws across existing seed projects.
-- Follows 397_cp_seed.sql pattern: DO block with ON CONFLICT DO NOTHING.

DO $$
DECLARE
  v_env_id     uuid;
  v_biz_id     uuid;
  v_proj1      uuid;
  v_proj2      uuid;
  v_draw1      uuid;
  v_draw2      uuid;
  v_draw3      uuid;
  v_inv1       uuid;
  v_insp1      uuid;
BEGIN
  -- Resolve the first seed environment + business (same lookup as 397)
  SELECT env_id, business_id INTO v_env_id, v_biz_id
  FROM pds_projects
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_env_id IS NULL THEN
    RAISE NOTICE 'No seed projects found — skipping draw seed';
    RETURN;
  END IF;

  -- Pick first two projects
  SELECT project_id INTO v_proj1
  FROM pds_projects WHERE env_id = v_env_id AND business_id = v_biz_id
  ORDER BY name LIMIT 1;

  SELECT project_id INTO v_proj2
  FROM pds_projects WHERE env_id = v_env_id AND business_id = v_biz_id
  ORDER BY name LIMIT 1 OFFSET 1;

  IF v_proj1 IS NULL THEN
    RAISE NOTICE 'Need at least one project for draw seed';
    RETURN;
  END IF;

  -- ── Project 1: 3 draws at various stages ──────────────────────

  -- Draw #1: funded
  INSERT INTO cp_draw_request (
    draw_request_id, env_id, business_id, project_id, draw_number, title,
    billing_period_start, billing_period_end,
    total_previous_draws, total_current_draw, total_materials_stored,
    total_retainage_held, total_amount_due,
    status, submitted_at, approved_at, approved_by, submitted_to_lender_at, funded_at,
    created_by
  ) VALUES (
    gen_random_uuid(), v_env_id, v_biz_id, v_proj1, 1, 'Draw #1 — Foundation & Sitework',
    '2025-12-01', '2025-12-31',
    0, 450000, 35000,
    48500, 436500,
    'funded', now() - interval '60 days', now() - interval '55 days', 'pm@novendor.io',
    now() - interval '50 days', now() - interval '45 days',
    'seed'
  ) ON CONFLICT DO NOTHING
  RETURNING draw_request_id INTO v_draw1;

  -- Draw #2: approved, awaiting lender submission
  INSERT INTO cp_draw_request (
    draw_request_id, env_id, business_id, project_id, draw_number, title,
    billing_period_start, billing_period_end,
    total_previous_draws, total_current_draw, total_materials_stored,
    total_retainage_held, total_amount_due,
    status, submitted_at, approved_at, approved_by,
    created_by
  ) VALUES (
    gen_random_uuid(), v_env_id, v_biz_id, v_proj1, 2, 'Draw #2 — Structural & MEP Rough-In',
    '2026-01-01', '2026-01-31',
    485000, 620000, 48000,
    115300, 1037700,
    'approved', now() - interval '20 days', now() - interval '15 days', 'pm@novendor.io',
    'seed'
  ) ON CONFLICT DO NOTHING
  RETURNING draw_request_id INTO v_draw2;

  -- Draw #3: draft in progress
  INSERT INTO cp_draw_request (
    draw_request_id, env_id, business_id, project_id, draw_number, title,
    billing_period_start, billing_period_end,
    total_previous_draws, total_current_draw, total_materials_stored,
    total_retainage_held, total_amount_due,
    status,
    created_by
  ) VALUES (
    gen_random_uuid(), v_env_id, v_biz_id, v_proj1, 3, 'Draw #3 — Interior Finishes',
    '2026-02-01', '2026-02-28',
    1153000, 380000, 22000,
    155500, 1399500,
    'draft',
    'seed'
  ) ON CONFLICT DO NOTHING
  RETURNING draw_request_id INTO v_draw3;

  -- ── Line items for Draw #3 (draft — the one users will interact with) ──

  IF v_draw3 IS NOT NULL THEN
    INSERT INTO cp_draw_line_item (env_id, business_id, draw_request_id, cost_code, description,
      scheduled_value, previous_draws, current_draw, materials_stored,
      total_completed, percent_complete, retainage_pct, retainage_amount, balance_to_finish)
    VALUES
      (v_env_id, v_biz_id, v_draw3, '01-100', 'General Conditions',
       250000, 180000, 35000, 0, 215000, 86.0000, 10.0000, 21500, 35000),
      (v_env_id, v_biz_id, v_draw3, '03-300', 'Cast-in-Place Concrete',
       680000, 620000, 45000, 0, 665000, 97.7941, 10.0000, 66500, 15000),
      (v_env_id, v_biz_id, v_draw3, '05-100', 'Structural Steel',
       420000, 180000, 120000, 12000, 312000, 74.2857, 10.0000, 31200, 108000),
      (v_env_id, v_biz_id, v_draw3, '09-250', 'Gypsum Board Assemblies',
       185000, 45000, 65000, 8000, 118000, 63.7838, 10.0000, 11800, 67000),
      (v_env_id, v_biz_id, v_draw3, '09-650', 'Resilient Flooring',
       95000, 0, 28000, 2000, 30000, 31.5789, 10.0000, 3000, 65000),
      (v_env_id, v_biz_id, v_draw3, '15-100', 'Plumbing',
       310000, 88000, 52000, 0, 140000, 45.1613, 10.0000, 14000, 170000),
      (v_env_id, v_biz_id, v_draw3, '16-100', 'Electrical',
       380000, 40000, 35000, 0, 75000, 19.7368, 10.0000, 7500, 305000)
    ON CONFLICT DO NOTHING;

    -- Flag one line item with a variance
    UPDATE cp_draw_line_item
    SET variance_flag = true,
        variance_reason = 'Overbill: cost code 03-300 is at 97.8% complete but current draw requests additional $45,000'
    WHERE draw_request_id = v_draw3 AND cost_code = '03-300';
  END IF;

  -- ── Sample invoice for Draw #3 ────────────────────────────────

  IF v_draw3 IS NOT NULL THEN
    INSERT INTO cp_invoice (
      invoice_id, env_id, business_id, project_id, draw_request_id,
      invoice_number, invoice_date, total_amount,
      ocr_status, ocr_confidence, match_status, match_confidence,
      matched_cost_code, file_name, status, created_by
    ) VALUES (
      gen_random_uuid(), v_env_id, v_biz_id, v_proj1, v_draw3,
      'INV-2026-0234', '2026-02-15', 52000,
      'completed', 0.9200, 'auto_matched', 0.9500,
      '15-100', 'apex-plumbing-feb-2026.pdf', 'verified', 'seed'
    ) ON CONFLICT DO NOTHING
    RETURNING invoice_id INTO v_inv1;
  END IF;

  -- ── Sample inspection for Draw #2 ─────────────────────────────

  IF v_draw2 IS NOT NULL THEN
    INSERT INTO cp_inspection (
      inspection_id, env_id, business_id, project_id, draw_request_id,
      inspector_name, inspection_date, inspection_type,
      overall_pct_complete, findings, passed, created_by
    ) VALUES (
      gen_random_uuid(), v_env_id, v_biz_id, v_proj1, v_draw2,
      'John Rivera, PE', '2026-01-28', 'lender',
      72.5000,
      'Structural steel substantially complete. MEP rough-in on track. Minor punch items in elevator shaft.',
      true, 'seed'
    ) ON CONFLICT DO NOTHING
    RETURNING inspection_id INTO v_insp1;
  END IF;

  -- ── Audit log entries ──────────────────────────────────────────

  IF v_draw1 IS NOT NULL THEN
    INSERT INTO cp_draw_audit_log (env_id, business_id, project_id, draw_request_id, entity_type, entity_id, action, actor, hitl_approval, new_state)
    VALUES
      (v_env_id, v_biz_id, v_proj1, v_draw1, 'draw_request', v_draw1, 'created', 'seed', false, '{"status":"draft"}'::jsonb),
      (v_env_id, v_biz_id, v_proj1, v_draw1, 'draw_request', v_draw1, 'status_change', 'pm@novendor.io', false, '{"status":"pending_review"}'::jsonb),
      (v_env_id, v_biz_id, v_proj1, v_draw1, 'draw_request', v_draw1, 'status_change', 'pm@novendor.io', true, '{"status":"approved"}'::jsonb),
      (v_env_id, v_biz_id, v_proj1, v_draw1, 'draw_request', v_draw1, 'status_change', 'pm@novendor.io', true, '{"status":"submitted_to_lender"}'::jsonb),
      (v_env_id, v_biz_id, v_proj1, v_draw1, 'draw_request', v_draw1, 'status_change', 'system', false, '{"status":"funded"}'::jsonb);
  END IF;

  IF v_draw2 IS NOT NULL THEN
    INSERT INTO cp_draw_audit_log (env_id, business_id, project_id, draw_request_id, entity_type, entity_id, action, actor, hitl_approval, new_state)
    VALUES
      (v_env_id, v_biz_id, v_proj1, v_draw2, 'draw_request', v_draw2, 'created', 'seed', false, '{"status":"draft"}'::jsonb),
      (v_env_id, v_biz_id, v_proj1, v_draw2, 'draw_request', v_draw2, 'status_change', 'pm@novendor.io', false, '{"status":"pending_review"}'::jsonb),
      (v_env_id, v_biz_id, v_proj1, v_draw2, 'draw_request', v_draw2, 'status_change', 'pm@novendor.io', true, '{"status":"approved"}'::jsonb);
  END IF;

  IF v_draw3 IS NOT NULL THEN
    INSERT INTO cp_draw_audit_log (env_id, business_id, project_id, draw_request_id, entity_type, entity_id, action, actor, hitl_approval, new_state)
    VALUES
      (v_env_id, v_biz_id, v_proj1, v_draw3, 'draw_request', v_draw3, 'created', 'seed', false, '{"status":"draft"}'::jsonb);
  END IF;

  RAISE NOTICE 'Draw seed complete: 3 draws, line items, 1 invoice, 1 inspection, audit entries';
END;
$$;
