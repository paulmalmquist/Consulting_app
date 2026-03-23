-- 230_milestones.sql
-- MODULE: milestones
-- Standalone milestone templates and instances, attachable to any object_id.
-- When both projects + milestones modules are enabled, projects.milestone
-- handles project-specific milestones; milestone_instance here can attach
-- to any object (project, property, capex_project, etc.) via object_id.

-- ═══════════════════════════════════════════════════════
-- MILESTONE TEMPLATES
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS milestone_template (
  milestone_template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  key                   text NOT NULL,
  name                  text NOT NULL,
  description           text,
  default_offset_days   int NOT NULL DEFAULT 0,
  sort_order            int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_id, key)
);

-- ═══════════════════════════════════════════════════════
-- MILESTONE INSTANCES (attached to objects)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS milestone_instance (
  milestone_instance_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  business_id           uuid NOT NULL REFERENCES business(business_id),
  milestone_template_id uuid REFERENCES milestone_template(milestone_template_id),
  object_id             uuid NOT NULL REFERENCES object(object_id),
  name                  text NOT NULL,
  due_date              date,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','in_progress','completed','missed','cancelled','blocked')),
  completed_at          timestamptz,
  completed_by          uuid REFERENCES actor(actor_id),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- MILESTONE EVENTS (append-only history)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS milestone_event (
  milestone_event_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenant(tenant_id),
  milestone_instance_id uuid NOT NULL REFERENCES milestone_instance(milestone_instance_id),
  event_type            text NOT NULL
                        CHECK (event_type IN ('created','status_changed','due_date_changed','note_added','completed','reopened')),
  from_value            text,
  to_value              text,
  actor_id              uuid REFERENCES actor(actor_id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
