-- ═══════════════════════════════════════════════════════════════════════════════
-- 503_history_rhymes_structural.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- History Rhymes — structural additions for the 6th-pillar build
--
-- Adds the four pieces needed to make the History Rhymes pipeline real:
--   1. episode_embeddings    — pgvector(256) HNSW table for analog retrieval
--                              (referenced by skills/historyrhymes/references/schema_supabase.sql
--                               but never previously applied as a migration)
--   2. episode_detection_audit — audit trail for the FRED-driven non-event detector
--                                (Section 4 of skills/historyrhymes/PLAN.md)
--   3. structural_alerts      — Harrison 2026 convergence alerts and similar
--                               (Section 5.5 of skills/historyrhymes/PLAN.md)
--   4. Hoyt peak episode tags — UPDATE existing 2007 GFC episode to add 'hoyt_peak' tag.
--      The two NEW Hoyt peak episodes (1973, 1990) are inserted only if they
--      don't already exist by name — keeps re-runs idempotent.
--
-- Requires: pgvector extension (created in 291_winston_demo_kb.sql / 316_rag_vector_chunks.sql)
-- Requires: public.episodes table (created in 434_history_rhymes_wss.sql)
--
-- Plan reference: skills/historyrhymes/PLAN.md (Sections 4 + 5.4 + 5.5 + 6)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;
    END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. episode_embeddings — pgvector HNSW table for analog retrieval
-- ───────────────────────────────────────────────────────────────────────────────
-- The 256-dim vector is built by skills/historyrhymes/services/state_vector_encoder.py
-- as concat(L2(quant_features_128) || L2(text_embedding_128)). See PLAN.md Section 2.

CREATE TABLE IF NOT EXISTS public.episode_embeddings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id      UUID NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
    embedding_type  VARCHAR(50) NOT NULL DEFAULT 'full_state',
        -- 'full_state' | 'narrative_only' | 'quant_only'
    embedding       vector(256) NOT NULL,
    model_version   VARCHAR(50) NOT NULL DEFAULT 'concat-l2-v1',
        -- Bumped when state_vector_encoder.py is replaced by a trained autoencoder.
        -- See the 500-vector threshold TODO in skills/historyrhymes/PLAN.md Section 2.
    feature_panel   JSONB,
        -- Optional: the raw feature dict the embedding was built from (debugging only)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (episode_id, embedding_type, model_version)
);

CREATE INDEX IF NOT EXISTS idx_episode_embeddings_episode
    ON public.episode_embeddings(episode_id);

-- HNSW index for cosine retrieval. Mirrors the rag_chunks pattern in 316_rag_vector_chunks.sql
-- but tighter ef_construction (256 vs 64) because the corpus is small (~30 episodes
-- vs millions of chunks) and we want maximum recall.
CREATE INDEX IF NOT EXISTS idx_episode_embeddings_hnsw
    ON public.episode_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 256);

ALTER TABLE public.episode_embeddings ENABLE ROW LEVEL SECURITY;

-- Episodes are a shared dimension table (no env_id / business_id). The embeddings
-- inherit that — read-allowed for any authenticated session, writes restricted to
-- the service role used by the Databricks export step.
DROP POLICY IF EXISTS episode_embeddings_read ON public.episode_embeddings;
CREATE POLICY episode_embeddings_read ON public.episode_embeddings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS episode_embeddings_service_write ON public.episode_embeddings;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'CREATE POLICY episode_embeddings_service_write ON public.episode_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

COMMENT ON TABLE public.episode_embeddings IS
    'pgvector(256) embeddings of historical episodes for History Rhymes analog retrieval. '
    'Built by skills/historyrhymes/services/state_vector_encoder.py. '
    'HNSW index supports POST /api/v1/rhymes/match cosine retrieval. '
    'Owning module: skills/historyrhymes (the 6th pillar of the ML Signal Engine).';

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. episode_detection_audit — audit trail for the FRED non-event detector
-- ───────────────────────────────────────────────────────────────────────────────
-- Every time skills/historyrhymes/notebooks/10_detect_non_events.py runs, it logs
-- one row per scanned trigger window — including the rejected ones. This is the
-- bias-control surface: a human reviewer can audit which thresholds tripped and
-- why a window was/wasn't classified as a non-event.
--
-- See PLAN.md Section 4 for the detector design.

