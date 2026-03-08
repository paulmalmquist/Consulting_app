-- 330_re_dashboards.sql
-- AI Dashboard Builder: saved dashboards, subscriptions, export history.
-- Depends on: none (standalone)
-- Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING

-- =============================================================================
-- I. Dashboard storage
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_dashboard (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    name            text NOT NULL,
    description     text,
    layout_archetype text DEFAULT 'executive_summary'
        CHECK (layout_archetype IN (
            'executive_summary','operating_review','watchlist',
            'market_comparison','custom'
        )),
    spec            jsonb NOT NULL DEFAULT '{"widgets":[]}'::jsonb,
    prompt_text     text,               -- original user prompt
    entity_scope    jsonb DEFAULT '{}',  -- { entity_type, entity_ids[], filters }
    quarter         text,
    created_by      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_dashboard_env
    ON re_dashboard (env_id, business_id);

-- =============================================================================
-- II. Dashboard favorites / bookmarks
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_dashboard_favorite (
    dashboard_id    uuid NOT NULL REFERENCES re_dashboard(id) ON DELETE CASCADE,
    user_id         text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dashboard_id, user_id)
);

-- =============================================================================
-- III. Dashboard subscriptions (scheduled delivery)
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_dashboard_subscription (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id    uuid NOT NULL REFERENCES re_dashboard(id) ON DELETE CASCADE,
    subscriber      text NOT NULL,       -- email or user_id
    frequency       text NOT NULL DEFAULT 'weekly'
        CHECK (frequency IN ('daily','weekly','monthly','quarterly')),
    delivery_format text NOT NULL DEFAULT 'pdf'
        CHECK (delivery_format IN ('pdf','csv','excel','link')),
    filter_preset   jsonb DEFAULT '{}',  -- saved filter overrides
    active          boolean DEFAULT true,
    next_delivery   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_re_dashboard_sub_active
    ON re_dashboard_subscription (active, next_delivery)
    WHERE active = true;

-- =============================================================================
-- IV. Dashboard export history (audit trail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS re_dashboard_export (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id    uuid NOT NULL REFERENCES re_dashboard(id) ON DELETE CASCADE,
    format          text NOT NULL,
    exported_by     text,
    filters_used    jsonb DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);
