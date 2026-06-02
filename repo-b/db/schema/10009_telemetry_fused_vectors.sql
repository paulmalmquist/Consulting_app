-- 10009_telemetry_fused_vectors.sql
-- Phase 7A: 256-dimensional fused NASA-analog telemetry state vectors + feature manifest.
-- A fused vector = 32 real SMAP/MSL channels x 8 computed window features, derived only from real
-- values in novendor_1.telemetry.gold_smap_msl_windows. Channels are aligned by NORMALIZED sequence
-- progress (each channel's split split into equal buckets), NOT by physical simultaneity -- this is a
-- fused analog representation for model development + retrieval, not simultaneous vehicle telemetry.
-- Owning module: Telemetry Platform. Public NASA analog data only.
--
-- feature_vector uses pgvector (extension already installed, 0.8.0) so these vectors double as the
-- analog-retrieval embeddings (Phase 7D adds the HNSW index).

CREATE EXTENSION IF NOT EXISTS vector;

-- ── tel_fused_state_vectors ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_fused_state_vectors (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id                    text NOT NULL,
    business_id               uuid NOT NULL,
    vector_id                 text NOT NULL,
    dataset                   text NOT NULL DEFAULT 'smap_msl',
    split                     text NOT NULL,                  -- train | test
    window_index              integer NOT NULL,               -- normalized bucket index
    source_channels           text NOT NULL,                  -- comma-joined 32 channel ids (fixed order)
    vector_dim                integer NOT NULL,               -- 256
    feature_vector            vector(256) NOT NULL,           -- raw fused 32x8 features (pgvector)
    label_any_anomaly         integer NOT NULL DEFAULT 0,     -- eval label (test split); never a model input
    label_channels_anomalous  text,                           -- comma-joined channels anomalous in this bucket
    recon_error_ae            double precision,               -- dense autoencoder-style recon MSE
    recon_error_pca           double precision,               -- PCA-256 baseline recon MSE
    top_contributors          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ranked per-channel attribution
    source                    text NOT NULL DEFAULT 'public_nasa_analog_dataset',
    created_at                timestamptz NOT NULL DEFAULT now(),
    is_backfilled             boolean NOT NULL DEFAULT false,
    backfill_batch_id         text,
    UNIQUE (env_id, business_id, vector_id)
);
ALTER TABLE tel_fused_state_vectors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_fused_state_vectors_tenant ON tel_fused_state_vectors
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_fused_state_vectors IS
  'Telemetry Platform: 256-d fused NASA-analog state vectors (32 SMAP/MSL channels x 8 window features), normalized-progress aligned. pgvector embeddings for analog retrieval. Public analog data. Owning module: Telemetry Platform.';

-- ── tel_feature_manifest ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tel_feature_manifest (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id            text NOT NULL,
    business_id       uuid NOT NULL,
    feature_index     integer NOT NULL,        -- 0..255
    chan_id           text NOT NULL,
    feature_name      text NOT NULL,
    source_table      text NOT NULL,
    calc              text NOT NULL,           -- calculation logic
    leakage_risk      text NOT NULL,
    included          boolean NOT NULL DEFAULT true,
    is_backfilled     boolean NOT NULL DEFAULT false,
    backfill_batch_id text,
    UNIQUE (env_id, business_id, feature_index)
);
ALTER TABLE tel_feature_manifest ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY tel_feature_manifest_tenant ON tel_feature_manifest
        USING (env_id = current_setting('app.env_id', true))
        WITH CHECK (env_id = current_setting('app.env_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE tel_feature_manifest IS
  'Telemetry Platform: per-feature manifest for the 256-d fused state vector (feature_index -> channel/feature/calc/leakage). Owning module: Telemetry Platform.';

-- ── verification ─────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_tables
      WHERE schemaname='public' AND tablename IN ('tel_fused_state_vectors','tel_feature_manifest')
        AND rowsecurity = true;
    RAISE NOTICE 'fused-vector tables with RLS: %', n;
    IF n < 2 THEN RAISE EXCEPTION 'fused-vector migration incomplete: % of 2', n; END IF;
END $$;
