-- 10012_telemetry_copilot_fallback_reason.sql
-- Phase 8 (AI Governance): record WHY a copilot answer fell back to the deterministic template, so the
-- governance dashboard can report a real post-validator block count (and timeout/empty/error counts)
-- instead of lumping all fallbacks together. Pure observability — no behavior change.
-- Owning module: Telemetry Platform.

ALTER TABLE tel_copilot_interactions
  ADD COLUMN IF NOT EXISTS fallback_reason text;  -- postvalidate_block | timeout | empty_response | llm_error | no_api_key

COMMENT ON COLUMN tel_copilot_interactions.fallback_reason IS
  'Why answer_source=fallback_template (postvalidate_block = the post-validator caught an ungrounded id/number). NULL for live_llm / refusal. Phase 8 governance.';

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
      WHERE table_name='tel_copilot_interactions' AND column_name='fallback_reason';
    IF n <> 1 THEN RAISE EXCEPTION 'fallback_reason column missing'; END IF;
    RAISE NOTICE 'tel_copilot_interactions.fallback_reason ready';
END $$;
