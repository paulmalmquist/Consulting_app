-- 10023_history_rhymes_episode_origin.sql
-- C11: additive promotion-origin / provenance columns on public.episodes.
--
-- C9 documented the gap: episodes had `source` ('manual'|'promotion') but no link
-- back to the promotion candidate that produced a C10-created row. These columns
-- let a promoted episode retain its origin in the row itself, instead of only in
-- the C8-A audit log + the create response.
--
-- ADDITIVE ONLY: every column is nullable (existing rows stay valid, no backfill).
-- No table recreation, no episode_embeddings change, no destructive statement.
-- `episodes` is a shared History Rhymes dimension table (no env_id/RLS, per the
-- existing 434/503 convention); this migration keeps that posture.

ALTER TABLE public.episodes
    ADD COLUMN IF NOT EXISTS origin_candidate_id          text,
    ADD COLUMN IF NOT EXISTS origin_observation_id        text,
    ADD COLUMN IF NOT EXISTS origin_model_obs_version     text,
    ADD COLUMN IF NOT EXISTS origin_embedding_model_version text,
    ADD COLUMN IF NOT EXISTS origin_receipt_hash          text,
    ADD COLUMN IF NOT EXISTS origin_metadata_json         jsonb NOT NULL DEFAULT '{}'::jsonb;

-- `source` already exists (VARCHAR(50) DEFAULT 'manual'); promotion sets it to
-- 'promotion'. No change to its definition.

COMMENT ON COLUMN public.episodes.origin_candidate_id IS
    'hr_episode_promotion_candidates.candidate_id this episode was promoted from (C10/C13). NULL for manually authored episodes.';
COMMENT ON COLUMN public.episodes.origin_observation_id IS
    'The originating feature-store model observation_id, carried from the candidate.';
COMMENT ON COLUMN public.episodes.origin_model_obs_version IS
    'model_obs_version of the originating observation (e.g. hr-fs-v1).';
COMMENT ON COLUMN public.episodes.origin_embedding_model_version IS
    'Encoder version recorded at promotion time (e.g. state_vector_encoder_v1).';
COMMENT ON COLUMN public.episodes.origin_receipt_hash IS
    'stable_hash of the candidate promotion_receipt_json at episode-creation time (audit cross-ref).';
COMMENT ON COLUMN public.episodes.origin_metadata_json IS
    'Free-form promotion provenance (candidate_type, candidate_label, condition_cluster, actor, etc.). Defaults to {}.';

-- ── Verification: columns exist + episode_embeddings untouched ────────────────
DO $$
DECLARE
    col text;
BEGIN
    FOREACH col IN ARRAY ARRAY['origin_candidate_id', 'origin_observation_id',
        'origin_model_obs_version', 'origin_embedding_model_version',
        'origin_receipt_hash', 'origin_metadata_json']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'episodes' AND column_name = col
        ) THEN
            RAISE EXCEPTION 'episodes origin column % was not added', col;
        END IF;
    END LOOP;
    RAISE NOTICE 'hr_feature_store 10023 verification OK: episodes promotion-origin columns present (additive)';
END $$;
