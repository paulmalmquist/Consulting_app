-- ============================================================
-- 420 — Market Regime Snapshot
-- Multi-asset regime classifier output table
-- Applied: 2026-03-22
-- Origin: docs/market-features/prompts/2026-03-22-multi-asset-regime-classifier-dashboard.md
-- ============================================================

-- Regime snapshot per daily calculation run
CREATE TABLE IF NOT EXISTS public.market_regime_snapshot (
  snapshot_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  business_id     UUID,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  regime_label    TEXT NOT NULL CHECK (regime_label IN ('risk_on', 'risk_off', 'transitional', 'stress')),
  confidence      NUMERIC(5,2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  signal_breakdown JSONB NOT NULL DEFAULT '{}',
  -- shape: { "equities": {"score": 0.72, "weight": 0.30, "signals": [...]},
  --          "rates":    {"score": 0.40, "weight": 0.25, "signals": [...]},
  --          "credit":   {"score": 0.55, "weight": 0.25, "signals": [...]},
  --          "crypto":   {"score": 0.61, "weight": 0.20, "signals": [...]} }
  cross_vertical_implications JSONB NOT NULL DEFAULT '{}',
  -- shape: { "repe": "...", "credit": "...", "pds": "..." }
  source_metrics  JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_regime_snapshot_calculated_at
  ON public.market_regime_snapshot (calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_regime_snapshot_tenant
  ON public.market_regime_snapshot (tenant_id, calculated_at DESC);

-- RLS: tenant-scoped read, service-role write
ALTER TABLE public.market_regime_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "tenant_read_regime" ON public.market_regime_snapshot
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
