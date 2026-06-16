-- ═══════════════════════════════════════════════════════════════════════════════
-- 10019_episode_feature_store.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- History Rhymes — Episode Feature Store (Phase 0 slice).
--
-- The learning layer that turns episodes from research documents into trainable
-- examples: derived features (episode_features), forward-looking labels
-- (episode_targets), and the governed catalog that names them (feature_registry).
--
-- Phase 0 ships only these three tables (the minimal vertical slice). The rest of
-- the warehouse — episode_clusters / episode_forecasts / episode_calibration and a
-- wide view for trainers — lands in a later migration (Phase 1). See ADO Story #624 / Feature #623.
--
-- LINEAGE (linear, by design):
--   FRED raw pull -> episode_signals (raw normalized panel, 434)
--                 -> episode_features (derived, this file)
--                 -> episode_targets  (future-outcome labels, this file)
--                 -> episode_forecasts -> episode_calibration (10019, later)
--
-- NO-LOOKAHEAD CONTRACT: an episode emits one or more `as_of_date` windows.
--   episode_features hold values computed ONLY from observations <= as_of_date.
--   episode_targets  hold outcomes  computed ONLY from observations >  as_of_date.
--
-- ENTITY-GENERIC SEAM: tables carry (entity_type, entity_id) so RS booster-flight
--   "episodes" can reuse this warehouse later with no migration. For History Rhymes
--   v1: entity_type='hr_episode', entity_id = episodes.id, and episode_id is a real
--   FK to episodes(id). For a future entity: entity_type='rs_flight',
--   entity_id = <flight id>, episode_id = NULL.
--
-- TENANT ISOLATION: these are SHARED DIMENSION tables in the History Rhymes module
--   (single-tenant analytics), exactly like public.episodes / public.episode_signals
--   / public.episode_embeddings (434/503). They intentionally carry NO env_id /
--   business_id; RLS is enabled with read-for-all + service_role-write, mirroring
--   public.episode_embeddings in 503_history_rhymes_structural.sql.
--
-- Requires: public.episodes (434_history_rhymes_wss.sql).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. feature_registry — the governed catalog (one row per named feature)
-- ───────────────────────────────────────────────────────────────────────────────
-- Naming + versioning + lineage layer. episode_features.feature_id FKs here, so a
-- feature value cannot exist without a declared definition (registry<->impl parity
-- is asserted in tests). raw_sources records provenance (e.g. ARRAY['FRED:DGS10']).

CREATE TABLE IF NOT EXISTS public.feature_registry (
    feature_id            TEXT PRIMARY KEY,
        -- stable slug, e.g. 'yc_slope', 'yc_velocity', 'credit_spread_velocity'
    feature_name          TEXT NOT NULL,
    family                TEXT NOT NULL,
        -- 'yield_curve' | 'vix' | 'credit' | 'housing' | 'labor' | 'liquidity' | 'equity'
    transform             TEXT NOT NULL,
        -- 'level' | 'slope' | 'velocity' | 'acceleration' | 'zscore' | 'percentile'
        -- | 'regime' | 'surprise' | 'trend_persistence' | 'contango' | 'shock_frequency'
    raw_sources           TEXT[] NOT NULL DEFAULT '{}',
        -- e.g. ARRAY['FRED:DGS10','FRED:DGS2']
    window_days           INTEGER,
        -- lookback window for the transform; NULL for point-in-time levels
    stale_threshold_hours INTEGER,
    value_kind            TEXT NOT NULL DEFAULT 'numeric',
        -- 'numeric' | 'categorical' (regime labels live in episode_features.value_label)
    unit                  TEXT,
    description           TEXT,
    owner                 TEXT NOT NULL DEFAULT 'history-rhymes',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (value_kind IN ('numeric', 'categorical'))
);

CREATE INDEX IF NOT EXISTS idx_feature_registry_family
    ON public.feature_registry(family);

ALTER TABLE public.feature_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_registry_read ON public.feature_registry;
CREATE POLICY feature_registry_read ON public.feature_registry
    FOR SELECT USING (true);

DROP POLICY IF EXISTS feature_registry_service_write ON public.feature_registry;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'CREATE POLICY feature_registry_service_write ON public.feature_registry FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

COMMENT ON TABLE public.feature_registry IS
    'Governed catalog of History Rhymes derived features (name, family, transform, raw sources, lineage). '
    'episode_features.feature_id references this table. Shared dimension (no env_id), mirrors the '
    'episode_embeddings tenancy stance. Owning module: skills/historyrhymes (Episode Feature Store, ADO #623).';

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. episode_features — derived feature values (long/tall) at an as_of window
-- ───────────────────────────────────────────────────────────────────────────────
-- One row per (entity, as_of_date, feature, model_version). Long form matches the
-- registry; a wide view for trainers is added in 10019. Numeric values in `value`;
-- categorical (regime) labels in `value_label`. Fail-closed: a missing value carries
-- a `null_reason` rather than a silent zero.

