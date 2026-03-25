-- 393_cp_daily_logs.sql
-- Detailed construction daily logs (richer than pds_site_reports).

CREATE TABLE IF NOT EXISTS cp_daily_log (
  daily_log_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id             uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  log_date           date NOT NULL,
  weather_high       int,
  weather_low        int,
  weather_conditions text,
  manpower_count     int NOT NULL DEFAULT 0,
  superintendent     text,
  work_completed     text,
  visitors           text,
  incidents          text,
  deliveries         text,
  equipment          text,
  safety_observations text,
  notes              text,
  photo_urls         jsonb NOT NULL DEFAULT '[]'::jsonb,
  source             text NOT NULL DEFAULT 'manual',
  version_no         int NOT NULL DEFAULT 1,
  metadata_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         text,
  updated_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, log_date)
);
