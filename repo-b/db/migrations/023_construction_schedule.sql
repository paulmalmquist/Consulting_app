CREATE TABLE IF NOT EXISTS re_construction_draw (
  draw_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  asset_id uuid REFERENCES repe_asset(asset_id) ON DELETE CASCADE,
  draw_date date NOT NULL,
  amount numeric NOT NULL,
  draw_type text NOT NULL CHECK (draw_type IN ('hard_cost', 'soft_cost', 'contingency')),
  status text NOT NULL DEFAULT 'projected',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS re_construction_draw_fund_asset_date_idx
  ON re_construction_draw (fund_id, asset_id, draw_date);
