-- 1004: Task management tables (projects, issues, boards, sprints, comments, links, activity)
-- Required by backend/app/services/tasks.py and backend/app/routes/tasks.py

CREATE SCHEMA IF NOT EXISTS app;

-- ── Projects ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_project (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    key         TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.task_project IS 'Task management projects — each project groups issues, boards, sprints. Owned by tasks module.';

-- ── Boards ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_board (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES app.task_project(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    board_type  TEXT NOT NULL DEFAULT 'scrum',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);
COMMENT ON TABLE app.task_board IS 'Kanban/scrum boards per project. Owned by tasks module.';

-- ── Statuses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_status (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES app.task_project(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'todo',
    order_index INT NOT NULL DEFAULT 0,
    color_token TEXT,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (project_id, key)
);
COMMENT ON TABLE app.task_status IS 'Workflow statuses per project (todo, in_progress, done, etc). Owned by tasks module.';

-- ── Sprints ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_sprint (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES app.task_project(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    start_date  DATE,
    end_date    DATE,
    status      TEXT NOT NULL DEFAULT 'planned',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.task_sprint IS 'Sprint iterations per project. Owned by tasks module.';

-- ── Issues ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_issue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES app.task_project(id) ON DELETE CASCADE,
    issue_key       TEXT NOT NULL UNIQUE,
    type            TEXT NOT NULL DEFAULT 'task',
    title           TEXT NOT NULL,
    description_md  TEXT,
    status_id       UUID NOT NULL REFERENCES app.task_status(id),
    priority        TEXT NOT NULL DEFAULT 'medium',
    assignee        TEXT,
    reporter        TEXT,
    labels          JSONB NOT NULL DEFAULT '[]'::jsonb,
    estimate_points INT,
    due_date        DATE,
    sprint_id       UUID REFERENCES app.task_sprint(id) ON DELETE SET NULL,
    backlog_rank    NUMERIC NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.task_issue IS 'Individual task/issue records. Owned by tasks module.';

CREATE INDEX IF NOT EXISTS task_issue_project_idx ON app.task_issue (project_id);
CREATE INDEX IF NOT EXISTS task_issue_status_idx ON app.task_issue (status_id);
CREATE INDEX IF NOT EXISTS task_issue_sprint_idx ON app.task_issue (sprint_id);

-- ── Comments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_comment (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id    UUID NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
    author      TEXT NOT NULL,
    body_md     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.task_comment IS 'Comments on task issues. Owned by tasks module.';

-- ── Issue Links ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_issue_link (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_issue_id   UUID NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
    to_issue_id     UUID NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
    link_type       TEXT NOT NULL DEFAULT 'related',
    UNIQUE (from_issue_id, to_issue_id, link_type)
);
COMMENT ON TABLE app.task_issue_link IS 'Relationships between issues (blocks, related, duplicates). Owned by tasks module.';

-- ── Attachments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_issue_attachment (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id    UUID NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
    document_id UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (issue_id, document_id)
);
COMMENT ON TABLE app.task_issue_attachment IS 'Document attachments on issues. Owned by tasks module.';

-- ── Context Links ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_issue_context_link (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id    UUID NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
    link_kind   TEXT NOT NULL,
    link_ref    TEXT NOT NULL,
    link_label  TEXT NOT NULL,
    UNIQUE (issue_id, link_kind, link_ref)
);
COMMENT ON TABLE app.task_issue_context_link IS 'Contextual links from issues to external entities (env, fund, asset, etc). Owned by tasks module.';

-- ── Activity Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.task_activity (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id    UUID NOT NULL REFERENCES app.task_issue(id) ON DELETE CASCADE,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    before_json JSONB,
    after_json  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE app.task_activity IS 'Audit trail for issue changes. Owned by tasks module.';

CREATE INDEX IF NOT EXISTS task_activity_issue_idx ON app.task_activity (issue_id, created_at DESC);
