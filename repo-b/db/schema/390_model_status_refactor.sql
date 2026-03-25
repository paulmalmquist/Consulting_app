-- 390: Refactor model status from 'approved' to 'official_base_case'
-- "Approved" had no downstream effects. "Official Base Case" means locked from edits.

BEGIN;

UPDATE re_model SET status = 'official_base_case' WHERE status = 'approved';

ALTER TABLE re_model DROP CONSTRAINT IF EXISTS re_model_status_check;
ALTER TABLE re_model ADD CONSTRAINT re_model_status_check
  CHECK (status IN ('draft', 'official_base_case', 'archived'));

COMMIT;
