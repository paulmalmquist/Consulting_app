-- Migration 422: BTC-SPX 30-Day Rolling Correlation Tracker
-- Phase B of the Market Intelligence Engine build.
-- Additive only — creates a new table only; no existing schema is modified.
--
-- Purpose:
--   Store daily 30-day rolling Pearson correlation between BTC-USD and ^GSPC
--   daily log returns. Enables Winston to answer "is BTC acting as a macro
--   risk asset right now?" and surface recoupling/decoupling alerts.
--
-- Data written by: backend/app/services/btc_spx_correlation_service.py
-- Data read by:    GET /api/v1/market/correlation/btc-spx
--                  repo-b/src/components/market/BtcSpxCorrelationChart.tsx

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.btc_spx_correlation (
  correlation_id     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid,
  business_id        uuid,

  -- Calculation date (one row per tenant per day)
  calculated_date    date         NOT NULL,

  -- Core signal
  correlation_30d    numeric(8,6) NOT NULL
    CONSTRAINT btc_spx_corr_range CHECK (correlation_30d BETWEEN -1 AND 1),

  -- Cumulative log returns for the 30-day window
  btc_return_30d     numeric(10,6),
  spx_return_30d     numeric(10,6),

  -- Zero-crossing detection
  zero_crossing      boolean      NOT NULL DEFAULT false,
  crossing_direction text
    CONSTRAINT btc_spx_crossing_dir CHECK (
      crossing_direction IS NULL
      OR crossing_direction IN ('decoupling', 'recoupling')
    ),

  -- Data quality
  data_points_used   int          NOT NULL DEFAULT 30
    CONSTRAINT btc_spx_data_points CHECK (data_points_used >= 0),

  -- Extensible metadata (regime signal text, prior correlation, etc.)
  metadata           jsonb        NOT NULL DEFAULT '{}',

  created_at         timestamptz  DEFAULT now(),

  -- One row per tenant per day (NULL tenant = global/demo)
  UNIQUE (tenant_id, calculated_date)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_btc_spx_corr_date
  ON public.btc_spx_correlation (calculated_date DESC);

CREATE INDEX IF NOT EXISTS idx_btc_spx_corr_tenant_date
  ON public.btc_spx_correlation (tenant_id, calculated_date DESC);

CREATE INDEX IF NOT EXISTS idx_btc_spx_corr_crossing
  ON public.btc_spx_correlation (zero_crossing, calculated_date DESC)
  WHERE zero_crossing = true;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.btc_spx_correlation ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read rows for their tenant or global rows (tenant_id IS NULL)
CREATE POLICY "tenant_read_btc_spx_corr"
  ON public.btc_spx_correlation
  FOR SELECT
  USING (tenant_id = auth.uid() OR tenant_id IS NULL);

-- Service role (backend) may insert/update; anon/authenticated cannot write
-- (No explicit write policy needed — service role bypasses RLS by default in Supabase)

-- ── Comment ───────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.btc_spx_correlation IS
  'Daily 30-day rolling Pearson correlation between BTC-USD and ^GSPC daily log returns. '
  'Written by btc_spx_correlation_service.py; read by the Market Intelligence module. '
  'Created in migration 422 as part of Phase B Market Intelligence Engine build.';

COMMENT ON COLUMN public.btc_spx_correlation.correlation_30d IS
  'Pearson r between BTC-USD and ^GSPC 30-day daily log returns. Range [-1, 1]. '
  'Positive = BTC correlating with equities (risk-asset behavior). '
  'Negative = BTC decoupled from equities (store-of-value behavior).';

COMMENT ON COLUMN public.btc_spx_correlation.zero_crossing IS
  'True if the correlation sign changed vs. the prior day''s row. '
  'Triggers a recoupling (negative→positive) or decoupling (positive→negative) alert.';
