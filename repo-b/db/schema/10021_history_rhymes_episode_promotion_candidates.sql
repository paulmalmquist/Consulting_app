-- 10021_history_rhymes_episode_promotion_candidates.sql
-- History Rhymes: human-reviewed promotion candidates (C4).
--
-- THE AIRLOCK. This is the staging layer between model observations and the
-- historical episode library. A feature-store observation cannot become a row in
-- `episodes` (and therefore cannot get an `episode_embeddings` row) without first
-- becoming a candidate here, gathering evidence (calibration receipt, no-lookahead
-- audit, non-event context, lineage), and being EXPLICITLY APPROVED BY A HUMAN.
--
-- C4 is storage only: this migration creates no episode rows, writes no
-- embeddings, and never touches public.episodes / public.episode_embeddings.
-- See docs/history-rhymes/observation-to-episode-promotion.md (C3 design).
--
-- Per ARCHITECTURE.md, hr_* / episode_* History Rhymes tables are a documented
-- single-tenant analytics module, exempt from env_id/business_id/RLS;
-- service-role only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS public.hr_episode_promotion_candidates (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    candidate_id              text NOT NULL UNIQUE,
    observation_id            text NOT NULL,
    observation_embedding_id  uuid,
    as_of_date                timestamptz NOT NULL,
    model_obs_version         text NOT NULL,
    embedding_model_version   text NOT NULL,

    candidate_type            text NOT NULL,
    condition_cluster         text,
    candidate_label           text NOT NULL,
    source_quality            text NOT NULL,

    proposed_episode_name     text NOT NULL,
    proposed_asset_class      text NOT NULL,
    proposed_category         text,
    proposed_start_date       date,
    proposed_peak_date        date,
    proposed_trough_date      date,
    proposed_end_date         date,
    proposed_tags             text[] NOT NULL DEFAULT '{}',

    narrative_summary         text NOT NULL,
    features_snapshot         jsonb NOT NULL DEFAULT '{}'::jsonb,
    top_feature_drivers       jsonb NOT NULL DEFAULT '[]'::jsonb,

    readiness_score           numeric,
    readiness_degrade_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    lineage_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
    external_links_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
    calibration_evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    no_lookahead_audit_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
    non_event_context_json    jsonb NOT NULL DEFAULT '{}'::jsonb,

    reviewer_notes            text,
    approval_status           text NOT NULL DEFAULT 'draft',
    approval_actor            text,
    approval_timestamp        timestamptz,
    rejection_reason          text,
    superseded_by_candidate_id text,

    created_episode_id        uuid,
    promotion_receipt_json    jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hr_epc_status_chk CHECK (approval_status IN (
        'draft', 'needs_evidence', 'needs_review',
        'approved', 'rejected', 'superseded', 'promoted')),
    CONSTRAINT hr_epc_candidate_type_chk CHECK (candidate_type IN (
        'crisis_anchor', 'non_event_anchor', 'regime_shift',
        'trap_candidate', 'honeypot_candidate', 'routine_market_state')),
    CONSTRAINT hr_epc_candidate_label_chk CHECK (candidate_label IN (
        'crisis', 'non_event', 'regime_shift', 'trap', 'honeypot', 'routine')),
    CONSTRAINT hr_epc_source_quality_chk CHECK (source_quality IN (
        'synthetic', 'fixture', 'live', 'synthetic_fallback')),
    CONSTRAINT hr_epc_readiness_chk CHECK (
        readiness_score IS NULL OR (readiness_score BETWEEN 0 AND 1))
);

COMMENT ON TABLE public.hr_episode_promotion_candidates IS
    'THE AIRLOCK between model observations and institutional memory. Human-reviewed '
    'staging layer: an observation cannot become a public.episodes row (or get an '
    'episode_embeddings row) without a candidate here that gathered calibration + '
    'no-lookahead + non-event evidence and was explicitly human-approved. C4 storage '
    'only — never creates episodes or writes episode_embeddings. hr_* single-tenant, '
    'RLS-exempt, service-role only.';

COMMENT ON COLUMN public.hr_episode_promotion_candidates.approval_status IS
    'draft|needs_evidence|needs_review|approved|rejected|superseded|promoted. '
    'Only approved->promoted (with created_episode_id) authorizes an episodes row; promoted is terminal.';
COMMENT ON COLUMN public.hr_episode_promotion_candidates.candidate_type IS
    'crisis_anchor|non_event_anchor|regime_shift|trap_candidate|honeypot_candidate|routine_market_state. Not every observation is eligible.';
COMMENT ON COLUMN public.hr_episode_promotion_candidates.candidate_label IS
    'Human-assigned classification (crisis|non_event|regime_shift|trap|honeypot|routine), aligned with episode_detection_audit vocabulary.';
COMMENT ON COLUMN public.hr_episode_promotion_candidates.calibration_evidence_json IS
    'Brier/permutation/no-lookahead/model_version evidence (C1/C2-B contract) that gates needs_review and approval. Never fabricated.';
COMMENT ON COLUMN public.hr_episode_promotion_candidates.no_lookahead_audit_json IS
    'Deterministic no-lookahead audit {passed, violations[], knowable_as_of}. passed=true required to approve; a leakage block cannot be human-overridden.';
COMMENT ON COLUMN public.hr_episode_promotion_candidates.non_event_context_json IS
    'condition_cluster + counts + non_event_to_event_ratio + coverage_status. Ratio <2.0 blocks approval unless an audited override_reason is present.';
COMMENT ON COLUMN public.hr_episode_promotion_candidates.promotion_receipt_json IS
    'Immutable receipt(s) with deterministic evidence hashes. Never silently overwritten — prior receipts move into receipt_history.';
COMMENT ON COLUMN public.hr_episode_promotion_candidates.created_episode_id IS
    'Set only when an approved candidate is promoted and an episodes row was created (by a later ticket). NULL until then.';

CREATE INDEX IF NOT EXISTS idx_hr_epc_observation_id
    ON public.hr_episode_promotion_candidates (observation_id);
CREATE INDEX IF NOT EXISTS idx_hr_epc_approval_status
    ON public.hr_episode_promotion_candidates (approval_status);
CREATE INDEX IF NOT EXISTS idx_hr_epc_candidate_type
    ON public.hr_episode_promotion_candidates (candidate_type);
CREATE INDEX IF NOT EXISTS idx_hr_epc_candidate_label
    ON public.hr_episode_promotion_candidates (candidate_label);
CREATE INDEX IF NOT EXISTS idx_hr_epc_condition_cluster
    ON public.hr_episode_promotion_candidates (condition_cluster);
CREATE INDEX IF NOT EXISTS idx_hr_epc_as_of
    ON public.hr_episode_promotion_candidates (as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_epc_created_episode_id
    ON public.hr_episode_promotion_candidates (created_episode_id);

-- ── Verification: table + the gate constraints exist ──────────────────────────
DO $$
DECLARE
    cname text;
BEGIN
    IF to_regclass('public.hr_episode_promotion_candidates') IS NULL THEN
        RAISE EXCEPTION 'hr_episode_promotion_candidates was not created';
    END IF;
    FOREACH cname IN ARRAY ARRAY['hr_epc_status_chk', 'hr_epc_candidate_type_chk',
                                 'hr_epc_candidate_label_chk', 'hr_epc_source_quality_chk',
                                 'hr_epc_readiness_chk']
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname) THEN
            RAISE EXCEPTION 'missing gate constraint %', cname;
        END IF;
    END LOOP;
    RAISE NOTICE 'hr_feature_store 10021 verification OK: promotion-candidate airlock + gate constraints present';
END $$;
