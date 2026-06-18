-- 541_ai_dispatch_decision_type.sql
-- Extend ai_decision_audit_log.decision_type CHECK to allow 'provider_dispatch'.
--
-- WHY: the AI provider dispatch layer records each routing/dispatch decision via
-- governance.record_decision(decision_type='provider_dispatch', ...). The original
-- CHECK in 407_ai_decision_audit_log.sql only allowed
-- ('tool_call','response','classification','fast_path'), so without this migration
-- Postgres rejects the insert and record_decision silently swallows it (returns NULL).
--
-- IDEMPOTENT: the DO block finds and drops whatever CHECK currently constrains
-- decision_type (its auto-generated name may vary), then re-adds the full value set.
-- Safe to run repeatedly and a safe no-op if already applied.
--
-- COORDINATION: an unrelated "ADE Ops" change also extends this same CHECK to add
-- 'ade_op'. To make migration order irrelevant, this value list includes BOTH
-- 'provider_dispatch' and 'ade_op'. Allowing a value that nothing writes yet is
-- harmless. No new table; tenant scoping / RLS unchanged.

DO $$
DECLARE
    target_constraint text;
BEGIN
    SELECT c.conname
      INTO target_constraint
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'ai_decision_audit_log'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%decision_type%'
     LIMIT 1;

    IF target_constraint IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE ai_decision_audit_log DROP CONSTRAINT %I',
            target_constraint
        );
    END IF;
END $$;

-- Use the SAME stable constraint name as 484_ade_ops_decision_type.sql
-- (..._decision_type_chk) so the two migrations are order-independent: whichever
-- runs second simply re-adds the full value union under the shared name, and
-- re-running either is a safe no-op.
ALTER TABLE ai_decision_audit_log
    ADD CONSTRAINT ai_decision_audit_log_decision_type_chk
    CHECK (decision_type IN (
        'tool_call',
        'response',
        'classification',
        'fast_path',
        'provider_dispatch',
        'ade_op'
    ));
