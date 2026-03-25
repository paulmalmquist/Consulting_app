-- 398_development_asset_bridge.sql
-- Bridge: links PDS analytics projects to REPE assets for development tracking.
-- Enables construction execution data to flow into investment modeling.

-- ── Bridge Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dev_project_asset_link (
  link_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                 uuid NOT NULL,
  business_id            uuid NOT NULL,
  pds_project_id         uuid NOT NULL,
  repe_asset_id          uuid NOT NULL,
  fin_construction_id    uuid,
  link_type              text NOT NULL DEFAULT 'ground_up'
                         CHECK (link_type IN ('ground_up', 'major_renovation', 'value_add', 'repositioning')),
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'completed', 'suspended')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, pds_project_id, repe_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_dev_link_env      ON dev_project_asset_link (env_id);
CREATE INDEX IF NOT EXISTS idx_dev_link_asset    ON dev_project_asset_link (repe_asset_id);
CREATE INDEX IF NOT EXISTS idx_dev_link_project  ON dev_project_asset_link (pds_project_id);

-- ── Development Assumption Sets ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS dev_assumption_set (
  assumption_set_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id                uuid NOT NULL REFERENCES dev_project_asset_link(link_id) ON DELETE CASCADE,
  scenario_label         text NOT NULL DEFAULT 'base',

  -- Cost assumptions
  hard_cost              numeric(28,2),
  soft_cost              numeric(28,2),
  contingency            numeric(28,2),
  financing_cost         numeric(28,2),
  total_development_cost numeric(28,2),

  -- Timing assumptions
  construction_start     date,
  construction_end       date,
  lease_up_start         date,
  lease_up_months        int,
  stabilization_date     date,

  -- Stabilized operating assumptions
  stabilized_occupancy   numeric(8,4),
  stabilized_noi         numeric(28,2),
  exit_cap_rate          numeric(8,4),

  -- Debt assumptions
  construction_loan_amt  numeric(28,2),
  construction_loan_rate numeric(8,4),
  perm_loan_amt          numeric(28,2),
  perm_loan_rate         numeric(8,4),

  -- Calculated outputs (populated by bridge service)
  yield_on_cost          numeric(8,4),
  stabilized_value       numeric(28,2),
  projected_irr          numeric(8,4),
  projected_moic         numeric(8,4),

  -- Meta
  is_base                boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_id, scenario_label)
);

-- ── Draw Schedule ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dev_draw_schedule (
  draw_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assumption_set_id      uuid NOT NULL REFERENCES dev_assumption_set(assumption_set_id) ON DELETE CASCADE,
  draw_date              date NOT NULL,
  draw_amount            numeric(28,2) NOT NULL,
  cumulative_drawn       numeric(28,2),
  draw_type              text DEFAULT 'scheduled'
                         CHECK (draw_type IN ('scheduled', 'actual', 'forecast')),
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_draw_assumption ON dev_draw_schedule (assumption_set_id, draw_date);
