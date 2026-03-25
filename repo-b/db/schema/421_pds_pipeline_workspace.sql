-- 421_pds_pipeline_workspace.sql
-- Richer lifecycle tracking for the PDS pipeline workspace.

ALTER TABLE IF EXISTS pds_pipeline_deals
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS lost_reason text;

UPDATE pds_pipeline_deals
SET stage_entered_at = COALESCE(stage_entered_at, updated_at, created_at, now()),
    last_activity_at = COALESCE(last_activity_at, updated_at, created_at, now())
WHERE stage_entered_at IS NULL
   OR last_activity_at IS NULL;

ALTER TABLE IF EXISTS pds_pipeline_deals
  ALTER COLUMN stage_entered_at SET DEFAULT now(),
  ALTER COLUMN last_activity_at SET DEFAULT now();

CREATE TABLE IF NOT EXISTS pds_pipeline_deal_stage_history (
  stage_history_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id              uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id         uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  deal_id             uuid NOT NULL REFERENCES pds_pipeline_deals(deal_id) ON DELETE CASCADE,
  from_stage          text,
  to_stage            text NOT NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  note                text
);

CREATE INDEX IF NOT EXISTS idx_pds_pipeline_stage_history_lookup
  ON pds_pipeline_deal_stage_history (env_id, business_id, deal_id, changed_at DESC);

INSERT INTO pds_pipeline_deal_stage_history (env_id, business_id, deal_id, from_stage, to_stage, changed_at, note)
SELECT d.env_id, d.business_id, d.deal_id, NULL, d.stage, COALESCE(d.stage_entered_at, d.created_at, now()), 'Initial stage'
FROM pds_pipeline_deals d
WHERE NOT EXISTS (
  SELECT 1
  FROM pds_pipeline_deal_stage_history h
  WHERE h.deal_id = d.deal_id
);

CREATE TABLE IF NOT EXISTS pds_pipeline_snapshot_daily (
  pipeline_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id               uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id          uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  snapshot_date        date NOT NULL,
  total_pipeline_value numeric(18,2) NOT NULL DEFAULT 0,
  total_weighted_value numeric(18,2) NOT NULL DEFAULT 0,
  active_deal_count    int NOT NULL DEFAULT 0,
  won_count            int NOT NULL DEFAULT 0,
  converted_count      int NOT NULL DEFAULT 0,
  lost_count           int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pds_pipeline_snapshot_lookup
  ON pds_pipeline_snapshot_daily (env_id, business_id, snapshot_date DESC);
