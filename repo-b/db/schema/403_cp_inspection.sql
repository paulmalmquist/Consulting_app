-- 403_cp_inspection.sql
-- Field verification records linked to draw requests.

CREATE TABLE IF NOT EXISTS cp_inspection (
  inspection_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id                     uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id                uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id                 uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  draw_request_id            uuid REFERENCES cp_draw_request(draw_request_id) ON DELETE SET NULL,
  inspector_name             text NOT NULL,
  inspection_date            date NOT NULL,
  inspection_type            text NOT NULL DEFAULT 'progress'
    CHECK (inspection_type IN ('progress','lender','third_party','final')),
  overall_pct_complete       numeric(8,4) DEFAULT 0,
  findings                   text,
  recommendations            text,
  passed                     boolean,
  photo_urls                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Standard columns
  source                     text NOT NULL DEFAULT 'manual',
  metadata_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                 text,
  updated_by                 text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