CREATE TABLE IF NOT EXISTS public.episode_features (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL DEFAULT 'hr_episode',
        -- 'hr_episode' now; 'rs_flight' etc. later (entity-generic seam)
    entity_id       UUID NOT NULL,
        -- for hr_episode this equals episodes.id
    episode_id      UUID REFERENCES public.episodes(id) ON DELETE CASCADE,
        -- real FK for History Rhymes; NULL for non-episode entities
    as_of_date      DATE NOT NULL,
    feature_id      TEXT NOT NULL REFERENCES public.feature_registry(feature_id),
    value           DOUBLE PRECISION,
        -- numeric value; NULL when not computable (see null_reason)
    value_label     TEXT,
        -- categorical/regime label, e.g. 'inverted' | 'flat' | 'steep'
    null_reason     TEXT,
        -- e.g. 'insufficient_history' | 'source_unavailable' (fail-closed)
    inputs_hash     TEXT NOT NULL,
        -- hash of the raw inputs used; powers idempotent re-computation
    freshness_hours NUMERIC(10,2),
    model_version   TEXT NOT NULL DEFAULT 'fs-v0',
    data_provenance TEXT NOT NULL DEFAULT 'public_fred',
        -- 'public_fred' | 'public_treasury' | 'derived' | 'synthetic_seed'
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_type, entity_id, as_of_date, feature_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_episode_features_episode
    ON public.episode_features(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_features_lookup
    ON public.episode_features(entity_type, entity_id, as_of_date);

ALTER TABLE public.episode_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS episode_features_read ON public.episode_features;
CREATE POLICY episode_features_read ON public.episode_features
    FOR SELECT USING (true);

DROP POLICY IF EXISTS episode_features_service_write ON public.episode_features;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'CREATE POLICY episode_features_service_write ON public.episode_features FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

COMMENT ON TABLE public.episode_features IS
    'Derived History Rhymes features at point-in-time as_of windows (long form). Values computed only '
    'from data <= as_of_date (no-lookahead). feature_id references feature_registry. Shared dimension '
    '(no env_id), mirrors episode_embeddings tenancy. Owning module: skills/historyrhymes (ADO #624).';

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. episode_targets — forward-looking training labels at an as_of window
-- ───────────────────────────────────────────────────────────────────────────────
-- Outcomes computed ONLY from data strictly after as_of_date. horizon_days is part
-- of the key (NOT NULL, 0 for non-horizon targets like recovery_days) so upserts
-- stay idempotent (Postgres treats NULL as distinct in UNIQUE).

CREATE TABLE IF NOT EXISTS public.episode_targets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL DEFAULT 'hr_episode',
    entity_id       UUID NOT NULL,
    episode_id      UUID REFERENCES public.episodes(id) ON DELETE CASCADE,
    as_of_date      DATE NOT NULL,
    target_name     TEXT NOT NULL,
        -- 'outcome_3m' | 'outcome_6m' | 'outcome_12m' | 'drawdown'
        -- | 'recovery_days' | 'recession_flag'
    horizon_days    INTEGER NOT NULL DEFAULT 0,
        -- 90/180/365 for outcome_*; 365 for recession_flag/drawdown; 0 for recovery_days
    value           DOUBLE PRECISION,
    null_reason     TEXT,
    source_lineage  TEXT,
        -- e.g. 'FRED:SP500 forward total return as_of+90d'
    data_provenance TEXT NOT NULL DEFAULT 'public_fred',
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (entity_type, entity_id, as_of_date, target_name, horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_episode_targets_episode
    ON public.episode_targets(episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_targets_lookup
    ON public.episode_targets(entity_type, entity_id, as_of_date);

ALTER TABLE public.episode_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS episode_targets_read ON public.episode_targets;
CREATE POLICY episode_targets_read ON public.episode_targets
    FOR SELECT USING (true);

DROP POLICY IF EXISTS episode_targets_service_write ON public.episode_targets;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'CREATE POLICY episode_targets_service_write ON public.episode_targets FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

COMMENT ON TABLE public.episode_targets IS
    'Forward-looking training labels for History Rhymes episodes (outcome_3m/6m/12m, drawdown, '
    'recovery_days, recession_flag) at as_of windows. Computed only from data > as_of_date '
    '(no-lookahead). Shared dimension (no env_id). Owning module: skills/historyrhymes (ADO #624).';
