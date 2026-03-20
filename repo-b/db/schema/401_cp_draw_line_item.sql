-- 401_cp_draw_line_item.sql
-- Per-budget-line amounts per draw — mirrors AIA G703 continuation sheet structure.

CREATE TABLE IF NOT EXISTS cp_draw_line_item (
  line_item_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                     uuid NOT NULL,
  business_id                uuid NOT NULL,
  draw_request_id            uuid NOT NULL REFERENCES cp_draw_request(draw_request_id) ON DELETE CASCADE,
  -- Budget reference
  cost_code                  text NOT NULL,
  description                text NOT NULL,
  contract_id                uuid REFERENCES pds_contracts(contract_id) ON DELETE SET NULL,
  vendor_id                  uuid REFERENCES pds_vendors(vendor_id) ON DELETE SET NULL,
  -- G703 columns
  scheduled_value            numeric(28,12) NOT NULL DEFAULT 0,
  previous_draws             numeric(28,12) NOT NULL DEFAULT 0,
  current_draw               numeric(28,12) NOT NULL DEFAULT 0,
  materials_stored           numeric(28,12) NOT NULL DEFAULT 0,
  total_completed            numeric(28,12) NOT NULL DEFAULT 0,
  percent_complete           numeric(8,4) NOT NULL DEFAULT 0,
  retainage_pct              numeric(8,4) NOT NULL DEFAULT 10.0000,
  retainage_amount           numeric(28,12) NOT NULL DEFAULT 0,
  balance_to_finish          numeric(28,12) NOT NULL DEFAULT 0,
  -- Variance
  variance_flag              boolean NOT NULL DEFAULT false,
  variance_reason            text,
  -- Override
  override_reason            text,
  -- Standard
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draw_request_id, cost_code)
);
