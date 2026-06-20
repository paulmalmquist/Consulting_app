-- 10019_intelligence_cards.sql
-- Intelligence Card System for the executive intelligence surface (plan PR 4, Phase 2).
--
-- A card is a unit of the living feed: it can represent a dashboard, report, story,
-- investigation, forecast, finding, or alert. PR 4 ships the data model + components
-- only — no home-page wiring (PR 5), no agents/investigations/analyzers.
--
-- Operational state only: priority_score and anomaly_flag drive float-up ordering in
-- the feed. Card engagement trends (impressions, clicks, dismissals, fork rate) belong
-- in BigQuery (winston_analytics.card_performance), not in more Postgres columns.
--
-- Owning module: backend/app/services/intelligence_cards.py. Surfaced read+write via
-- /api/ade/intel/cards. Per-environment business data: full RLS + env_id/business_id.
-- Approved prefix: nv_ (Novendor platform-core; no new prefix introduced).

CREATE TABLE IF NOT EXISTS nv_intel_cards (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    card_type       text NOT NULL
                    CHECK (card_type IN ('dashboard', 'report', 'story', 'investigation', 'forecast', 'finding', 'alert')),
    title           text NOT NULL,
    summary         text,
    source_ref      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {type, id, ...} provenance of the card
    source_ref_key  text NOT NULL,                        -- deterministic key for idempotent upsert
    priority_score  double precision NOT NULL DEFAULT 0,  -- 0-1, drives float-up ordering
    anomaly_flag    boolean NOT NULL DEFAULT false,
    created_by      text,                                 -- 'system' | 'agent:cfo' | 'user' | 'autopilot'
    is_dismissed    boolean NOT NULL DEFAULT false,
    last_updated_at timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (env_id, source_ref_key)
);

-- Feed read path: env-scoped, non-dismissed first, highest priority + most recent on top.
CREATE INDEX IF NOT EXISTS nv_intel_cards_feed_idx
    ON nv_intel_cards (env_id, is_dismissed, priority_score DESC, last_updated_at DESC);

ALTER TABLE nv_intel_cards ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    CREATE POLICY nv_intel_cards_tenant ON nv_intel_cards
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

COMMENT ON TABLE nv_intel_cards IS
    'Intelligence Card System living feed (plan PR 4). Operational state only: '
    'priority_score/anomaly_flag drive float-up ordering. Card engagement analytics go to '
    'BigQuery (winston_analytics.card_performance). Owning module: intelligence_cards.py.';
