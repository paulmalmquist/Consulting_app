-- 10022_history_rhymes_promotion_audit_type.sql
-- C8-A: widen the ai_decision_audit_log.decision_type CHECK to allow promotion-
-- candidate audit records, so C6 promotion actions can be logged at the platform
-- layer alongside the C4 immutable per-candidate receipt.
--
-- The original CHECK (407_ai_decision_audit_log.sql) is an INLINE, unnamed column
-- constraint, so Postgres auto-named it `ai_decision_audit_log_decision_type_check`.
-- This is a CONTROLLED WIDENING: drop that one constraint and re-add it with EVERY
-- existing allowed value PLUS the single new promotion type. No data is dropped, the
-- table is not recreated, no other column changes, and no wildcard value is added.
-- public.episodes / public.episode_embeddings are untouched.

DO $$
DECLARE
    conname text;
BEGIN
    -- Find the existing CHECK constraint on decision_type by its definition,
    -- without assuming the auto-generated name.
    SELECT c.conname INTO conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'ai_decision_audit_log'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%decision_type%';

    IF conname IS NULL THEN
        -- No CHECK present (e.g. fresh/altered env): add the widened one directly.
        ALTER TABLE public.ai_decision_audit_log
            ADD CONSTRAINT ai_decision_audit_log_decision_type_check
            CHECK (decision_type IN (
                'tool_call', 'response', 'classification', 'fast_path',
                'history_rhymes_promotion_candidate_action'));
    ELSE
        EXECUTE format('ALTER TABLE public.ai_decision_audit_log DROP CONSTRAINT %I', conname);
        ALTER TABLE public.ai_decision_audit_log
            ADD CONSTRAINT ai_decision_audit_log_decision_type_check
            CHECK (decision_type IN (
                'tool_call', 'response', 'classification', 'fast_path',
                'history_rhymes_promotion_candidate_action'));
    END IF;
END $$;

-- ── Verification: the new value is accepted AND the legacy values still are ───
DO $$
DECLARE
    def text;
BEGIN
    SELECT pg_get_constraintdef(c.oid) INTO def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'ai_decision_audit_log'
       AND c.conname = 'ai_decision_audit_log_decision_type_check';

    IF def IS NULL THEN
        RAISE EXCEPTION 'decision_type CHECK constraint missing after widening';
    END IF;
    -- every legacy value + the new one must be present in the constraint definition
    IF def NOT LIKE '%tool_call%' OR def NOT LIKE '%response%'
       OR def NOT LIKE '%classification%' OR def NOT LIKE '%fast_path%' THEN
        RAISE EXCEPTION 'widening dropped a legacy decision_type value: %', def;
    END IF;
    IF def NOT LIKE '%history_rhymes_promotion_candidate_action%' THEN
        RAISE EXCEPTION 'new promotion decision_type not added: %', def;
    END IF;
    RAISE NOTICE 'hr_feature_store 10022 verification OK: decision_type CHECK widened (legacy preserved + promotion type added)';
END $$;
