-- 528_authoritative_state_supersede_transition.sql
-- Update the immutability trigger to allow controlled released → superseded
-- transitions and the corresponding writes to superseded_at / superseded_by.
--
-- Why: rule #6 of SYSTEM_RULES_AUTHORITATIVE_STATE.md says released rows are
-- immutable. That stays true for the row's *payload* (canonical_metrics,
-- null_reasons, snapshot_version, audit_run_id). But when a duplicate
-- release exists for the same (entity, quarter), exactly one of them is
-- canonical and the others must be marked superseded so the partial
-- unique index can enforce uniqueness. This is bookkeeping, not value
-- mutation: the underlying snapshot data is untouched.
--
-- The new transition is one-way: released → superseded only. Once
-- superseded, the row stays that way (no resurrection back to released).
-- That preserves the audit chain — you can always trace from a current
-- canonical row backward through its superseded predecessors via
-- superseded_by, and forward through any later replacement.

BEGIN;

CREATE OR REPLACE FUNCTION public.re_authoritative_enforce_promotion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed_keys text[] := ARRAY[
    'promotion_state',
    'verified_at',
    'verified_by',
    'released_at',
    'released_by',
    'superseded_at',
    'superseded_by'
  ];
BEGIN
  IF TG_OP = 'DELETE' AND OLD.promotion_state IN ('released', 'superseded') THEN
    RAISE EXCEPTION 'Released or superseded authoritative snapshot rows are immutable (table=%, id=%)',
      TG_TABLE_NAME, OLD.id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - allowed_keys <> to_jsonb(OLD) - allowed_keys THEN
      RAISE EXCEPTION 'Authoritative snapshot payloads are immutable after insert (table=%, id=%)',
        TG_TABLE_NAME, OLD.id;
    END IF;

    IF OLD.promotion_state = 'draft_audit'
       AND NEW.promotion_state NOT IN ('draft_audit', 'verified', 'released') THEN
      RAISE EXCEPTION 'Invalid promotion transition % -> %', OLD.promotion_state, NEW.promotion_state;
    END IF;

    IF OLD.promotion_state = 'verified'
       AND NEW.promotion_state NOT IN ('verified', 'released') THEN
      RAISE EXCEPTION 'Invalid promotion transition % -> %', OLD.promotion_state, NEW.promotion_state;
    END IF;

    -- Released rows can transition only to 'superseded' (cleanup case),
    -- and only when superseded_at and superseded_by are both set.
    IF OLD.promotion_state = 'released' AND NEW.promotion_state <> 'released' THEN
      IF NEW.promotion_state <> 'superseded' THEN
        RAISE EXCEPTION
          'Released authoritative snapshot rows can only be superseded, not downgraded to %',
          NEW.promotion_state;
      END IF;
      IF NEW.superseded_at IS NULL OR NEW.superseded_by IS NULL THEN
        RAISE EXCEPTION
          'Transition released -> superseded requires superseded_at AND superseded_by set (table=%, id=%)',
          TG_TABLE_NAME, OLD.id;
      END IF;
      IF NEW.superseded_by = OLD.id THEN
        RAISE EXCEPTION
          'A row cannot supersede itself (table=%, id=%)',
          TG_TABLE_NAME, OLD.id;
      END IF;
    END IF;

    -- Superseded rows are terminal: no further transitions allowed.
    IF OLD.promotion_state = 'superseded'
       AND NEW.promotion_state <> 'superseded' THEN
      RAISE EXCEPTION
        'Superseded authoritative snapshots are terminal and cannot transition (table=%, id=%)',
        TG_TABLE_NAME, OLD.id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMIT;
