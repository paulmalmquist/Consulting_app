-- ============================================================================
-- HISTORY RHYMES — SUPABASE SCHEMA
-- Episode Library + World Signal Surveillance + Podcast Pipeline + Predictions
-- ============================================================================
-- Requires: pgvector extension (already enabled in Supabase)
-- Run: CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- PART 1: EPISODE LIBRARY
-- ============================================================================

-- Core episode metadata
CREATE TABLE IF NOT EXISTS public.episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    asset_class VARCHAR(50) NOT NULL,  -- crypto, equity, real_estate, macro, multi
    category VARCHAR(100),             -- crash, bubble, contagion, regime_shift, non_event
    start_date DATE NOT NULL,
    peak_date DATE,
    trough_date DATE,
    end_date DATE,
    duration_days INTEGER,

    -- Quantitative summary
    peak_to_trough_pct DECIMAL(8,2),
    recovery_duration_days INTEGER,
    max_drawdown_pct DECIMAL(8,2),
    volatility_regime VARCHAR(20),     -- low, normal, elevated, crisis

    -- Narrative fields
    macro_conditions_entering TEXT NOT NULL,
    catalyst_trigger TEXT NOT NULL,
    timeline_narrative TEXT NOT NULL,
    cross_asset_impact JSONB,          -- {"sp500": -57, "btc": null, "treasuries": 12, ...}
    narrative_arc TEXT,
    recovery_pattern TEXT,
    modern_analog_thesis TEXT,

    -- Structural tags for filtering
    tags TEXT[],                        -- ['leverage_unwind', 'liquidity_crisis', 'regulatory']
    dalio_cycle_stage VARCHAR(50),      -- bubble, top, depression, reflation, expansion
    regime_type VARCHAR(50),            -- deflationary_deleveraging, inflationary, crisis
    is_non_event BOOLEAN DEFAULT FALSE, -- for survivorship bias mitigation

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episodes_asset_class ON public.episodes(asset_class);
CREATE INDEX idx_episodes_category ON public.episodes(category);
CREATE INDEX idx_episodes_tags ON public.episodes USING GIN(tags);

-- Episode state vectors at specific points in time
CREATE TABLE IF NOT EXISTS public.episode_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES public.episodes(id) ON DELETE CASCADE,
    signal_date DATE NOT NULL,

    -- Equity / Macro
    sp500_return_1m DECIMAL(8,4),
    sp500_return_3m DECIMAL(8,4),
    sp500_return_12m DECIMAL(8,4),
    vix_level DECIMAL(6,2),
    vix_term_structure VARCHAR(20),     -- contango, flat, backwardation
    yield_curve_10y2y DECIMAL(6,3),
    credit_spread_hy DECIMAL(6,2),
    fed_funds_rate DECIMAL(5,3),
    cpi_yoy DECIMAL(6,3),
    pmi_manufacturing DECIMAL(6,2),
    unemployment_rate DECIMAL(5,2),

    -- Crypto (nullable for pre-crypto episodes)
    btc_return_1m DECIMAL(8,4),
    btc_mvrv_zscore DECIMAL(6,3),
    crypto_fear_greed INTEGER,
    btc_dominance DECIMAL(5,2),

    -- Real estate
    case_shiller_yoy DECIMAL(6,3),
    housing_starts_saar INTEGER,
    mortgage_rate_30y DECIMAL(5,3),
    cmbs_delinquency_rate DECIMAL(5,2),
    office_vacancy_rate DECIMAL(5,2),

    -- Behavioral
    aaii_bull_pct DECIMAL(5,2),
    aaii_bear_pct DECIMAL(5,2),
    put_call_ratio DECIMAL(5,3),
    margin_debt_yoy DECIMAL(8,4),

    -- Pre-computed state vector
    signal_vector VECTOR(256),

    UNIQUE(episode_id, signal_date)
);

CREATE INDEX idx_episode_signals_episode ON public.episode_signals(episode_id);

-- Vector embeddings for similarity search
CREATE TABLE IF NOT EXISTS public.episode_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES public.episodes(id) ON DELETE CASCADE,
    embedding_type VARCHAR(50),         -- full_state, narrative_only, quant_only
    embedding VECTOR(256) NOT NULL,
    model_version VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episode_embeddings_hnsw
ON public.episode_embeddings USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 256);

