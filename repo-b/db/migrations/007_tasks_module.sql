-- Migration 007: Tasks module (Jira-style project/issue/board/sprint tracking).
-- Deterministic and auditable schema for Winston Tasks v1.

-- ─────────────────────────────────────────────────────────────
-- Projects + boards
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key text NOT NULL UNIQUE,
  description text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_project_key_format_ck CHECK (key ~ '^[A-Z][A-Z0-9_]{1,11}$')
);

CREATE TABLE IF NOT EXISTS app.task_board (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.task_project(id) ON DELETE CASCADE,
  name text NOT NULL,
  board_type text NOT NULL CHECK (board_type IN ('kanban', 'scrum')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- Workflow/statuses
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.task_project(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('todo', 'doing', 'done')),
  order_index int NOT NULL DEFAULT 0,
  color_token text NULL,
  is_default boolean NOT NULL DEFAULT false,
  UNIQUE (project_id, key)
);

CREATE INDEX IF NOT EXISTS task_status_project_order_idx
  ON app.task_status (project_id, order_index ASC, created_at ASC);

-- ─────────────────────────────────────────────────────────────
-- Sprints
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_sprint (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.task_project(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NULL,
  end_date date NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS task_sprint_project_status_idx
  ON app.task_sprint (project_id, status, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Issues
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.task_project(id) ON DELETE CASCADE,
  issue_key text NOT NULL,
  type text NOT NULL DEFAULT 'task' CHECK (type IN ('task', 'bug', 'story', 'epic')),
  title text NOT NULL,
  description_md text NOT NULL DEFAULT '',
  status_id uuid NOT NULL REFERENCES app.task_status(id) ON DELETE RESTRICT,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee text NULL,
  reporter text NOT NULL DEFAULT 'system',
  labels text[] NOT NULL DEFAULT '{}'::text[],
  estimate_points int NULL,
  due_date date NULL,
  sprint_id uuid NULL REFERENCES app.task_sprint(id) ON DELETE SET NULL,
  backlog_rank numeric(20, 6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, issue_key)
);

CREATE INDEX IF NOT EXISTS task_issue_project_issue_key_idx
  ON app.task_issue (project_id, issue_key);

CREATE INDEX IF NOT EXISTS task_issue_project_status_sprint_idx
  ON app.task_issue (project_id, status_id, sprint_id);

CREATE INDEX IF NOT EXISTS task_issue_project_rank_idx
  ON app.task_issue (project_id, backlog_rank ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS task_issue_labels_gin_idx
  ON app.task_issue USING gin (labels);

CREATE INDEX IF NOT EXISTS task_issue_search_idx
  ON app.task_issue USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description_md, '')));

-- ─────────────────────────────────────────────────────────────
-- Comments + activity
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
  author text NOT NULL,
  body_md text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_comment_issue_created_idx
  ON app.task_comment (issue_id, created_at ASC);

CREATE TABLE IF NOT EXISTS app.task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  before_json jsonb NULL,
  after_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_activity_issue_created_idx
  ON app.task_activity (issue_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Issue relations
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_issue_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_issue_id uuid NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
  to_issue_id uuid NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('blocks', 'blocked_by', 'relates_to', 'duplicates')),
  CONSTRAINT task_issue_link_self_ref_ck CHECK (from_issue_id <> to_issue_id),
  UNIQUE (from_issue_id, to_issue_id, link_type)
);

CREATE INDEX IF NOT EXISTS task_issue_link_to_issue_idx
  ON app.task_issue_link (to_issue_id);

-- ─────────────────────────────────────────────────────────────
-- Attachments (references app.documents)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_issue_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES app.documents(document_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_id, document_id)
);

CREATE INDEX IF NOT EXISTS task_issue_attachment_document_idx
  ON app.task_issue_attachment (document_id);

-- ─────────────────────────────────────────────────────────────
-- Context links into Winston
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_issue_context_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
  link_kind text NOT NULL CHECK (
    link_kind IN (
      'department',
      'capability',
      'environment',
      'document',
      'execution',
      'run',
      'report',
      'metric'
    )
  ),
  link_ref text NOT NULL,
  link_label text NOT NULL,
  UNIQUE (issue_id, link_kind, link_ref)
);

CREATE INDEX IF NOT EXISTS task_issue_context_kind_ref_idx
  ON app.task_issue_context_link (link_kind, link_ref);

-- ─────────────────────────────────────────────────────────────
-- updated_at triggers (if app.set_updated_at exists)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'set_updated_at'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'task_project_set_updated_at') THEN
      CREATE TRIGGER task_project_set_updated_at
        BEFORE UPDATE ON app.task_project
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'task_issue_set_updated_at') THEN
      CREATE TRIGGER task_issue_set_updated_at
        BEFORE UPDATE ON app.task_issue
        FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
    END IF;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Metrics registry integration (if table exists from migration 006)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'metrics_data_point_registry'
  ) THEN
    INSERT INTO app.metrics_data_point_registry (
      data_point_key,
      source_table_key,
      aggregation,
      value_column,
      columns_json,
      metadata_json
    ) VALUES
      ('tasks.created_count', 'task_issue', 'count', NULL, '["id","created_at","project_id"]'::jsonb, '{"module":"tasks","v":"1"}'::jsonb),
      ('tasks.completed_count', 'task_issue', 'count', NULL, '["id","updated_at","status_id","project_id"]'::jsonb, '{"module":"tasks","v":"1","done_category":"done"}'::jsonb),
      ('tasks.cycle_time_days', 'task_issue', 'avg_cycle_days', NULL, '["created_at","updated_at","status_id","project_id"]'::jsonb, '{"module":"tasks","v":"1"}'::jsonb),
      ('tasks.wip_count', 'task_issue', 'count', NULL, '["id","status_id","project_id"]'::jsonb, '{"module":"tasks","v":"1","doing_category":"doing"}'::jsonb),
      ('tasks.by_status', 'task_issue', 'count_group_status', NULL, '["id","status_id","project_id"]'::jsonb, '{"module":"tasks","v":"1"}'::jsonb)
    ON CONFLICT (
      COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(env_id, '00000000-0000-0000-0000-000000000000'::uuid),
      data_point_key
    ) DO UPDATE
    SET source_table_key = EXCLUDED.source_table_key,
        aggregation = EXCLUDED.aggregation,
        value_column = EXCLUDED.value_column,
        columns_json = EXCLUDED.columns_json,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = now();
  END IF;
END;
$$;
