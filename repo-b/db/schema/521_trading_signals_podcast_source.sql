-- Migration 521: Add 'podcast' to trading_signals.source CHECK constraint.
--
-- The podcast intelligence pipeline (migration 425) promotes high-quality
-- extracted signals into trading_signals for human review in the trading
-- lab. Before this migration, the promoter used source='ai_generated' as a
-- workaround and carried origin=podcast in the evidence jsonb. This migration
-- adds 'podcast' as a first-class source value so the promoter can stop
-- impersonating ai_generated signals.
--
-- Backfill: rows previously written with source='ai_generated' AND
-- evidence->>'origin'='podcast' are updated to source='podcast' so existing
-- dashboards and queries see consistent provenance.

BEGIN;

ALTER TABLE public.trading_signals
  DROP CONSTRAINT IF EXISTS trading_signals_source_check;

ALTER TABLE public.trading_signals
  ADD CONSTRAINT trading_signals_source_check
  CHECK (source IN ('manual', 'model', 'ingestion', 'ai_generated', 'podcast'));

UPDATE public.trading_signals
  SET source = 'podcast'
  WHERE source = 'ai_generated'
    AND evidence ? 'origin'
    AND evidence->>'origin' = 'podcast';

COMMENT ON COLUMN public.trading_signals.source IS
  'Origin of the signal. ''podcast'' means it was promoted from the podcast intelligence pipeline (migration 425) via podcast_signal_promoter.';

COMMIT;