CREATE TABLE IF NOT EXISTS public.episode_detection_audit (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    detected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    window_start       DATE NOT NULL,
    window_end         DATE NOT NULL,
    trigger_set        TEXT[] NOT NULL,
        -- e.g. ARRAY['vix_above_30', 'hy_oas_above_600bps']
    classification     VARCHAR(40) NOT NULL,
        -- 'non_event' | 'event' | 'rejected_overlap' | 'rejected_no_recovery' | 'rejected_blip'
    max_drawdown_pct   NUMERIC(8,2),
    had_recession      BOOLEAN,
    spx_recovered      BOOLEAN,
    overlap_episode_id UUID REFERENCES public.episodes(id) ON DELETE SET NULL,
    reason             TEXT,
    episode_id         UUID REFERENCES public.episodes(id) ON DELETE SET NULL,
        -- The episode that was inserted as a result of this audit row, if any.
        -- NULL when classification != 'non_event' (rejection paths).
    content_hash       TEXT NOT NULL,
        -- Dedup key: hash(window_start, window_end, sorted(trigger_set))
    CHECK (classification IN (
        'non_event', 'event', 'rejected_overlap',
        'rejected_no_recovery', 'rejected_blip'
    )),
    UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS idx_episode_detection_audit_classification
    ON public.episode_detection_audit(classification);
CREATE INDEX IF NOT EXISTS idx_episode_detection_audit_window
    ON public.episode_detection_audit(window_start, window_end);

ALTER TABLE public.episode_detection_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS episode_detection_audit_read ON public.episode_detection_audit;
CREATE POLICY episode_detection_audit_read ON public.episode_detection_audit
    FOR SELECT USING (true);

DROP POLICY IF EXISTS episode_detection_audit_service_write ON public.episode_detection_audit;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'CREATE POLICY episode_detection_audit_service_write ON public.episode_detection_audit FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;

COMMENT ON TABLE public.episode_detection_audit IS
    'Audit trail for the FRED-driven non-event detector '
    '(skills/historyrhymes/notebooks/10_detect_non_events.py). '
    'One row per scanned crisis-precursor window, including rejected ones. '
    'Used to audit the survivorship-bias correction logic. '
    'See PLAN.md Section 4. Owning module: skills/historyrhymes.';

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. structural_alerts — Harrison convergence + Hoyt cycle alerts
-- ───────────────────────────────────────────────────────────────────────────────
-- Fired by skills/historyrhymes/notebooks/08_multi_agent_forecast.py when the
-- Hoyt cycle position is within 6 months of a predicted peak AND macro stress
-- triggers fire. See PLAN.md Section 5.5.

CREATE TABLE IF NOT EXISTS public.structural_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          TEXT NOT NULL DEFAULT 'global',
    business_id     UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    alert_date      DATE NOT NULL,
    alert_type      VARCHAR(40) NOT NULL,
        -- 'hoyt_convergence' | 'era_mismatch' | 'narrative_silence' | 'honeypot_match'
    severity        VARCHAR(20) NOT NULL DEFAULT 'info',
        -- 'info' | 'warning' | 'critical'
    hoyt_position   NUMERIC(5,2),
    trigger_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
        -- e.g. {"vix_spike": true, "hy_oas_blowout": true, "yield_curve_re_inverted": false}
    narrative       TEXT,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (alert_type IN (
        'hoyt_convergence', 'era_mismatch', 'narrative_silence', 'honeypot_match'
    )),
    CHECK (severity IN ('info', 'warning', 'critical')),
    UNIQUE (business_id, alert_date, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_structural_alerts_unack
    ON public.structural_alerts(alert_date DESC, alert_type)
    WHERE acknowledged_at IS NULL;

ALTER TABLE public.structural_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS structural_alerts_tenant_isolation ON public.structural_alerts;
CREATE POLICY structural_alerts_tenant_isolation ON public.structural_alerts
    FOR ALL
    USING (env_id = current_setting('app.env_id', true) OR env_id = 'global')
    WITH CHECK (env_id = current_setting('app.env_id', true) OR env_id = 'global');

COMMENT ON TABLE public.structural_alerts IS
    'Structural cycle alerts (Harrison 2026 convergence, era mismatch, narrative silence). '
    'Fired by 08_multi_agent_forecast.py when Hoyt position + macro stress trigger conditions '
    'co-occur. Surfaced via GET /api/v1/rhymes/alerts. Owning module: skills/historyrhymes.';

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. Hoyt peak episode tagging
-- ───────────────────────────────────────────────────────────────────────────────
-- Mark the existing 2007 GFC as a Hoyt peak. Idempotent — only adds 'hoyt_peak'
-- if it isn't already in the tags array.

UPDATE public.episodes
SET tags = array_append(tags, 'hoyt_peak'),
    updated_at = NOW()
WHERE name = '2007-2009 Global Financial Crisis'
  AND NOT ('hoyt_peak' = ANY(COALESCE(tags, '{}')));

-- Insert the two additional Hoyt peak episodes (1973, 1990). These are skeleton
-- entries that the embedding pipeline (06_state_vector.py) will fill out with a
-- vector once the FRED backfill makes the historical signal data available.
--
-- We use INSERT ... ON CONFLICT DO NOTHING via a name-based existence check
-- because there's no unique constraint on episodes.name, but we want re-runs
-- to be idempotent.

INSERT INTO public.episodes (
    name, asset_class, category,
    start_date, peak_date, trough_date, end_date,
    duration_days, peak_to_trough_pct, max_drawdown_pct, volatility_regime,
    macro_conditions_entering, catalyst_trigger, timeline_narrative,
    cross_asset_impact, narrative_arc, recovery_pattern, modern_analog_thesis,
    tags, dalio_cycle_stage, regime_type, is_non_event, source
)
SELECT
    '1973 Real Estate Cycle Peak',
    'multi',
    'crash',
    '1972-10-01'::date,
    '1973-01-11'::date,
    '1974-12-06'::date,
    '1975-12-31'::date,
    1186,
    -48.2,
    -48.2,
    'crisis',
    'Late-cycle real estate speculation peak. REITs grew rapidly 1969-1973. '
        'Bretton Woods collapse 1971 created monetary uncertainty. Wage-price '
        'controls distorted supply.',
    'October 1973 OPEC oil embargo quadrupled oil prices. REIT credit froze. '
        'Commercial real estate values collapsed as financing dried up. '
        'Stagflation onset locked in for the rest of the decade.',
    'SPX peaked Jan 1973. REITs began collapsing mid-1973 as rising rates and '
        'oil shock combined. SPX bottomed Dec 1974 at 577 (-48% from peak). '
        'Real estate took ~5 years to recover. Hoyt 18-year cycle anchor: 1973 peak '
        'preceded the 1974 trough by ~12 months.',
    '{"sp500": -48.2, "reits": -75, "oil_pct": 300, "gold_pct": 130}'::jsonb,
    'Hoyt peak template: real estate speculation + oil/inflation shock + monetary '
        'tightening = multi-year bear market. The 1973 peak is the canonical Hoyt '
        '18-year cycle anchor for the post-Bretton-Woods era.',
    'Slow recovery requiring monetary normalization and supply-shock absorption. '
        'Real estate did not recover to 1973 levels in real terms until the early 1980s.',
    '2026-2027 represents another Hoyt peak window (18 years from 2009 trough). '
        'Tariff escalation + late-cycle CRE leverage + monetary policy uncertainty '
        'echoes 1973 conditions, though the structural composition differs (no oil shock yet).',
    ARRAY['hoyt_peak', 'real_estate', 'stagflation', 'oil_shock', 'reits'],
    'top',
    'inflationary',
    false,
    'plan_503_hoyt_seed'
WHERE NOT EXISTS (
    SELECT 1 FROM public.episodes WHERE name = '1973 Real Estate Cycle Peak'
);

INSERT INTO public.episodes (
    name, asset_class, category,
    start_date, peak_date, trough_date, end_date,
    duration_days, peak_to_trough_pct, max_drawdown_pct, volatility_regime,
    macro_conditions_entering, catalyst_trigger, timeline_narrative,
    cross_asset_impact, narrative_arc, recovery_pattern, modern_analog_thesis,
    tags, dalio_cycle_stage, regime_type, is_non_event, source
)
SELECT
    '1990 Savings & Loan Real Estate Bust',
    'multi',
    'crash',
    '1989-01-01'::date,
    '1989-07-16'::date,
    '1990-10-11'::date,
    '1991-12-31'::date,
    1095,
    -19.9,
    -19.9,
    'elevated',
    'Late-1980s commercial real estate overbuild fueled by Garn-St. Germain Act '
        'deregulation of S&L lending. Empty office towers in Houston, Dallas, Denver. '
        'Junk bond financing peaked 1988 (Drexel Burnham). RTC formed Aug 1989.',
    'Iraq invasion of Kuwait Aug 1990 → oil spike + recession trigger. S&L industry '
        'collapse ($160B taxpayer bailout). Commercial real estate values fell 30-50% in '
        'major metros. Banking sector stress visible in Citi, Chase recapitalization needs.',
    'SPX peaked Jul 1989, drifted lower into 1990. Aug 1990 Kuwait invasion triggered '
        'sharp -19.9% selloff into Oct 1990. Recession Jul 1990 - Mar 1991. '
        'Real estate trough lagged by 3-4 years; commercial property values bottomed 1993. '
        'Hoyt 18-year cycle anchor: 1990 peak preceded the 1991 trough by ~12 months.',
    '{"sp500": -19.9, "commercial_re_metros": -45, "sl_failures": 747, "rtc_cost_billions": 160}'::jsonb,
    'Second Hoyt peak template: deregulation-fueled real estate excess + oil shock + '
        'banking stress = multi-year correction. Less severe than 1973 because Greenspan Fed '
        'cut aggressively, but the real estate trough was deep and long.',
    'V-recovery in equities (driven by Fed cuts and Iraq war success), but real estate '
        'recovery took until ~1996. RTC cleanup ran through 1995.',
    '2026-2027 Hoyt peak window has structural parallels: deregulation overhang '
        '(post-Dodd-Frank rollback debates), CRE distress (post-COVID office vacancies, '
        '$2.3T loans maturing 2025-2028), and elevated rates pressuring extend-and-pretend.',
    ARRAY['hoyt_peak', 'real_estate', 'savings_loan', 'banking_crisis', 'commercial_real_estate'],
    'top',
    'deflationary_deleveraging',
    false,
    'plan_503_hoyt_seed'
WHERE NOT EXISTS (
    SELECT 1 FROM public.episodes WHERE name = '1990 Savings & Loan Real Estate Bust'
);
