-- 1001_resume_narrative_engine.sql
-- Narrative engine tables for the visual resume timeline, evidence rail, and KPI anchors.

CREATE TABLE IF NOT EXISTS resume_career_phases (
  phase_id       text PRIMARY KEY,
  env_id         uuid NOT NULL,
  business_id    uuid NOT NULL,
  company        text NOT NULL,
  phase_name     text NOT NULL,
  start_date     date NOT NULL,
  end_date       date,
  description    text,
  band_color     text NOT NULL DEFAULT '#475569',
  overlay_only   boolean NOT NULL DEFAULT false,
  display_order  int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_career_phases_env ON resume_career_phases (env_id, business_id, display_order);

CREATE TABLE IF NOT EXISTS resume_capability_layers (
  layer_id       text PRIMARY KEY,
  env_id         uuid NOT NULL,
  business_id    uuid NOT NULL,
  name           text NOT NULL,
  color          text NOT NULL,
  description    text,
  sort_order     int NOT NULL DEFAULT 0,
  is_visible     boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_capability_layers_env ON resume_capability_layers (env_id, business_id, sort_order);

CREATE TABLE IF NOT EXISTS resume_delivery_initiatives (
  initiative_id                   text PRIMARY KEY,
  env_id                          uuid NOT NULL,
  business_id                     uuid NOT NULL,
  phase_id                        text REFERENCES resume_career_phases(phase_id) ON DELETE SET NULL,
  role_id                         uuid REFERENCES resume_roles(role_id) ON DELETE SET NULL,
  title                           text NOT NULL,
  summary                         text NOT NULL,
  team_context                    text NOT NULL DEFAULT '',
  business_challenge              text NOT NULL DEFAULT '',
  measurable_outcome              text NOT NULL DEFAULT '',
  stakeholder_group               text NOT NULL DEFAULT '',
  scale                           text NOT NULL DEFAULT '',
  architecture                    text NOT NULL DEFAULT '',
  start_date                      date NOT NULL,
  end_date                        date NOT NULL,
  category                        text NOT NULL DEFAULT 'foundation',
  impact_area                     text NOT NULL DEFAULT 'decision_support',
  impact_tag                      text NOT NULL DEFAULT 'Execution',
  importance                      int NOT NULL DEFAULT 50,
  capability_tags                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  technologies                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_modules                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_architecture_node_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_bi_entity_ids            jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_model_preset             text,
  metrics_json                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_delivery_initiatives_env ON resume_delivery_initiatives (env_id, business_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_resume_delivery_initiatives_phase ON resume_delivery_initiatives (phase_id);

CREATE TABLE IF NOT EXISTS resume_career_milestones (
  milestone_id                    text PRIMARY KEY,
  env_id                          uuid NOT NULL,
  business_id                     uuid NOT NULL,
  phase_id                        text REFERENCES resume_career_phases(phase_id) ON DELETE SET NULL,
  title                           text NOT NULL,
  date                            date NOT NULL,
  type                            text NOT NULL DEFAULT 'build'
                                  CHECK (type IN ('transition', 'build', 'impact', 'promotion', 'architecture', 'delivery', 'overlay')),
  summary                         text NOT NULL,
  importance                      int NOT NULL DEFAULT 50,
  play_order                      int,
  capability_tags                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_modules                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_architecture_node_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_bi_entity_ids            jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_model_preset             text,
  metrics_json                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_refs                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_spec                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_career_milestones_env ON resume_career_milestones (env_id, business_id, date);
CREATE INDEX IF NOT EXISTS idx_resume_career_milestones_phase ON resume_career_milestones (phase_id);

CREATE TABLE IF NOT EXISTS resume_accomplishment_cards (
  card_id             text PRIMARY KEY,
  env_id              uuid NOT NULL,
  business_id         uuid NOT NULL,
  phase_id            text REFERENCES resume_career_phases(phase_id) ON DELETE SET NULL,
  milestone_id        text REFERENCES resume_career_milestones(milestone_id) ON DELETE SET NULL,
  metric_key          text,
  title               text NOT NULL,
  card_type           text NOT NULL
                      CHECK (card_type IN ('context', 'problem', 'action', 'system', 'impact', 'stakeholders', 'artifact', 'snapshot', 'anecdote')),
  company             text,
  date_start          date,
  date_end            date,
  capability_tags     jsonb NOT NULL DEFAULT '[]'::jsonb,
  short_narrative     text NOT NULL DEFAULT '',
  context             text,
  action              text,
  impact              text,
  stakeholders        text,
  artifact_refs       jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_spec       jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order          int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_accomplishment_cards_env ON resume_accomplishment_cards (env_id, business_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_resume_accomplishment_cards_phase ON resume_accomplishment_cards (phase_id);
CREATE INDEX IF NOT EXISTS idx_resume_accomplishment_cards_milestone ON resume_accomplishment_cards (milestone_id);

CREATE TABLE IF NOT EXISTS resume_metric_anchors (
  anchor_id                    text PRIMARY KEY,
  env_id                       uuid NOT NULL,
  business_id                  uuid NOT NULL,
  hero_metric_key              text NOT NULL,
  title                        text NOT NULL,
  default_view                 text NOT NULL DEFAULT 'impact'
                               CHECK (default_view IN ('career', 'delivery', 'capability', 'impact')),
  linked_phase_ids             jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_milestone_ids         jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_capability_layer_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  narrative_hint               text,
  sort_order                   int NOT NULL DEFAULT 0,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id, business_id, hero_metric_key)
);

CREATE INDEX IF NOT EXISTS idx_resume_metric_anchors_env ON resume_metric_anchors (env_id, business_id, sort_order);
