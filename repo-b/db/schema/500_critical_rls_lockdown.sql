-- 500_critical_rls_lockdown.sql
-- Immediate RLS coverage for the highest-risk PII and secret-bearing env-scoped tables.
-- Safe default: if app.env_id is not set, current_setting(..., true) returns NULL and matches nothing.

DO $$
DECLARE
  _tbl text;
BEGIN
  FOR _tbl IN
    SELECT unnest(ARRAY[
      'dc_borrower',
      'nv_account_contacts',
      'nv_accounts',
      'cro_strategic_contact',
      'legal_law_firms',
      'pds_vendors',
      'pds_account_owners',
      're_pipeline_contact',
      'credit_cases',
      'pds_exec_integration_config',
      'dc_loan_file'
    ])
  LOOP
    IF to_regclass(format('public.%I', _tbl)) IS NULL THEN
      RAISE NOTICE 'Skipping %. Table not present in public schema.', _tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = _tbl
        AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        $policy$
        CREATE POLICY tenant_isolation ON %I
          USING (env_id = current_setting('app.env_id', true))
          WITH CHECK (env_id = current_setting('app.env_id', true))
        $policy$,
        _tbl
      );
    END IF;
  END LOOP;
END $$;

-- Verification after apply:
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN (
--   'dc_borrower',
--   'nv_account_contacts',
--   'nv_accounts',
--   'cro_strategic_contact',
--   'legal_law_firms',
--   'pds_vendors',
--   'pds_account_owners',
--   're_pipeline_contact',
--   'credit_cases',
--   'pds_exec_integration_config',
--   'dc_loan_file'
-- )
--   AND relrowsecurity = true;
