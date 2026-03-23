-- 405_cp_draw_indexes_views.sql
-- Performance indexes and reporting views for draw management.

-- ── Indexes ──────────────────────────────────────────────────────

-- Draw requests
CREATE INDEX IF NOT EXISTS idx_cp_draw_request_project ON cp_draw_request (project_id, draw_number DESC);
CREATE INDEX IF NOT EXISTS idx_cp_draw_request_env ON cp_draw_request (env_id, business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_draw_request_status ON cp_draw_request (status) WHERE status NOT IN ('funded','rejected');

-- Draw line items
CREATE INDEX IF NOT EXISTS idx_cp_draw_line_item_draw ON cp_draw_line_item (draw_request_id);
CREATE INDEX IF NOT EXISTS idx_cp_draw_line_item_cost_code ON cp_draw_line_item (cost_code);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_cp_invoice_project ON cp_invoice (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_invoice_draw ON cp_invoice (draw_request_id) WHERE draw_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cp_invoice_match ON cp_invoice (match_status) WHERE match_status IN ('unmatched','disputed');

-- Invoice line items
CREATE INDEX IF NOT EXISTS idx_cp_invoice_line_item_invoice ON cp_invoice_line_item (invoice_id);

-- Inspections
CREATE INDEX IF NOT EXISTS idx_cp_inspection_project ON cp_inspection (project_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_cp_inspection_draw ON cp_inspection (draw_request_id) WHERE draw_request_id IS NOT NULL;

-- Audit log
CREATE INDEX IF NOT EXISTS idx_cp_draw_audit_entity ON cp_draw_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_draw_audit_draw ON cp_draw_audit_log (draw_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_draw_audit_project ON cp_draw_audit_log (project_id, created_at DESC);


-- ── Views ────────────────────────────────────────────────────────

-- Project-level draw aggregation
CREATE OR REPLACE VIEW v_project_draw_summary AS
SELECT
  dr.project_id,
  dr.env_id,
  dr.business_id,
  COUNT(*)                                              AS total_draws,
  COUNT(*) FILTER (WHERE dr.status = 'draft')           AS draft_draws,
  COUNT(*) FILTER (WHERE dr.status = 'pending_review')  AS pending_draws,
  COUNT(*) FILTER (WHERE dr.status = 'approved')        AS approved_draws,
  COUNT(*) FILTER (WHERE dr.status = 'funded')          AS funded_draws,
  COALESCE(SUM(dr.total_current_draw), 0)               AS total_drawn_amount,
  COALESCE(SUM(dr.total_retainage_held), 0)             AS total_retainage,
  COALESCE(SUM(dr.total_amount_due), 0)                 AS total_amount_due,
  MAX(dr.draw_number)                                   AS latest_draw_number,
  MAX(dr.funded_at)                                     AS last_funded_at
FROM cp_draw_request dr
GROUP BY dr.project_id, dr.env_id, dr.business_id;

-- Draw-level rollup with related entity counts
CREATE OR REPLACE VIEW v_draw_request_detail AS
SELECT
  dr.*,
  COALESCE(li.line_count, 0)        AS line_item_count,
  COALESCE(li.variance_count, 0)    AS variance_count,
  COALESCE(inv.invoice_count, 0)    AS invoice_count,
  COALESCE(insp.inspection_count, 0) AS inspection_count
FROM cp_draw_request dr
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS line_count,
         COUNT(*) FILTER (WHERE variance_flag = true) AS variance_count
  FROM cp_draw_line_item
  WHERE draw_request_id = dr.draw_request_id
) li ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS invoice_count
  FROM cp_invoice
  WHERE draw_request_id = dr.draw_request_id
) inv ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS inspection_count
  FROM cp_inspection
  WHERE draw_request_id = dr.draw_request_id
) insp ON true;
