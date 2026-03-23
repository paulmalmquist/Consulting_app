-- 394_cp_meetings.sql
-- Meeting minutes and action items for construction projects.

CREATE TABLE IF NOT EXISTS cp_meeting (
  meeting_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id       uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES pds_projects(project_id) ON DELETE CASCADE,
  meeting_type      text NOT NULL DEFAULT 'progress'
    CHECK (meeting_type IN ('oac','progress','safety','preconstruction','closeout','design_review','other')),
  meeting_date      date NOT NULL,
  location          text,
  called_by         text,
  attendees         jsonb NOT NULL DEFAULT '[]'::jsonb,
  agenda            text,
  minutes           text,
  next_meeting_date date,
  status            text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled')),
  source            text NOT NULL DEFAULT 'manual',
  version_no        int NOT NULL DEFAULT 1,
  metadata_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        text,
  updated_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cp_meeting_item (
  meeting_item_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id            uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id       uuid NOT NULL REFERENCES business(business_id) ON DELETE CASCADE,
  meeting_id        uuid NOT NULL REFERENCES cp_meeting(meeting_id) ON DELETE CASCADE,
  item_number       int NOT NULL,
  topic             text NOT NULL,
  discussion        text,
  action_required   text,
  responsible_party text,
  due_date          date,
  status            text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','closed')),
  source            text NOT NULL DEFAULT 'manual',
  version_no        int NOT NULL DEFAULT 1,
  metadata_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        text,
  updated_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, item_number)
);
