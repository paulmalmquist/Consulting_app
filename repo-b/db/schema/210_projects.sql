-- 210_projects.sql
-- MODULE: projects
-- Project management, WBS, resources, timesheets, issues, risks, change orders.

-- ═══════════════════════════════════════════════════════
-- PROJECTS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project (
  project_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  code          text NOT NULL,
  name          text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'planning'
                CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  start_date    date,
  target_end    date,
  actual_end    date,
  budget        numeric(18,2),
  currency_code text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  manager_id    uuid REFERENCES actor(actor_id),
  object_id     uuid REFERENCES object(object_id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, code)
);

-- ═══════════════════════════════════════════════════════
-- WORK BREAKDOWN STRUCTURE
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS work_breakdown_item (
  wbs_item_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  project_id    uuid NOT NULL REFERENCES project(project_id),
  parent_id     uuid REFERENCES work_breakdown_item(wbs_item_id),
  code          text NOT NULL,
  name          text NOT NULL,
  sort_order    int NOT NULL DEFAULT 0,
  planned_hours numeric(18,2),
  actual_hours  numeric(18,2) DEFAULT 0,
  status        text NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started','in_progress','completed','cancelled')),
  start_date    date,
  end_date      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

-- ═══════════════════════════════════════════════════════
-- MILESTONES (project-level; see also 230_milestones.sql for standalone)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS milestone (
  milestone_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  project_id    uuid NOT NULL REFERENCES project(project_id),
  name          text NOT NULL,
  due_date      date,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','completed','missed','cancelled')),
  completed_at  timestamptz,
  object_id     uuid REFERENCES object(object_id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- RESOURCES & ASSIGNMENTS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS resource (
  resource_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  actor_id      uuid REFERENCES actor(actor_id),
  name          text NOT NULL,
  role          text,
  hourly_rate   numeric(18,2),
  currency_code text NOT NULL DEFAULT 'USD' REFERENCES dim_currency(currency_code),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignment (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  project_id    uuid NOT NULL REFERENCES project(project_id),
  resource_id   uuid NOT NULL REFERENCES resource(resource_id),
  wbs_item_id   uuid REFERENCES work_breakdown_item(wbs_item_id),
  planned_hours numeric(18,2),
  start_date    date,
  end_date      date,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- TIMESHEETS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS timesheet (
  timesheet_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id   uuid NOT NULL REFERENCES business(business_id),
  resource_id   uuid NOT NULL REFERENCES resource(resource_id),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at  timestamptz,
  approved_by   uuid REFERENCES actor(actor_id),
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_entry (
  time_entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  timesheet_id  uuid NOT NULL REFERENCES timesheet(timesheet_id),
  project_id    uuid NOT NULL REFERENCES project(project_id),
  wbs_item_id   uuid REFERENCES work_breakdown_item(wbs_item_id),
  entry_date    date NOT NULL,
  hours         numeric(18,2) NOT NULL CHECK (hours > 0),
  description   text,
  is_billable   boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- ISSUES, RISKS, CHANGE ORDERS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS issue (
  issue_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  project_id    uuid NOT NULL REFERENCES project(project_id),
  title         text NOT NULL,
  description   text,
  priority      text NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high','critical')),
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to   uuid REFERENCES actor(actor_id),
  resolved_at   timestamptz,
  object_id     uuid REFERENCES object(object_id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk (
  risk_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(tenant_id),
  project_id    uuid NOT NULL REFERENCES project(project_id),
  title         text NOT NULL,
  description   text,
  probability   text NOT NULL DEFAULT 'medium'
                CHECK (probability IN ('low','medium','high')),
  impact        text NOT NULL DEFAULT 'medium'
                CHECK (impact IN ('low','medium','high')),
  status        text NOT NULL DEFAULT 'identified'
                CHECK (status IN ('identified','mitigating','accepted','closed')),
  mitigation    text,
  owner_id      uuid REFERENCES actor(actor_id),
  object_id     uuid REFERENCES object(object_id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS change_order (
  change_order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(tenant_id),
  project_id      uuid NOT NULL REFERENCES project(project_id),
  title           text NOT NULL,
  description     text,
  cost_impact     numeric(18,2) DEFAULT 0,
  schedule_impact_days int DEFAULT 0,
  status          text NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed','approved','rejected','implemented')),
  approved_by     uuid REFERENCES actor(actor_id),
  approved_at     timestamptz,
  object_id       uuid REFERENCES object(object_id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Bridge: add FK from journal_line.project_id to project
-- Uses DO block for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_line_project_id_fkey'
  ) THEN
    ALTER TABLE journal_line
      ADD CONSTRAINT journal_line_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES project(project_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- journal_line doesn't exist yet (accounting module not loaded first)
  NULL;
END;
$$;
