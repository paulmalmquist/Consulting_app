CREATE TABLE IF NOT EXISTS re_scenario_template (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  cap_rate_delta_bps integer NOT NULL DEFAULT 0,
  noi_stress_pct numeric NOT NULL DEFAULT 0,
  exit_date_shift_months integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT true,
  env_id uuid REFERENCES app.environments(env_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS re_scenario_template_env_name_idx
  ON re_scenario_template (env_id, name);

INSERT INTO re_scenario_template (
  name,
  description,
  cap_rate_delta_bps,
  noi_stress_pct,
  exit_date_shift_months,
  is_system
)
VALUES
  ('covid_stress', '150 bps cap-rate expansion, 15% NOI stress, and a 12 month exit delay.', 150, -0.15, 12, true),
  ('rate_shock_200', '200 bps cap-rate expansion with a mild NOI drag.', 200, -0.05, 0, true),
  ('delayed_exit_18mo', 'Base operations with an 18 month exit delay.', 0, 0, 18, true),
  ('mild_downside', '50 bps cap-rate expansion, 3% NOI stress, and a 6 month exit delay.', 50, -0.03, 6, true),
  ('deep_recession', '250 bps cap-rate expansion, 25% NOI stress, and a 24 month exit delay.', 250, -0.25, 24, true)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    cap_rate_delta_bps = EXCLUDED.cap_rate_delta_bps,
    noi_stress_pct = EXCLUDED.noi_stress_pct,
    exit_date_shift_months = EXCLUDED.exit_date_shift_months,
    is_system = EXCLUDED.is_system;
