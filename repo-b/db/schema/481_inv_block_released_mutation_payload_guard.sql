-- 481_inv_block_released_mutation_payload_guard.sql
-- Strengthen inv_block_released_mutation() to block ALL payload edits while a row is released,
-- not just input_versions. Released rows are effectively read-only except for the one allowed
-- transition (released → superseded with superseded_by_id / superseded_reason populated).
--
-- Bug found during Phase 1 smoke verification: UPDATE inv_nav_snapshot SET nav_native = 999999
-- succeeded on a released row. That violates skills/winston-investment-snapshot and ADR 003.
--
-- Fix: compare full row jsonb minus the explicitly mutable fields. If anything else changed,
-- raise. The four mutable fields on a released row are status, superseded_by_id,
-- superseded_reason, and updated_at. They form the supersession transition; everything else
-- must equal OLD.
--
-- Idempotent. Depends on 474 (defines the original inv_block_released_mutation function).

CREATE OR REPLACE FUNCTION inv_block_released_mutation() RETURNS trigger AS $$
DECLARE
    v_old_payload jsonb;
    v_new_payload jsonb;
BEGIN
    -- DELETE always blocked on released or superseded rows.
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('released','superseded') THEN
            RAISE EXCEPTION 'inv: cannot delete row with status=% (table=%, id=%)',
                OLD.status, TG_TABLE_NAME, OLD.id;
        END IF;
        RETURN OLD;
    END IF;

    -- Block any change once a row is superseded.
    IF OLD.status = 'superseded' THEN
        RAISE EXCEPTION 'inv: cannot mutate superseded row (table=%, id=%)', TG_TABLE_NAME, OLD.id;
    END IF;

    -- If OLD was released, only the transition to superseded is allowed,
    -- and only through specific fields (status, superseded_by_id, superseded_reason, updated_at).
    IF OLD.status = 'released' THEN
        IF NEW.status NOT IN ('released','superseded') THEN
            RAISE EXCEPTION 'inv: cannot transition released row to status=% (table=%, id=%)',
                NEW.status, TG_TABLE_NAME, OLD.id;
        END IF;

        v_old_payload := to_jsonb(OLD)
                         - 'status' - 'superseded_by_id' - 'superseded_reason' - 'updated_at';
        v_new_payload := to_jsonb(NEW)
                         - 'status' - 'superseded_by_id' - 'superseded_reason' - 'updated_at';

        IF v_old_payload IS DISTINCT FROM v_new_payload THEN
            RAISE EXCEPTION 'inv: released row is immutable except for supersession transition (table=%, id=%)',
                TG_TABLE_NAME, OLD.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION inv_block_released_mutation() IS
    'Snapshot immutability guard. Released rows: only released→superseded transition allowed; payload + input_versions immutable. Superseded rows: fully immutable. DELETE blocked on released or superseded. Attached BEFORE UPDATE OR DELETE on inv_*_snapshot tables. Strengthened in 481.';
