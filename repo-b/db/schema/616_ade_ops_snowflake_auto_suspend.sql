-- =============================================================================
-- 616_ade_ops_snowflake_auto_suspend.sql
-- ADE Ops PR 5C — First real provider write: Snowflake non-prod warehouse
-- AUTO_SUSPEND only.
--
-- Widens the execution guard by exactly ONE real action and no more. A real
-- (execution_mode='nonprod') executed row is permitted ONLY when it is the single
-- allowed action: provider='snowflake', action_kind='warehouse_auto_suspend', with
-- BOTH the generated-SQL hash and rollback-SQL hash recorded. 'prod' executed rows
-- remain impossible at the schema level; 'simulation' stays allowed (PR 5B).
-- Records before/after intent + SQL hashes for the immutable receipt.
-- Owning module: app.services.ade_ops.snowflake_executor.
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE ade_ops_approvals
        ADD COLUMN IF NOT EXISTS action_kind text,
        ADD COLUMN IF NOT EXISTS generated_sql_hash text,
        ADD COLUMN IF NOT EXISTS rollback_sql_hash text,
        ADD COLUMN IF NOT EXISTS before_value text,
        ADD COLUMN IF NOT EXISTS after_value text;

    -- Replace the PR 5B guard (simulation-only) with the PR 5C guard: simulation
    -- OR the single allowed real nonprod Snowflake auto_suspend action with hashes.
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ade_ops_approvals_simulation_only_exec') THEN
        ALTER TABLE ade_ops_approvals DROP CONSTRAINT ade_ops_approvals_simulation_only_exec;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ade_ops_approvals_real_exec_guard') THEN
        ALTER TABLE ade_ops_approvals
            ADD CONSTRAINT ade_ops_approvals_real_exec_guard
            CHECK (
                executed = false
                OR execution_mode = 'simulation'
                OR (
                    execution_mode = 'nonprod'
                    AND provider = 'snowflake'
                    AND action_kind = 'warehouse_auto_suspend'
                    AND generated_sql_hash IS NOT NULL
                    AND rollback_sql_hash IS NOT NULL
                )
            );
    END IF;
END $$;

COMMENT ON COLUMN ade_ops_approvals.action_kind IS
    'The specific provider action executed. PR 5C permits exactly one real action: warehouse_auto_suspend (Snowflake, non-prod).';
COMMENT ON COLUMN ade_ops_approvals.generated_sql_hash IS
    'sha256 of the executor-generated SQL (typed-field-built, validated). Stored for the immutable receipt; the raw SQL is not user-supplied.';
COMMENT ON COLUMN ade_ops_approvals.rollback_sql_hash IS
    'sha256 of the rollback SQL, generated before execution.';
