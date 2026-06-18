-- 10020_history_rhymes_observation_embeddings.sql
-- History Rhymes: observation-keyed embeddings for vetted feature-store model
-- observations / current states (C2-B).
--
-- WHY A SEPARATE TABLE: episode_embeddings (503_history_rhymes_structural.sql) is
-- the historical analog LIBRARY, keyed by episode_id with an FK to episodes.
-- Feature-store observations are keyed by observation_id / as_of_date and have NO
-- episode_id. C1 deliberately refused to hack that mismatch. This table is the
-- safe append-only home for observation embeddings; episode_embeddings is left
-- entirely untouched. Promotion of an observation INTO the episode library is a
-- separate, human-reviewed workflow (C3) — never an implicit side effect here.
--
-- Per ARCHITECTURE.md, hr_* is a documented single-tenant analytics module and is
-- exempt from env_id/business_id/RLS. This table is service-role only.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS public.hr_feature_store_observation_embeddings (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id            text NOT NULL,
    as_of_date                timestamptz NOT NULL,
    model_obs_version         text NOT NULL,
    embedding_model_version   text NOT NULL,
    feature_vector            vector(256) NOT NULL,
    text_embedding            vector(128),
    features_normalized       jsonb NOT NULL DEFAULT '{}'::jsonb,
    narrative_text            text,
    source_quality            text NOT NULL,
    model_readiness_score     numeric,
    readiness_degrade_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    lineage_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
    provenance                jsonb NOT NULL DEFAULT '{}'::jsonb,
    calibration_evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    backfill_receipt_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hr_fs_obs_emb_source_quality_chk
        CHECK (source_quality IN ('synthetic', 'fixture', 'live', 'synthetic_fallback')),
    CONSTRAINT hr_fs_obs_emb_readiness_chk
        CHECK (model_readiness_score IS NULL OR (model_readiness_score BETWEEN 0 AND 1)),
    -- append-only identity: one row per observation per obs-version per encoder-version
    CONSTRAINT hr_fs_obs_emb_uniq
        UNIQUE (observation_id, model_obs_version, embedding_model_version)
);

COMMENT ON TABLE public.hr_feature_store_observation_embeddings IS
    'Append-only embeddings for vetted feature-store model observations (C2-B). '
    'Intentionally SEPARATE from public.episode_embeddings: that table is the '
    'historical analog library keyed by episode_id (FK -> episodes); this one is '
    'keyed by observation_id and never references episodes. Promotion into the '
    'episode library is a human-reviewed C3 workflow, not an implicit write here. '
    'hr_* single-tenant analytics module: env_id/business_id/RLS-exempt, service-role only.';

COMMENT ON COLUMN public.hr_feature_store_observation_embeddings.observation_id IS
    'Gold model-observation id (hr_history_rhymes_model_observations.observation_id). Not an episode_id.';
COMMENT ON COLUMN public.hr_feature_store_observation_embeddings.model_obs_version IS
    'Model-observation contract version (e.g. hr-fs-v1) the source row was built under.';
COMMENT ON COLUMN public.hr_feature_store_observation_embeddings.embedding_model_version IS
    'Encoder/embedding version (e.g. state_vector_encoder_v1). Part of the append-only unique key — a new encoder produces a NEW row, never an in-place overwrite.';
COMMENT ON COLUMN public.hr_feature_store_observation_embeddings.feature_vector IS
    '256-dim L2(quant_128)||L2(text_128) state vector produced by the spine encoder.';
COMMENT ON COLUMN public.hr_feature_store_observation_embeddings.calibration_evidence_json IS
    'Calibration gate evidence (Brier, permutation p, no-lookahead, source) that authorized this insert.';
COMMENT ON COLUMN public.hr_feature_store_observation_embeddings.backfill_receipt_json IS
    'The dry-run/write receipt for the backfill batch that produced this row (audit trail).';

CREATE INDEX IF NOT EXISTS idx_hr_fs_obs_emb_as_of
    ON public.hr_feature_store_observation_embeddings (as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_fs_obs_emb_model_obs_version
    ON public.hr_feature_store_observation_embeddings (model_obs_version);
CREATE INDEX IF NOT EXISTS idx_hr_fs_obs_emb_source_quality
    ON public.hr_feature_store_observation_embeddings (source_quality);
-- HNSW for cosine retrieval, mirroring episode_embeddings (small corpus → high recall).
CREATE INDEX IF NOT EXISTS idx_hr_fs_obs_emb_hnsw
    ON public.hr_feature_store_observation_embeddings USING hnsw (feature_vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 256);

-- ── Verification: pgvector present + feature_vector is vector(256) ─────────────
-- The spine bridge depends on the 256-dim contract; fail loudly if wrong.
DO $$
DECLARE
    coltype text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'pgvector extension is not installed';
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod)
      INTO coltype
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'hr_feature_store_observation_embeddings'
       AND a.attname = 'feature_vector'
       AND a.attnum > 0
       AND NOT a.attisdropped;

    IF coltype IS NULL THEN
        RAISE EXCEPTION 'feature_vector column is missing on hr_feature_store_observation_embeddings';
    END IF;
    IF coltype <> 'vector(256)' THEN
        RAISE EXCEPTION 'feature_vector must be vector(256), found %', coltype;
    END IF;

    RAISE NOTICE 'hr_feature_store 10020 verification OK: feature_vector is % (dim 256)', coltype;
END $$;
