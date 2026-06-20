-- Migration 10002: History Rhymes research → planning-agent bridge
--
-- Adds the research-to-plan backing stores:
--   - hr_research_briefs          (durable raw weekly research brief + parsed JSON)
--   - hr_enhancement_candidates   (actionable items extracted from a brief)
--   - hr_research_runs            (minimal extraction-run tracking: 3 writes max)
--
-- hr_* module is single-tenant analytics: no env_id, no business_id, no RLS.
-- Exemption documented in ARCHITECTURE.md. These tables intentionally mirror the
-- 519_historyrhymes_execution_loop.sql convention (sibling hr_* tables).
--
-- Distinct from hr_weekly_briefs (519): that table is the execution-layer
-- regime-call brief feeding the decision runner. hr_research_briefs is the
-- 4-week rotating-pillar RESEARCH brief feeding the planning-agent bridge.
--
-- Additive only. Does not touch existing data.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Shared updated_at trigger function (idempotent; also defined in migration 237).
-- Re-declared here so this migration is self-contained on idempotent reruns.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: RESEARCH BRIEFS (durable raw artifact + parsed structured JSON)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hr_research_briefs (
    brief_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brief_date        DATE NOT NULL,
    week_type         TEXT NOT NULL,                       -- e.g. "Week 1"
    pillar_name       TEXT NOT NULL,                       -- rotating weekly pillar
    title             TEXT,
    markdown_content  TEXT NOT NULL,                       -- raw archive (source of record)
    parsed_json       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- operational source: 7 sections + meta
    confidence        NUMERIC,                             -- deterministic fraction, display only
    freshness_score   NUMERIC,                             -- parsed from brief header if present
    source_filename   TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_research_briefs_brief_date
    ON public.hr_research_briefs (brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_research_briefs_created_at
    ON public.hr_research_briefs (created_at DESC);

COMMENT ON TABLE public.hr_research_briefs IS
    'History Rhymes research → planning bridge: durable raw weekly research brief. markdown_content is the archive of record; parsed_json is the operational source (7 deterministically-extracted sections + header meta). Single-tenant hr_* module — no env_id/RLS (ARCHITECTURE.md exemption). Distinct from hr_weekly_briefs (execution-layer regime brief).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'hr_research_briefs_set_updated_at'
  ) THEN
    CREATE TRIGGER hr_research_briefs_set_updated_at
      BEFORE UPDATE ON public.hr_research_briefs
      FOR EACH ROW
      EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: ENHANCEMENT CANDIDATES (actionable items extracted from a brief)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hr_enhancement_candidates (
    candidate_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brief_id            UUID REFERENCES public.hr_research_briefs(brief_id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    category            TEXT,
    what                TEXT,
    why                 TEXT,
    effort_days         NUMERIC,
    expected_impact     TEXT,
    dependencies        JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority            TEXT NOT NULL DEFAULT 'medium',
    confidence          NUMERIC,
    adversarial_verdict TEXT,
    status              TEXT NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new','promoted','discarded','planned','shipped')),
    planning_markdown   TEXT,                                -- planning-agent-ready plan
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_enhancement_candidates_brief_id
    ON public.hr_enhancement_candidates (brief_id);
CREATE INDEX IF NOT EXISTS idx_hr_enhancement_candidates_status
    ON public.hr_enhancement_candidates (status);
CREATE INDEX IF NOT EXISTS idx_hr_enhancement_candidates_created_at
    ON public.hr_enhancement_candidates (created_at DESC);

COMMENT ON TABLE public.hr_enhancement_candidates IS
    'History Rhymes research → planning bridge: actionable items extracted from a research brief Enhancement Path. planning_markdown holds the generated planning-agent-ready plan. status lifecycle: new → promoted|discarded → planned → shipped. Single-tenant hr_* module — no env_id/RLS (ARCHITECTURE.md exemption).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'hr_enhancement_candidates_set_updated_at'
  ) THEN
    CREATE TRIGGER hr_enhancement_candidates_set_updated_at
      BEFORE UPDATE ON public.hr_enhancement_candidates
      FOR EACH ROW
      EXECUTE FUNCTION app.set_updated_at();
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: RESEARCH RUNS (minimal extraction-run tracking — support infra)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Deliberately minimal (guardrail 1): exactly 3 writes per ingest
-- (insert started → update terminal → error_message on exception). metrics holds
-- only {sections_found, candidate_count, confidence}. No run-history UI.

CREATE TABLE IF NOT EXISTS public.hr_research_runs (
    run_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brief_id      UUID REFERENCES public.hr_research_briefs(brief_id) ON DELETE SET NULL,
    run_type      TEXT NOT NULL,                            -- e.g. "ingest_extract"
    status        TEXT NOT NULL DEFAULT 'started'
                    CHECK (status IN ('started','succeeded','degraded','failed')),
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    error_message TEXT,
    metrics       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_hr_research_runs_brief_id
    ON public.hr_research_runs (brief_id);
CREATE INDEX IF NOT EXISTS idx_hr_research_runs_status
    ON public.hr_research_runs (status);
CREATE INDEX IF NOT EXISTS idx_hr_research_runs_started_at
    ON public.hr_research_runs (started_at DESC);

COMMENT ON TABLE public.hr_research_runs IS
    'History Rhymes research → planning bridge: minimal extraction-run tracking (start/terminal/error only — guardrail 1, not an observability surface). Single-tenant hr_* module — no env_id/RLS (ARCHITECTURE.md exemption).';
