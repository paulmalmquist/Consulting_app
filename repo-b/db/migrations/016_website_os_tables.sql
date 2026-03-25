-- Migration 016: Website Operating System module tables
-- All tables scoped by environment_id (CASCADE delete when env removed)
-- No global bleed: environment_id is the hard boundary for all website data

-- ── Content items (editorial pipeline) ────────────────────────────────
CREATE TABLE IF NOT EXISTS website_content_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id  uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  title           text        NOT NULL,
  slug            text        NOT NULL,
  category        text,
  area            text,
  state           text        NOT NULL DEFAULT 'idea'
                  CHECK (state IN ('idea', 'draft', 'review', 'scheduled', 'published')),
  target_keyword  text,
  monetization_type text      DEFAULT 'none'
                  CHECK (monetization_type IN ('affiliate', 'sponsor', 'lead_gen', 'none')),
  publish_date    date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_content_items_env_state
  ON website_content_items (environment_id, state);
CREATE INDEX IF NOT EXISTS idx_website_content_items_env
  ON website_content_items (environment_id);
CREATE INDEX IF NOT EXISTS idx_website_content_items_env_created
  ON website_content_items (environment_id, created_at DESC);

-- ── Entities (restaurants, venues, businesses being ranked) ───────────
CREATE TABLE IF NOT EXISTS website_entities (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id   uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  name             text        NOT NULL,
  category         text,
  location         text,
  website          text,
  instagram        text,
  tags             jsonb       NOT NULL DEFAULT '[]',
  editorial_notes  text,
  last_verified_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_entities_env_category
  ON website_entities (environment_id, category);
CREATE INDEX IF NOT EXISTS idx_website_entities_env
  ON website_entities (environment_id);
CREATE INDEX IF NOT EXISTS idx_website_entities_env_created
  ON website_entities (environment_id, created_at DESC);

-- ── Ranking lists ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_ranking_lists (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  name           text        NOT NULL,
  category       text,
  area           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_ranking_lists_env
  ON website_ranking_lists (environment_id);
CREATE INDEX IF NOT EXISTS idx_website_ranking_lists_env_created
  ON website_ranking_lists (environment_id, created_at DESC);

-- ── Ranking entries (ordered positions within a list) ─────────────────
CREATE TABLE IF NOT EXISTS website_ranking_entries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_list_id uuid        NOT NULL REFERENCES website_ranking_lists(id) ON DELETE CASCADE,
  entity_id       uuid        REFERENCES website_entities(id) ON DELETE SET NULL,
  rank            integer     NOT NULL,
  score           numeric(5, 2),
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_website_ranking_entries_list_rank
  ON website_ranking_entries (ranking_list_id, rank);
CREATE INDEX IF NOT EXISTS idx_website_ranking_entries_list
  ON website_ranking_entries (ranking_list_id);

-- ── Ranking audit log (immutable change history) ──────────────────────
CREATE TABLE IF NOT EXISTS website_ranking_changes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id  uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  ranking_list_id uuid        NOT NULL REFERENCES website_ranking_lists(id) ON DELETE CASCADE,
  entity_id       uuid        REFERENCES website_entities(id) ON DELETE SET NULL,
  old_rank        integer,
  new_rank        integer     NOT NULL,
  changed_by      text        NOT NULL DEFAULT 'operator',
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_ranking_changes_env_date
  ON website_ranking_changes (environment_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_ranking_changes_env
  ON website_ranking_changes (environment_id);

-- ── Champion badges ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_champion_badges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  entity_id      uuid        NOT NULL REFERENCES website_entities(id) ON DELETE CASCADE,
  badge_type     text        NOT NULL
                 CHECK (badge_type IN ('area_champ', 'p4p_champ')),
  awarded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_champion_badges_env
  ON website_champion_badges (environment_id);

-- ── Analytics snapshots (time-series, manual or import) ───────────────
CREATE TABLE IF NOT EXISTS website_analytics_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  date           date        NOT NULL,
  sessions       integer     NOT NULL DEFAULT 0,
  pageviews      integer     NOT NULL DEFAULT 0,
  conversions    integer     NOT NULL DEFAULT 0,
  revenue        numeric(12, 2) NOT NULL DEFAULT 0,
  top_page       text,
  UNIQUE (environment_id, date)
);

CREATE INDEX IF NOT EXISTS idx_website_analytics_snapshots_env_date
  ON website_analytics_snapshots (environment_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_website_analytics_snapshots_env
  ON website_analytics_snapshots (environment_id);

-- ── Transactions (simple accounting) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS website_transactions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  date           date        NOT NULL DEFAULT CURRENT_DATE,
  category       text        NOT NULL CHECK (category IN ('revenue', 'expense')),
  subcategory    text,
  amount         numeric(12, 2) NOT NULL,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_transactions_env_date
  ON website_transactions (environment_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_website_transactions_env
  ON website_transactions (environment_id);
CREATE INDEX IF NOT EXISTS idx_website_transactions_env_created
  ON website_transactions (environment_id, created_at DESC);

-- ── Tasks (projects module, lightweight) ─────────────────────────────
CREATE TABLE IF NOT EXISTS website_tasks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid        NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  title          text        NOT NULL,
  status         text        NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo', 'in_progress', 'done')),
  priority       text        NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high')),
  due_date       date,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_tasks_env_status
  ON website_tasks (environment_id, status);
CREATE INDEX IF NOT EXISTS idx_website_tasks_env
  ON website_tasks (environment_id);
CREATE INDEX IF NOT EXISTS idx_website_tasks_env_created
  ON website_tasks (environment_id, created_at DESC);
