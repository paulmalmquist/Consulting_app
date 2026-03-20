-- 400_cp_draw_request.sql
-- Construction draw request lifecycle: draft -> pending_review -> approved -> submitted_to_lender -> funded.

CREATE TABLE IF NOT EXISTS cp_draw_request (
  draw_request_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                     uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id                 uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  draw_number                int NOT NULL,
  title                      text,
  billing_period_start       date,
  billing_period_end         date,
  -- Aggregated totals (computed from line items via draw_calculator)
  total_previous_draws       numeric(28,12) NOT NULL DEFAULT 0,
  total_current_draw         numeric(28,12) NOT NULL DEFAULT 0,
  total_materials_stored     numeric(28,12) NOT NULL DEFAULT 0,
  total_retainage_held       numeric(28,12) NOT NULL DEFAULT 0,
  total_amount_due           numeric(28,12) NOT NULL DEFAULT 0,
  -- Lifecycle
  status                     text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','revision_requested','approved','submitted_to_lender','funded','rejected')),
  submitted_at               timestamptz,
  approved_at                timestamptz,
  approved_by                text,
  submitted_to_lender_at     timestamptz,
  funded_at                  timestamptz,
  rejected_at                timestamptz,
  rejection_reason           text,
  -- Variance
  variance_flags_json        jsonb NOT NULL DEFAULT '[]'::jsonb,
  variance_amount_at_risk    numeric(28,12) NOT NULL DEFAULT 0,
  -- Integration
  lender_reference           text,
  g702_storage_key           text,
  -- Standard columns (matches cp_pay_app pattern from 395)
  source                     text NOT NULL DEFAULT 'manual',
  version_no                 int NOT NULL DEFAULT 1,
  metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                 text,
  updated_by                 text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, draw_number)
);
