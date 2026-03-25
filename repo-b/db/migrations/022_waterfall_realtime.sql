CREATE TABLE IF NOT EXISTS re_waterfall_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  fund_id uuid NOT NULL REFERENCES repe_fund(fund_id) ON DELETE CASCADE,
  run_id uuid REFERENCES re_waterfall_run(run_id) ON DELETE CASCADE,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS re_waterfall_event_fund_created_idx
  ON re_waterfall_event (fund_id, created_at DESC);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE re_waterfall_event;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
