-- Migration 434: History Rhymes + World Signal Surveillance Engine
-- Implements the 6th Pillar decision engine: episode library, signal surveillance,
-- analog matching, multi-agent calibration, and prediction tracking.
-- Additive only — no existing tables modified.
--
-- Source: skills/historyrhymes/references/schema_supabase.sql
-- Requires: pgvector extension (CREATE EXTENSION IF NOT EXISTS vector;)

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: EPISODE LIBRARY
-- ═══════════════════════════════════════════════════════════════════════════════

-- Core episode metadata
CREATE TABLE IF NOT EXISTS public.episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    asset_class VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    start_date DATE NOT NULL,
    peak_date DATE,
    trough_date DATE,
    end_date DATE,
    duration_days INTEGER,

    -- Quantitative summary
    peak_to_trough_pct DECIMAL(8,2),
    recovery_duration_days INTEGER,
    max_drawdown_pct DECIMAL(8,2),
    volatility_regime VARCHAR(20),

    -- Narrative fields
    macro_conditions_entering TEXT NOT NULL,
    catalyst_trigger TEXT NOT NULL,
    timeline_narrative TEXT NOT NULL,
    cross_asset_impact JSONB,
    narrative_arc TEXT,
    recovery_pattern TEXT,
    modern_analog_thesis TEXT,

    -- Structural tags for filtering
    tags TEXT[],
    dalio_cycle_stage VARCHAR(50),
    regime_type VARCHAR(50),
    is_non_event BOOLEAN DEFAULT FALSE,

    -- Provenance
    source VARCHAR(50) DEFAULT 'manual',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodes_asset_class ON public.episodes(asset_class);
