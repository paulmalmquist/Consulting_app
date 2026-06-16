-- 484_ade_ops_decision_type.sql
-- Extend ai_decision_audit_log.decision_type to allow 'ade_op' so the ADE Ops
-- Orchestrator can record its governed-operation receipts in the existing
-- immutable decision log (reuse, not a new audit table).
--
-- 407 declared decision_type with an INLINE CHECK, which Postgres auto-names
-- (e.g. ai_decision_audit_log_decision_type_check). We look that name up at
-- runtime, drop it, and add a stably-named CHECK that preserves every prior
-- allowed value plus 'ade_op'. Idempotent: re-running is a safe no-op once the
-- stably-named constraint exists.

DO $$
DECLARE
    old_con text;
BEGIN
    -- Already migrated? Nothing to do.
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ai_decision_audit_log'::regclass
          AND conname = 'ai_decision_audit_log_decision_type_chk'
    ) THEN
        RETURN;
    END IF;

    -- Find and drop the auto-named inline CHECK on decision_type, whatever it
    -- is called (match the column in the constraint definition).
    SELECT conname INTO old_con
    FROM pg_constraint
    WHERE conrelid = 'ai_decision_audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%decision_type%';

    IF old_con IS NOT NULL THEN
        EXECUTE format('ALTER TABLE ai_decision_audit_log DROP CONSTRAINT %I', old_con);
    END IF;

    ALTER TABLE ai_decision_audit_log
        ADD CONSTRAINT ai_decision_audit_log_decision_type_chk
        CHECK (decision_type IN ('tool_call', 'response', 'classification', 'fast_path', 'ade_op'));
END $$;

COMMENT ON CONSTRAINT ai_decision_audit_log_decision_type_chk ON ai_decision_audit_log
  IS 'Allowed decision_type values. ade_op added in 484 for the ADE Ops Orchestrator receipts.';
