-- Migration 425: Podcast Intelligence — Alpha extraction from long-form conversations
-- Full pipeline: ingestion → extraction → aggregation → integration
-- Integrates with trading_lab (423), market_rotation_engine (419)
--
-- Entity graph:
--   podcast_sources → podcast_episodes → [macro_views, trade_ideas, narratives, analogs, uncertainty_markers]
--   podcast_episodes → podcast_speakers (junction: podcast_episode_speakers)
--   podcast_narratives → podcast_narrative_velocity (aggregation)
--   speaker_predictions → speaker_track_records (aggregation)
--   podcast_macro_views → podcast_divergences (integration)
--   podcast_analogs → podcast_rhyme_suggestions (integration)
--   podcast_episodes → podcast_adversarial_scores (scoring)
--   tenant → podcast_daily_briefs (daily summaries)
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 1: INGESTION + STORAGE
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. podcast_sources — RSS feeds, YouTube channels, manual sources being tracked
CREATE TABLE IF NOT EXISTS public.podcast_sources (
  source_id       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  source_type     text         NOT NULL
    CHECK (source_type IN ('rss', 'youtube_channel', 'manual', 'api')),
  name            text         NOT NULL,
  url             text,
  fetch_frequency text         DEFAULT 'daily'
    CHECK (fetch_frequency IN ('hourly', 'daily', 'weekly', 'manual')),
  last_fetched_at timestamptz,
  is_active       boolean      DEFAULT true,
  config          jsonb        DEFAULT '{}',
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_podcast_sources_tenant ON public.podcast_sources (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_podcast_sources_type ON public.podcast_sources (source_type, is_active);
CREATE INDEX IF NOT EXISTS idx_podcast_sources_last_fetched ON public.podcast_sources (last_fetched_at DESC) WHERE is_active;

-- 2. podcast_episodes — Individual episodes/recordings
CREATE TABLE IF NOT EXISTS public.podcast_episodes (
  episode_id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  source_id         uuid         NOT NULL REFERENCES public.podcast_sources(source_id) ON DELETE CASCADE,
  external_id       text,
  title             text         NOT NULL,
  description       text,
  published_at      timestamptz,
  duration_seconds  int,
  audio_url         text,
  video_url         text,
  thumbnail_url     text,
  transcript_raw    text,
  transcript_chunks jsonb        DEFAULT '[]',
  transcription_model text,
  transcription_status text      DEFAULT 'pending'
    CHECK (transcription_status IN ('pending', 'processing', 'completed', 'failed')),
  extraction_status text         DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
  metadata          jsonb        DEFAULT '{}',
  created_at        timestamptz  DEFAULT now(),
  updated_at        timestamptz  DEFAULT now(),
  UNIQUE (tenant_id, source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_tenant ON public.podcast_episodes (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_source ON public.podcast_episodes (source_id);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_status ON public.podcast_episodes (transcription_status, extraction_status);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_published ON public.podcast_episodes (published_at DESC) WHERE published_at IS NOT NULL;

-- 3. podcast_speakers — Speaker profiles extracted from episodes
CREATE TABLE IF NOT EXISTS public.podcast_speakers (
  speaker_id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  name              text         NOT NULL,
  normalized_name   text,
  role              text,
  domain_expertise  text[]       DEFAULT '{}',
  organization      text,
  bio               text,
  is_verified       boolean      DEFAULT false,
  credibility_score numeric(5,2) DEFAULT 50.00
    CHECK (credibility_score BETWEEN 0 AND 100),
  bias_profile      text
    CHECK (bias_profile IN ('permabull', 'permabear', 'macro_bear', 'crypto_bull', 'contrarian', 'consensus', 'unknown')),
  metadata          jsonb        DEFAULT '{}',
  created_at        timestamptz  DEFAULT now(),
  updated_at        timestamptz  DEFAULT now(),
  UNIQUE (tenant_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_podcast_speakers_tenant ON public.podcast_speakers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_podcast_speakers_normalized ON public.podcast_speakers (normalized_name);
CREATE INDEX IF NOT EXISTS idx_podcast_speakers_verified ON public.podcast_speakers (is_verified) WHERE is_verified;
CREATE INDEX IF NOT EXISTS idx_podcast_speakers_bias ON public.podcast_speakers (bias_profile) WHERE bias_profile IS NOT NULL;

-- 4. podcast_episode_speakers — Junction: which speakers appeared in which episode
CREATE TABLE IF NOT EXISTS public.podcast_episode_speakers (
  episode_speaker_id uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id         uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  speaker_id         uuid         NOT NULL REFERENCES public.podcast_speakers(speaker_id) ON DELETE CASCADE,
  is_host            boolean      DEFAULT false,
  speaking_time_pct  numeric(5,2),
  created_at         timestamptz  DEFAULT now(),
  UNIQUE (episode_id, speaker_id)
);

CREATE INDEX IF NOT EXISTS idx_episode_speakers_episode ON public.podcast_episode_speakers (episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_speakers_speaker ON public.podcast_episode_speakers (speaker_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 2: EXTRACTION LAYER
-- ═══════════════════════════════════════════════════════════════════════════════

-- 5. podcast_macro_views — Macro viewpoints extracted from episodes
CREATE TABLE IF NOT EXISTS public.podcast_macro_views (
  view_id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  episode_id        uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  speaker_id        uuid         REFERENCES public.podcast_speakers(speaker_id) ON DELETE SET NULL,
  view_type         text         NOT NULL
    CHECK (view_type IN ('macro', 'sector', 'asset_class', 'geopolitical', 'policy')),
  statement         text         NOT NULL,
  direction         text         NOT NULL
    CHECK (direction IN ('bullish', 'bearish', 'neutral', 'mixed')),
  confidence_implied numeric(5,2) DEFAULT 50.00
    CHECK (confidence_implied BETWEEN 0 AND 100),
  time_horizon      text
    CHECK (time_horizon IN ('immediate', '1-4_weeks', '1-3_months', '3-12_months', '1y_plus', 'structural')),
  asset_classes     text[]       DEFAULT '{}',
  tickers           text[]       DEFAULT '{}',
  reasoning         text,
  chunk_index       int,
  extraction_model  text,
  created_at        timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_macro_views_episode ON public.podcast_macro_views (episode_id);
CREATE INDEX IF NOT EXISTS idx_macro_views_speaker ON public.podcast_macro_views (speaker_id) WHERE speaker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_macro_views_direction ON public.podcast_macro_views (direction);
CREATE INDEX IF NOT EXISTS idx_macro_views_type ON public.podcast_macro_views (view_type);
CREATE INDEX IF NOT EXISTS idx_macro_views_tenant ON public.podcast_macro_views (tenant_id, created_at DESC);

-- 6. podcast_trade_ideas — Explicit and implied trade/positioning ideas
CREATE TABLE IF NOT EXISTS public.podcast_trade_ideas (
  idea_id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  episode_id        uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  speaker_id        uuid         REFERENCES public.podcast_speakers(speaker_id) ON DELETE SET NULL,
  idea_type         text         NOT NULL
    CHECK (idea_type IN ('explicit_trade', 'implied_position', 'risk_reward', 'hedging', 'portfolio_construction')),
  description       text         NOT NULL,
  direction         text
    CHECK (direction IN ('long', 'short', 'neutral', 'spread', 'hedge')),
  asset_classes     text[]       DEFAULT '{}',
  tickers           text[]       DEFAULT '{}',
  crowding_tag      text
    CHECK (crowding_tag IN ('crowded', 'contrarian', 'consensus', 'early', 'late', 'unknown')),
  narrative_stage   text
    CHECK (narrative_stage IN ('early', 'emerging', 'mainstream', 'crowded', 'fading')),
  conviction        text
    CHECK (conviction IN ('high', 'medium', 'low')),
  risk_reward_notes text,
  chunk_index       int,
  extraction_model  text,
  created_at        timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_ideas_episode ON public.podcast_trade_ideas (episode_id);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_speaker ON public.podcast_trade_ideas (speaker_id) WHERE speaker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_ideas_direction ON public.podcast_trade_ideas (direction) WHERE direction IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_ideas_crowding ON public.podcast_trade_ideas (crowding_tag) WHERE crowding_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_ideas_tenant ON public.podcast_trade_ideas (tenant_id, created_at DESC);

-- 7. podcast_narratives — Narrative threads detected in episodes
CREATE TABLE IF NOT EXISTS public.podcast_narratives (
  narrative_id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid,
  episode_id           uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  narrative_label      text         NOT NULL,
  narrative_type       text
    CHECK (narrative_type IN ('emerging', 'reinforcing', 'shifting', 'fading', 'contrarian')),
  sentiment            text
    CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  conviction           numeric(5,2) DEFAULT 50.00
    CHECK (conviction BETWEEN 0 AND 100),
  novelty_score        numeric(5,2) DEFAULT 50.00
    CHECK (novelty_score BETWEEN 0 AND 100),
  speakers_mentioning  uuid[]       DEFAULT '{}',
  supporting_quotes    text[]       DEFAULT '{}',
  chunk_indices        int[]        DEFAULT '{}',
  extraction_model     text,
  created_at           timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_narratives_episode ON public.podcast_narratives (episode_id);
CREATE INDEX IF NOT EXISTS idx_narratives_label ON public.podcast_narratives (narrative_label);
CREATE INDEX IF NOT EXISTS idx_narratives_type ON public.podcast_narratives (narrative_type) WHERE narrative_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_narratives_tenant ON public.podcast_narratives (tenant_id, created_at DESC);

-- 8. podcast_analogs — "History Rhymes" references - when speakers reference past episodes
CREATE TABLE IF NOT EXISTS public.podcast_analogs (
  analog_id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid,
  episode_id          uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  speaker_id          uuid         REFERENCES public.podcast_speakers(speaker_id) ON DELETE SET NULL,
  referenced_period   text         NOT NULL,
  referenced_year     int,
  reasoning           text         NOT NULL,
  missing_differences text,
  asset_classes       text[]       DEFAULT '{}',
  confidence_implied  numeric(5,2) DEFAULT 50.00
    CHECK (confidence_implied BETWEEN 0 AND 100),
  rhyme_type          text
    CHECK (rhyme_type IN ('structural', 'cyclical', 'behavioral', 'policy', 'technical')),
  auto_suggested_rhyme_id uuid,
  chunk_index         int,
  extraction_model    text,
  created_at          timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analogs_episode ON public.podcast_analogs (episode_id);
CREATE INDEX IF NOT EXISTS idx_analogs_speaker ON public.podcast_analogs (speaker_id) WHERE speaker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analogs_period ON public.podcast_analogs (referenced_period);
CREATE INDEX IF NOT EXISTS idx_analogs_type ON public.podcast_analogs (rhyme_type) WHERE rhyme_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analogs_tenant ON public.podcast_analogs (tenant_id, created_at DESC);

-- 9. podcast_uncertainty_markers — Hedging/confidence language tracking
CREATE TABLE IF NOT EXISTS public.podcast_uncertainty_markers (
  marker_id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id          uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  speaker_id          uuid         REFERENCES public.podcast_speakers(speaker_id) ON DELETE SET NULL,
  marker_type         text         NOT NULL
    CHECK (marker_type IN ('hedge', 'qualifier', 'conditional', 'strong_conviction', 'admission_of_uncertainty')),
  raw_text            text         NOT NULL,
  inferred_confidence numeric(5,2) DEFAULT 50.00
    CHECK (inferred_confidence BETWEEN 0 AND 100),
  context_statement   text,
  chunk_index         int,
  created_at          timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uncertainty_markers_episode ON public.podcast_uncertainty_markers (episode_id);
CREATE INDEX IF NOT EXISTS idx_uncertainty_markers_speaker ON public.podcast_uncertainty_markers (speaker_id) WHERE speaker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uncertainty_markers_type ON public.podcast_uncertainty_markers (marker_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3: AGGREGATION + TRACKING
-- ═══════════════════════════════════════════════════════════════════════════════

-- 10. podcast_narrative_velocity — Aggregated narrative tracking across episodes over time
CREATE TABLE IF NOT EXISTS public.podcast_narrative_velocity (
  velocity_id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid,
  narrative_label     text         NOT NULL,
  window_start        timestamptz  NOT NULL,
  window_end          timestamptz  NOT NULL,
  mention_count       int          DEFAULT 0,
  velocity            numeric(8,4),
  unique_speakers     int          DEFAULT 0,
  conviction_avg      numeric(5,2),
  divergence_score    numeric(5,2) DEFAULT 50.00
    CHECK (divergence_score BETWEEN 0 AND 100),
  crowding_risk       text         DEFAULT 'low'
    CHECK (crowding_risk IN ('low', 'moderate', 'elevated', 'high', 'extreme')),
  is_accelerating     boolean      DEFAULT false,
  first_detected_at   timestamptz,
  metadata            jsonb        DEFAULT '{}',
  created_at          timestamptz  DEFAULT now(),
  updated_at          timestamptz  DEFAULT now(),
  UNIQUE (tenant_id, narrative_label, window_start, window_end)
);

CREATE INDEX IF NOT EXISTS idx_narrative_velocity_label ON public.podcast_narrative_velocity (narrative_label, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_velocity_window ON public.podcast_narrative_velocity (window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_narrative_velocity_tenant ON public.podcast_narrative_velocity (tenant_id, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_velocity_crowding ON public.podcast_narrative_velocity (crowding_risk) WHERE crowding_risk != 'low';

-- 11. speaker_predictions — Individual forecasts extracted for track record scoring
CREATE TABLE IF NOT EXISTS public.speaker_predictions (
  prediction_id      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid,
  speaker_id         uuid         NOT NULL REFERENCES public.podcast_speakers(speaker_id) ON DELETE CASCADE,
  episode_id         uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  prediction_text    text         NOT NULL,
  predicted_direction text         NOT NULL
    CHECK (predicted_direction IN ('up', 'down', 'flat', 'range', 'event_occurs', 'event_not_occurs')),
  target_asset       text,
  target_value       numeric(18,6),
  target_date        timestamptz,
  resolution_status  text         DEFAULT 'open'
    CHECK (resolution_status IN ('open', 'correct', 'incorrect', 'partially_correct', 'expired', 'unresolvable')),
  resolution_notes   text,
  resolution_date    timestamptz,
  brier_score        numeric(5,4)
    CHECK (brier_score BETWEEN 0 AND 1),
  actual_value       numeric(18,6),
  created_at         timestamptz  DEFAULT now(),
  resolved_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_predictions_speaker ON public.speaker_predictions (speaker_id);
CREATE INDEX IF NOT EXISTS idx_predictions_episode ON public.speaker_predictions (episode_id);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON public.speaker_predictions (resolution_status) WHERE resolution_status = 'open';
CREATE INDEX IF NOT EXISTS idx_predictions_tenant ON public.speaker_predictions (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_target_date ON public.speaker_predictions (target_date) WHERE target_date IS NOT NULL;

-- 12. speaker_track_records — Aggregated speaker accuracy
CREATE TABLE IF NOT EXISTS public.speaker_track_records (
  record_id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid,
  speaker_id             uuid         NOT NULL UNIQUE REFERENCES public.podcast_speakers(speaker_id) ON DELETE CASCADE,
  total_predictions      int          DEFAULT 0,
  correct                int          DEFAULT 0,
  incorrect              int          DEFAULT 0,
  partially_correct      int          DEFAULT 0,
  hit_rate               numeric(5,4),
  avg_brier_score        numeric(5,4),
  domain_accuracy        jsonb        DEFAULT '{}',
  calibration_score      numeric(5,2) DEFAULT 50.00
    CHECK (calibration_score BETWEEN 0 AND 100),
  recency_weighted_score numeric(5,2) DEFAULT 50.00
    CHECK (recency_weighted_score BETWEEN 0 AND 100),
  last_updated_at        timestamptz  DEFAULT now(),
  created_at             timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_records_tenant ON public.speaker_track_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_track_records_hit_rate ON public.speaker_track_records (hit_rate DESC) WHERE hit_rate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_records_recency ON public.speaker_track_records (recency_weighted_score DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 4: INTEGRATION LAYER
-- ═══════════════════════════════════════════════════════════════════════════════

-- 13. podcast_divergences — Auto-generated divergences when podcast views conflict with data
CREATE TABLE IF NOT EXISTS public.podcast_divergences (
  divergence_id     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,
  episode_id        uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  view_id           uuid         REFERENCES public.podcast_macro_views(view_id) ON DELETE SET NULL,
  divergence_type   text         NOT NULL
    CHECK (divergence_type IN ('speaker_vs_data', 'speaker_vs_speaker', 'narrative_vs_flows', 'consensus_vs_positioning')),
  description       text         NOT NULL,
  speaker_direction text,
  data_direction    text,
  data_source       text,
  severity          text         DEFAULT 'notable'
    CHECK (severity IN ('minor', 'notable', 'significant', 'extreme')),
  trap_probability  numeric(5,2) DEFAULT 50.00
    CHECK (trap_probability BETWEEN 0 AND 100),
  is_resolved       boolean      DEFAULT false,
  resolution_notes  text,
  linked_signal_id  uuid,
  created_at        timestamptz  DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_divergences_episode ON public.podcast_divergences (episode_id);
CREATE INDEX IF NOT EXISTS idx_divergences_view ON public.podcast_divergences (view_id) WHERE view_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_divergences_type ON public.podcast_divergences (divergence_type);
CREATE INDEX IF NOT EXISTS idx_divergences_severity ON public.podcast_divergences (severity) WHERE severity != 'minor';
CREATE INDEX IF NOT EXISTS idx_divergences_unresolved ON public.podcast_divergences (is_resolved) WHERE NOT is_resolved;
CREATE INDEX IF NOT EXISTS idx_divergences_tenant ON public.podcast_divergences (tenant_id, created_at DESC);

-- 14. podcast_adversarial_scores — Episode-level adversarial/authenticity scoring
CREATE TABLE IF NOT EXISTS public.podcast_adversarial_scores (
  score_id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid,
  episode_id                    uuid         NOT NULL UNIQUE REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  authenticity_score            numeric(5,2) DEFAULT 50.00
    CHECK (authenticity_score BETWEEN 0 AND 100),
  originality_score             numeric(5,2) DEFAULT 50.00
    CHECK (originality_score BETWEEN 0 AND 100),
  manipulation_risk             numeric(5,2) DEFAULT 0.00
    CHECK (manipulation_risk BETWEEN 0 AND 100),
  recycled_talking_points       int          DEFAULT 0,
  coordinated_narrative_flags   int          DEFAULT 0,
  timing_suspicion_score        numeric(5,2) DEFAULT 0.00
    CHECK (timing_suspicion_score BETWEEN 0 AND 100),
  analysis_notes                text,
  scored_at                     timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adversarial_scores_authenticity ON public.podcast_adversarial_scores (authenticity_score);
CREATE INDEX IF NOT EXISTS idx_adversarial_scores_manipulation ON public.podcast_adversarial_scores (manipulation_risk DESC) WHERE manipulation_risk > 25;
CREATE INDEX IF NOT EXISTS idx_adversarial_scores_tenant ON public.podcast_adversarial_scores (tenant_id);

-- 15. podcast_daily_briefs — Pre-computed daily podcast intelligence summaries
CREATE TABLE IF NOT EXISTS public.podcast_daily_briefs (
  brief_id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid,
  brief_date             date         NOT NULL,
  episodes_analyzed      int          DEFAULT 0,
  top_emerging_ideas     jsonb        DEFAULT '[]',
  most_repeated_narrative text,
  most_contrarian_take   jsonb        DEFAULT '{}',
  biggest_disagreement   jsonb        DEFAULT '{}',
  new_divergences_count  int          DEFAULT 0,
  new_analog_references  jsonb        DEFAULT '[]',
  crowding_alerts        jsonb        DEFAULT '[]',
  trap_candidates        jsonb        DEFAULT '[]',
  full_summary           text,
  created_at             timestamptz  DEFAULT now(),
  UNIQUE (tenant_id, brief_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefs_date ON public.podcast_daily_briefs (brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_briefs_tenant ON public.podcast_daily_briefs (tenant_id, brief_date DESC);

-- 16. podcast_rhyme_suggestions — Auto-suggested History Rhymes entries from podcast analogs
CREATE TABLE IF NOT EXISTS public.podcast_rhyme_suggestions (
  suggestion_id      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid,
  analog_id          uuid         NOT NULL REFERENCES public.podcast_analogs(analog_id) ON DELETE CASCADE,
  episode_id         uuid         NOT NULL REFERENCES public.podcast_episodes(episode_id) ON DELETE CASCADE,
  speaker_id         uuid         REFERENCES public.podcast_speakers(speaker_id) ON DELETE SET NULL,
  suggested_rhyme_label text       NOT NULL,
  referenced_period  text         NOT NULL,
  reasoning          text,
  similarity_score   numeric(5,2) DEFAULT 50.00
    CHECK (similarity_score BETWEEN 0 AND 100),
  status             text         DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'merged')),
  linked_rhyme_id    uuid,
  reviewed_at        timestamptz,
  created_at         timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rhyme_suggestions_analog ON public.podcast_rhyme_suggestions (analog_id);
CREATE INDEX IF NOT EXISTS idx_rhyme_suggestions_episode ON public.podcast_rhyme_suggestions (episode_id);
CREATE INDEX IF NOT EXISTS idx_rhyme_suggestions_status ON public.podcast_rhyme_suggestions (status) WHERE status != 'accepted';
CREATE INDEX IF NOT EXISTS idx_rhyme_suggestions_tenant ON public.podcast_rhyme_suggestions (tenant_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.podcast_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_episode_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_macro_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_trade_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_analogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_uncertainty_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_narrative_velocity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaker_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaker_track_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_divergences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_adversarial_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_daily_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_rhyme_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_podcast_sources" ON public.podcast_sources;
CREATE POLICY "tenant_read_podcast_sources" ON public.podcast_sources
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_episodes" ON public.podcast_episodes;
CREATE POLICY "tenant_read_podcast_episodes" ON public.podcast_episodes
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_speakers" ON public.podcast_speakers;
CREATE POLICY "tenant_read_podcast_speakers" ON public.podcast_speakers
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_episode_speakers" ON public.podcast_episode_speakers;
CREATE POLICY "tenant_read_podcast_episode_speakers" ON public.podcast_episode_speakers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "tenant_read_podcast_macro_views" ON public.podcast_macro_views;
CREATE POLICY "tenant_read_podcast_macro_views" ON public.podcast_macro_views
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_trade_ideas" ON public.podcast_trade_ideas;
CREATE POLICY "tenant_read_podcast_trade_ideas" ON public.podcast_trade_ideas
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_narratives" ON public.podcast_narratives;
CREATE POLICY "tenant_read_podcast_narratives" ON public.podcast_narratives
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_analogs" ON public.podcast_analogs;
CREATE POLICY "tenant_read_podcast_analogs" ON public.podcast_analogs
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_uncertainty_markers" ON public.podcast_uncertainty_markers;
CREATE POLICY "tenant_read_podcast_uncertainty_markers" ON public.podcast_uncertainty_markers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "tenant_read_podcast_narrative_velocity" ON public.podcast_narrative_velocity;
CREATE POLICY "tenant_read_podcast_narrative_velocity" ON public.podcast_narrative_velocity
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_speaker_predictions" ON public.speaker_predictions;
CREATE POLICY "tenant_read_speaker_predictions" ON public.speaker_predictions
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_speaker_track_records" ON public.speaker_track_records;
CREATE POLICY "tenant_read_speaker_track_records" ON public.speaker_track_records
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_divergences" ON public.podcast_divergences;
CREATE POLICY "tenant_read_podcast_divergences" ON public.podcast_divergences
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_adversarial_scores" ON public.podcast_adversarial_scores;
CREATE POLICY "tenant_read_podcast_adversarial_scores" ON public.podcast_adversarial_scores
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_daily_briefs" ON public.podcast_daily_briefs;
CREATE POLICY "tenant_read_podcast_daily_briefs" ON public.podcast_daily_briefs
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

DROP POLICY IF EXISTS "tenant_read_podcast_rhyme_suggestions" ON public.podcast_rhyme_suggestions;
CREATE POLICY "tenant_read_podcast_rhyme_suggestions" ON public.podcast_rhyme_suggestions
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.podcast_sources IS 'RSS feeds, YouTube channels, and other podcast sources being tracked. Part of Podcast Intelligence (migration 425).';

COMMENT ON TABLE public.podcast_episodes IS 'Individual podcast episodes with transcript status and extraction pipeline state.';

COMMENT ON TABLE public.podcast_speakers IS 'Speaker profiles with credibility scoring, domain expertise, and bias tracking. Manually verified identity optional.';

COMMENT ON TABLE public.podcast_episode_speakers IS 'Junction table linking speakers to episodes with speaking time percentage.';

COMMENT ON TABLE public.podcast_macro_views IS 'Extracted macro viewpoints from episodes: bullish/bearish calls on assets, sectors, geopolitical risks, policy.';

COMMENT ON TABLE public.podcast_trade_ideas IS 'Explicit trade calls and implied positioning ideas extracted from episodes with conviction and narrative stage.';

COMMENT ON TABLE public.podcast_narratives IS 'Narrative threads detected across episodes: emerging themes, repeated talking points, shifting consensus.';

COMMENT ON TABLE public.podcast_analogs IS 'History Rhymes: when speakers reference past episodes, periods, or markets as analogs for current situation.';

COMMENT ON TABLE public.podcast_uncertainty_markers IS 'Hedging language, qualifiers, and confidence signals that modify accompanying claims.';

COMMENT ON TABLE public.podcast_narrative_velocity IS 'Time-windowed aggregation of narrative mentions, velocity, speaker diversity, and crowding risk.';

COMMENT ON TABLE public.speaker_predictions IS 'Granular predictions extracted from episodes for Brier score and track record scoring.';

COMMENT ON TABLE public.speaker_track_records IS 'Aggregated speaker accuracy, hit rate, calibration, and recency-weighted track record.';

COMMENT ON TABLE public.podcast_divergences IS 'When podcast views diverge from market data, other speakers, or narrative flows. Flags potential traps.';

COMMENT ON TABLE public.podcast_adversarial_scores IS 'Episode-level authenticity, originality, and manipulation risk scoring.';

COMMENT ON TABLE public.podcast_daily_briefs IS 'Pre-computed daily podcast intelligence summary: top ideas, contrarian takes, disagreements, crowding alerts.';

COMMENT ON TABLE public.podcast_rhyme_suggestions IS 'Auto-suggested History Rhymes entries from podcast analogs awaiting acceptance/rejection.';