CREATE INDEX IF NOT EXISTS idx_episodes_category ON public.episodes(category);
CREATE INDEX IF NOT EXISTS idx_episodes_tags ON public.episodes USING GIN(tags);

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
    vix_term_structure VARCHAR(20),
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

    -- Pre-computed state vector (JSONB fallback if pgvector unavailable)
    signal_vector JSONB,

    UNIQUE(episode_id, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_episode_signals_episode ON public.episode_signals(episode_id);

-- Analog match log
CREATE TABLE IF NOT EXISTS public.analog_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_date DATE NOT NULL,
    query_vector JSONB,
    asset_class VARCHAR(50),
    matches JSONB NOT NULL,
    source VARCHAR(50) DEFAULT 'engine',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analog_matches_date ON public.analog_matches(query_date);

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
    direction VARCHAR(10),
    direction_confidence DECIMAL(5,4),
    magnitude_estimate_pct DECIMAL(8,4),
    time_horizon_days INTEGER,
    target_date DATE,

    -- Attribution
    top_analog_id UUID REFERENCES public.episodes(id),
    rhyme_score DECIMAL(5,4),
    agent_weights JSONB,
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

    -- Provenance
    source VARCHAR(50) DEFAULT 'engine',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_date ON public.hr_predictions(prediction_date);
CREATE INDEX IF NOT EXISTS idx_predictions_resolved ON public.hr_predictions(resolved) WHERE resolved = FALSE;

-- Honeypot pattern library (anti-analogs / trap templates)
CREATE TABLE IF NOT EXISTS public.honeypot_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    pattern_type VARCHAR(50),

    -- The "obvious" setup that was wrong
    apparent_signal TEXT,
    actual_outcome TEXT,

    -- Detection signatures
    consensus_level DECIMAL(5,4),
    flow_narrative_mismatch BOOLEAN,
    crowding_level VARCHAR(20),

    embedding JSONB,
    source VARCHAR(50) DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: WORLD SIGNAL SURVEILLANCE ENGINE
-- ═══════════════════════════════════════════════════════════════════════════════

-- Layer 1: Reality signals (pre-data, behavioral)
CREATE TABLE IF NOT EXISTS public.wss_reality_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    domain VARCHAR(50) NOT NULL,
    signal_type VARCHAR(100),
    metric_name VARCHAR(200),
    value DECIMAL(12,4),
    trend_direction VARCHAR(30),
    acceleration_score DECIMAL(8,4),
    acceleration_change DECIMAL(8,4),
    geographic_scope VARCHAR(100),
    confidence_score DECIMAL(5,4),
    source VARCHAR(200) DEFAULT 'seed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.wss_reality_signals
    ALTER COLUMN trend_direction TYPE VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_reality_signals_date ON public.wss_reality_signals(signal_date);
CREATE INDEX IF NOT EXISTS idx_reality_signals_domain ON public.wss_reality_signals(domain);

-- Layer 2: Data signals (reported metrics)
CREATE TABLE IF NOT EXISTS public.wss_data_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    metric_name VARCHAR(200) NOT NULL,
    reported_value DECIMAL(12,4),
    expected_value DECIMAL(12,4),
    surprise_score DECIMAL(8,4),
    trend_direction VARCHAR(30),
    revision_history JSONB,
    source VARCHAR(200) DEFAULT 'seed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.wss_data_signals
    ALTER COLUMN trend_direction TYPE VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_data_signals_date ON public.wss_data_signals(signal_date);

-- Layer 3: Narrative state
CREATE TABLE IF NOT EXISTS public.wss_narrative_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    narrative_label VARCHAR(200) NOT NULL,
    intensity_score DECIMAL(5,4),
    velocity_score DECIMAL(8,4),
    acceleration_score DECIMAL(8,4),
    sentiment VARCHAR(20),
    source_diversity INTEGER,
    originality_score DECIMAL(5,4),
    crowding_score DECIMAL(5,4),
    manipulation_risk DECIMAL(5,4),
    lifecycle_stage VARCHAR(20),
    source VARCHAR(200) DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narrative_state_date ON public.wss_narrative_state(signal_date);
CREATE INDEX IF NOT EXISTS idx_narrative_state_label ON public.wss_narrative_state(narrative_label);

-- Layer 4: Positioning signals
CREATE TABLE IF NOT EXISTS public.wss_positioning_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_date DATE NOT NULL,
    asset VARCHAR(100) NOT NULL,
    positioning_type VARCHAR(50),
    metric VARCHAR(200),
    value_text VARCHAR(100),
    value_numeric DECIMAL(12,4),
    crowding_score DECIMAL(5,2),
    extreme_flag BOOLEAN DEFAULT FALSE,
    trend_direction VARCHAR(30),
    source VARCHAR(200) DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.wss_positioning_signals
    ALTER COLUMN trend_direction TYPE VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_positioning_signals_date ON public.wss_positioning_signals(signal_date);
CREATE INDEX IF NOT EXISTS idx_positioning_signals_asset ON public.wss_positioning_signals(asset);

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
    source VARCHAR(200) DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_signals_date ON public.wss_meta_signals(signal_date);

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
    combined_embedding JSONB,
    divergence_score DECIMAL(5,4),
    crowding_score DECIMAL(5,4),
    regime_label VARCHAR(50),
    source VARCHAR(200) DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_state_vector_date ON public.wss_signal_state_vector(signal_date);

-- Narrative silence events
CREATE TABLE IF NOT EXISTS public.wss_narrative_silence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    narrative_label VARCHAR(200) NOT NULL,
    last_active_date DATE,
    dropoff_velocity DECIMAL(8,4),
    prior_intensity DECIMAL(5,4),
    current_intensity DECIMAL(5,4),
    significance_score DECIMAL(5,4),
    source VARCHAR(200) DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: AGENT CALIBRATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Multi-agent performance tracking
CREATE TABLE IF NOT EXISTS public.hr_agent_calibration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name VARCHAR(50) NOT NULL,
    calibration_date DATE NOT NULL,
    direction VARCHAR(20),
    confidence DECIMAL(5,2),
    rolling_90d_brier DECIMAL(8,6),
    rolling_90d_accuracy DECIMAL(5,4),
    prediction_count INTEGER,
    current_weight DECIMAL(5,4),
    weight_change DECIMAL(5,4),
    reasoning TEXT,
    source VARCHAR(50) DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_calibration_date ON public.hr_agent_calibration(calibration_date);
CREATE INDEX IF NOT EXISTS idx_agent_calibration_agent ON public.hr_agent_calibration(agent_name);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: TRAP CHECKS (live adversarial detection results)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wss_trap_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_date DATE NOT NULL,
    check_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    variant VARCHAR(20) NOT NULL,
    value TEXT,
    score DECIMAL(5,4),
    threshold DECIMAL(5,4),
    explanation TEXT,
    action_adjustment TEXT,
    source VARCHAR(50) DEFAULT 'seed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trap_checks_date ON public.wss_trap_checks(check_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 5: VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Active predictions needing resolution
CREATE OR REPLACE VIEW public.hr_pending_predictions AS
SELECT p.*, e.name as analog_name
FROM public.hr_predictions p
LEFT JOIN public.episodes e ON p.top_analog_id = e.id
WHERE p.resolved = FALSE
  AND p.target_date <= CURRENT_DATE
ORDER BY p.target_date;

-- Episode library balance check (2:1 non-event ratio target)
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

-- Latest agent calibration per agent
CREATE OR REPLACE VIEW public.hr_latest_agents AS
SELECT DISTINCT ON (agent_name)
    *
FROM public.hr_agent_calibration
ORDER BY agent_name, calibration_date DESC;

-- Latest trap checks
CREATE OR REPLACE VIEW public.wss_latest_trap_checks AS
SELECT DISTINCT ON (check_name)
    *
FROM public.wss_trap_checks
ORDER BY check_name, check_date DESC;

COMMENT ON TABLE public.episodes IS 'Historical market episodes for analog matching — crashes, bubbles, regime shifts, non-events. Owned by HistoryRhymes decision engine.';
COMMENT ON TABLE public.episode_signals IS 'Quantitative state vectors at specific points within episodes. 25 features covering equity, crypto, real estate, and behavioral signals.';
COMMENT ON TABLE public.analog_matches IS 'Log of analog matching queries: which episodes matched, with what scores, on what date.';
COMMENT ON TABLE public.hr_predictions IS 'Probabilistic forecasts from the ensemble engine. Tracks bull/base/bear scenarios, agent weights, and Brier score resolution.';
COMMENT ON TABLE public.honeypot_patterns IS 'Anti-pattern library: historical setups that looked obvious but were traps. Used for adversarial detection.';
COMMENT ON TABLE public.wss_reality_signals IS 'Layer 1 WSS: pre-data behavioral signals (job postings, freight, construction, energy, consumer). Leading indicators.';
COMMENT ON TABLE public.wss_data_signals IS 'Layer 2 WSS: reported economic metrics with surprise scoring (CPI, NFP, PMI, housing starts, CMBS delinquency).';
COMMENT ON TABLE public.wss_narrative_state IS 'Layer 3 WSS: narrative intensity, velocity, crowding, and lifecycle tracking. Detects exhaustion and manipulation.';
COMMENT ON TABLE public.wss_positioning_signals IS 'Layer 4 WSS: positioning and flow data (put/call, gamma, funding rates, ETF flows, short interest, on-chain).';
COMMENT ON TABLE public.wss_meta_signals IS 'Layer 5 WSS: cross-layer synthesis. Consensus scoring, alignment, adversarial risk, trap probability.';
COMMENT ON TABLE public.wss_signal_state_vector IS 'Combined state vector across all 5 WSS layers. Used for episode similarity search.';
COMMENT ON TABLE public.wss_narrative_silence IS 'Narratives that went quiet — often signals that positioning is complete and a move is imminent.';
COMMENT ON TABLE public.hr_agent_calibration IS 'Walk-forward performance tracking for the 5 forecasting agents + aggregate. Brier scores, weights, reasoning.';
COMMENT ON TABLE public.wss_trap_checks IS 'Live adversarial detection results: consensus divergence, flow mismatch, crowding, honeypot proximity, provenance, meta-level.';
