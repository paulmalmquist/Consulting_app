-- =============================================================================
-- 615_ade_ops_simulated_execution.sql
-- ADE Ops PR 5B — Simulated Non-Prod Execution Only.
--
-- Relaxes the PR 5A "no execution" guard so that an approval row MAY record
-- executed=true ONLY when execution_mode = 'simulation'. Real execution modes
-- ('nonprod','prod') still cannot set executed=true at the schema level — the DB
-- itself keeps real provider writes impossible in PR 5B. Adds the columns the
-- simulated execution ceremony records (mode, executed_at, observation window,
-- rollback). Idempotent / safe no-op if already applied.
-- Owning module: app.services.ade_ops.simulation.
-- =============================================================================

DO $$
BEGIN
    -- New columns (idempotent).
    ALTER TABLE ade_ops_approvals
        ADD COLUMN IF NOT EXISTS execution_mode text,
        ADD COLUMN IF NOT EXISTS executed_at timestamptz,
        ADD COLUMN IF NOT EXISTS observation_window_opened_at timestamptz,
        ADD COLUMN IF NOT EXISTS rolled_back boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz;

    -- execution_mode domain: null (not executed) or one of the three modes.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ade_ops_approvals_execution_mode_chk') THEN
        ALTER TABLE ade_ops_approvals
            ADD CONSTRAINT ade_ops_approvals_execution_mode_chk
            CHECK (execution_mode IS NULL OR execution_mode IN ('simulation','nonprod','prod'));
    END IF;

    -- Replace the PR 5A hard guard (executed = false) with the PR 5B guard:
    -- executed may be true ONLY in simulation mode. Real modes stay impossible.
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ade_ops_approvals_no_execution_pr5a') THEN
        ALTER TABLE ade_ops_approvals DROP CONSTRAINT ade_ops_approvals_no_execution_pr5a;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ade_ops_approvals_simulation_only_exec') THEN
        ALTER TABLE ade_ops_approvals
            ADD CONSTRAINT ade_ops_approvals_simulation_only_exec
            CHECK (executed = false OR execution_mode = 'simulation');
    END IF;
END $$;

COMMENT ON COLUMN ade_ops_approvals.execution_mode IS
    'Which executor ran: simulation (only mode allowed to set executed=true in PR 5B), nonprod (PR 5C+), prod (PR 5C+).';
COMMENT ON COLUMN ade_ops_approvals.observation_window_opened_at IS
    'When the post-execution observation window was opened (simulated executions open one too).';
