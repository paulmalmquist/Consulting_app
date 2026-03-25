-- 399_resume_environment.sql
-- Visual Resume lab environment: career roles, skills inventory, and projects.
-- Supports the interactive resume dashboard + AI assistant.

-- ── Career Roles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resume_roles (
  role_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid NOT NULL,
  business_id    uuid NOT NULL,
  company        text NOT NULL,
  division       text,
  title          text NOT NULL,
  location       text,
  start_date     date NOT NULL,
  end_date       date,
  role_type      text NOT NULL DEFAULT 'engineering'
                 CHECK (role_type IN ('engineering', 'leadership', 'consulting', 'founder')),
  industry       text,
  summary        text,
  highlights     jsonb NOT NULL DEFAULT '[]'::jsonb,
  technologies   jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_roles_env ON resume_roles (env_id);
CREATE INDEX IF NOT EXISTS idx_resume_roles_biz ON resume_roles (business_id);

-- ── Skills Inventory ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resume_skills (
  skill_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid NOT NULL,
  business_id    uuid NOT NULL,
  name           text NOT NULL,
  category       text NOT NULL
                 CHECK (category IN ('data_platform', 'ai_ml', 'languages', 'cloud', 'visualization', 'domain', 'leadership')),
  proficiency    int NOT NULL DEFAULT 5 CHECK (proficiency BETWEEN 1 AND 10),
  years_used     int,
  context        text,
  current        boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, name)
);

CREATE INDEX IF NOT EXISTS idx_resume_skills_env ON resume_skills (env_id);

-- ── Projects / Case Studies ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resume_projects (
  project_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id         uuid NOT NULL,
  business_id    uuid NOT NULL,
  name           text NOT NULL,
  client         text,
  role_id        uuid REFERENCES resume_roles(role_id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'completed'
                 CHECK (status IN ('completed', 'active', 'concept')),
  summary        text,
  impact         text,
  technologies   jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics        jsonb NOT NULL DEFAULT '[]'::jsonb,
  url            text,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_projects_env ON resume_projects (env_id);