-- Analog match log
CREATE TABLE IF NOT EXISTS public.analog_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_date DATE NOT NULL,
    query_vector VECTOR(256),
    asset_class VARCHAR(50),
    matches JSONB NOT NULL,
    -- [{"episode_id": "...", "rhyme_score": 0.82, "cosine_sim": 0.87,
    --   "dtw_distance": 0.34, "top_divergences": [...]}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analog_matches_date ON public.analog_matches(query_date);

-- Prediction tracking for Brier score calibration
CREATE TABLE IF NOT EXISTS public.hr_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_date TIMESTAMPTZ NOT NULL,
    asset_class VARCHAR(50) NOT NULL,
    segment VARCHAR(100),

    -- Probabilistic forecast
    scenario_bull_prob DECIMAL(5,4),
    scenario_base_prob DECIMAL(5,4),
    scenario_bear_prob DECIMAL(5,4),

    -- Specific predictions
    direction VARCHAR(10),              -- up, down, flat
    direction_confidence DECIMAL(5,4),
    magnitude_estimate_pct DECIMAL(8,4),
    time_horizon_days INTEGER,
    target_date DATE,

    -- Attribution
    top_analog_id UUID REFERENCES public.episodes(id),
    rhyme_score DECIMAL(5,4),
    agent_weights JSONB,                -- {"macro": 0.3, "quant": 0.25, ...}
    trap_detector_flag BOOLEAN DEFAULT FALSE,
    crowding_score DECIMAL(5,4),

    -- Narrative
    synthesis_narrative TEXT,
    divergence_analysis TEXT,

    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolution_date TIMESTAMPTZ,
    actual_outcome DECIMAL(8,4),
    brier_score DECIMAL(8,6),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_predictions_date ON public.hr_predictions(prediction_date);
CREATE INDEX idx_predictions_resolved ON public.hr_predictions(resolved) WHERE resolved = FALSE;

-- Honeypot pattern library (anti-analogs)
CREATE TABLE IF NOT EXISTS public.honeypot_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    pattern_type VARCHAR(50),           -- bear_trap, bull_trap, narrative_trap

    -- The "obvious" setup that was wrong
    apparent_signal TEXT,
    actual_outcome TEXT,

    -- Detection signatures
    consensus_level DECIMAL(5,4),
    flow_narrative_mismatch BOOLEAN,
    crowding_level VARCHAR(20),

    embedding VECTOR(256),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_honeypot_hnsw
ON public.honeypot_patterns USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- PART 2: WORLD SIGNAL SURVEILLANCE ENGINE
-- ============================================================================

-- Layer 1: Reality signals (pre-data, behavioral)
CREATE TABLE IF NOT EXISTS public.wss_reality_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    domain VARCHAR(50) NOT NULL,        -- labor, housing, logistics, energy, consumer
    signal_type VARCHAR(100),
    metric_name VARCHAR(200),
    value DECIMAL(12,4),
    trend_direction VARCHAR(10),        -- up, down, flat
    acceleration_score DECIMAL(8,4),    -- first derivative
    acceleration_change DECIMAL(8,4),   -- second derivative
    geographic_scope VARCHAR(100),
    confidence_score DECIMAL(5,4),
    source VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reality_signals_date ON public.wss_reality_signals(signal_date);
CREATE INDEX idx_reality_signals_domain ON public.wss_reality_signals(domain);

-- Layer 2: Data signals (reported metrics)
CREATE TABLE IF NOT EXISTS public.wss_data_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    metric_name VARCHAR(200) NOT NULL,
    reported_value DECIMAL(12,4),
    expected_value DECIMAL(12,4),
    surprise_score DECIMAL(8,4),
    trend_direction VARCHAR(10),
    revision_history JSONB,             -- [{"date": "...", "old": 3.2, "new": 3.1}]
    source VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_signals_date ON public.wss_data_signals(signal_date);

-- Layer 3: Narrative state
CREATE TABLE IF NOT EXISTS public.wss_narrative_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    narrative_label VARCHAR(200) NOT NULL,
    intensity_score DECIMAL(5,4),
    velocity_score DECIMAL(8,4),
    acceleration_score DECIMAL(8,4),
    sentiment VARCHAR(20),              -- bullish, bearish, neutral, mixed
    source_diversity INTEGER,           -- count of unique sources
    originality_score DECIMAL(5,4),
    crowding_score DECIMAL(5,4),
    manipulation_risk DECIMAL(5,4),
    lifecycle_stage VARCHAR(20),        -- early, emerging, crowded, exhaustion
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_narrative_state_date ON public.wss_narrative_state(signal_date);
CREATE INDEX idx_narrative_state_label ON public.wss_narrative_state(narrative_label);

-- Layer 4: Positioning signals
CREATE TABLE IF NOT EXISTS public.wss_positioning_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    asset VARCHAR(100) NOT NULL,
    positioning_type VARCHAR(50),       -- etf_flow, options, short_interest, fund_flow, onchain, stablecoin
    metric VARCHAR(200),
    value DECIMAL(12,4),
    crowding_score DECIMAL(5,2),        -- 0-100
    extreme_flag BOOLEAN DEFAULT FALSE,
    trend_direction VARCHAR(10),
    source VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positioning_signals_date ON public.wss_positioning_signals(signal_date);
CREATE INDEX idx_positioning_signals_asset ON public.wss_positioning_signals(asset);

-- Layer 5: Meta-game signals
CREATE TABLE IF NOT EXISTS public.wss_meta_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    signal_cluster_id VARCHAR(100),
    consensus_score DECIMAL(5,4),
    cross_layer_alignment DECIMAL(5,4),
    adversarial_risk_score DECIMAL(5,4),
    trap_probability DECIMAL(5,4),
    explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meta_signals_date ON public.wss_meta_signals(signal_date);

-- Cross-layer synthesis vector
CREATE TABLE IF NOT EXISTS public.wss_signal_state_vector (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    asset_class VARCHAR(50),
    reality_vector JSONB,
    data_vector JSONB,
    narrative_vector JSONB,
    positioning_vector JSONB,
    meta_vector JSONB,
    combined_embedding VECTOR(256),
    divergence_score DECIMAL(5,4),
    crowding_score DECIMAL(5,4),
    regime_label VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_state_vector_date ON public.wss_signal_state_vector(signal_date);
CREATE INDEX idx_state_vector_hnsw
ON public.wss_signal_state_vector USING hnsw (combined_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 256);

-- Narrative silence events
CREATE TABLE IF NOT EXISTS public.wss_narrative_silence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    narrative_label VARCHAR(200) NOT NULL,
    last_active_date DATE,
    dropoff_velocity DECIMAL(8,4),
    prior_intensity DECIMAL(5,4),
    current_intensity DECIMAL(5,4),
    significance_score DECIMAL(5,4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: PODCAST INGESTION PIPELINE
-- ============================================================================

-- Podcast episodes (metadata)
CREATE TABLE IF NOT EXISTS public.podcast_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_name VARCHAR(255),
    episode_title VARCHAR(500),
    publish_date DATE,
    source_url TEXT,
    transcript_path TEXT,
    duration_minutes INTEGER,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Speaker profiles with track records
CREATE TABLE IF NOT EXISTS public.podcast_speakers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(200),                  -- PM, macro strategist, VC, trader
    domain_expertise TEXT[],            -- ['crypto', 'macro', 'real_estate']
    credibility_score DECIMAL(5,4),
    total_predictions INTEGER DEFAULT 0,
    hit_rate DECIMAL(5,4),
    avg_brier_score DECIMAL(8,6),
    bias_profile VARCHAR(50),           -- permabull, macro_bear, balanced, crypto_maxi
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracted macro viewpoints
CREATE TABLE IF NOT EXISTS public.podcast_viewpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES public.podcast_episodes(id),
    speaker_id UUID REFERENCES public.podcast_speakers(id),
    view_type VARCHAR(50),              -- macro, trade_idea, positioning, narrative
    statement TEXT NOT NULL,
    direction VARCHAR(20),              -- bullish, bearish, neutral
    confidence_implied DECIMAL(5,4),
    time_horizon VARCHAR(50),
    asset_classes TEXT[],
    is_contrarian BOOLEAN DEFAULT FALSE,
    novelty_score DECIMAL(5,4),

    -- Analog references
    references_episode VARCHAR(255),    -- "this looks like 2008"
    analog_reasoning TEXT,

    -- Resolution tracking
    resolved BOOLEAN DEFAULT FALSE,
    resolution_date DATE,
    actual_outcome DECIMAL(8,4),
    brier_score DECIMAL(8,6),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_viewpoints_episode ON public.podcast_viewpoints(episode_id);
CREATE INDEX idx_viewpoints_speaker ON public.podcast_viewpoints(speaker_id);

-- Aggregated narrative velocity from podcasts
CREATE TABLE IF NOT EXISTS public.podcast_narratives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    narrative_label VARCHAR(200),
    mention_count INTEGER,
    velocity DECIMAL(8,4),
    unique_speakers INTEGER,
    conviction_avg DECIMAL(5,4),
    divergence_score DECIMAL(5,4),      -- vs market data
    authenticity_score DECIMAL(5,4),
    manipulation_risk DECIMAL(5,4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_podcast_narratives_date ON public.podcast_narratives(signal_date);

-- ============================================================================
-- PART 4: AGENT CALIBRATION
-- ============================================================================

-- Multi-agent performance tracking
CREATE TABLE IF NOT EXISTS public.hr_agent_calibration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name VARCHAR(50) NOT NULL,    -- macro, quant, narrative, contrarian, red_team, aggregate
    calibration_date DATE NOT NULL,
    rolling_90d_brier DECIMAL(8,6),
    rolling_90d_accuracy DECIMAL(5,4),
    prediction_count INTEGER,
    current_weight DECIMAL(5,4),
    weight_change DECIMAL(5,4),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_calibration_date ON public.hr_agent_calibration(calibration_date);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active predictions needing resolution
CREATE OR REPLACE VIEW public.hr_pending_predictions AS
SELECT p.*, e.name as analog_name
FROM public.hr_predictions p
LEFT JOIN public.episodes e ON p.top_analog_id = e.id
WHERE p.resolved = FALSE
  AND p.target_date <= CURRENT_DATE
ORDER BY p.target_date;

-- Episode library balance check (2:1 non-event ratio)
CREATE OR REPLACE VIEW public.hr_episode_balance AS
SELECT
    category,
    is_non_event,
    COUNT(*) as count,
    ROUND(COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 1) as pct
FROM public.episodes
GROUP BY category, is_non_event
ORDER BY category, is_non_event;

-- Latest signal state per asset class
CREATE OR REPLACE VIEW public.wss_latest_state AS
SELECT DISTINCT ON (asset_class)
    *
FROM public.wss_signal_state_vector
ORDER BY asset_class, signal_date DESC;
