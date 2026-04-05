-- 501_bulk_rls_rollout.sql
-- Rolls tenant-isolation RLS across remaining public tables that carry env_id.

DO $$
DECLARE
  _tbl text;
  _env_id_type text;
BEGIN
  FOR _tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_class pc
      ON pc.relname = c.table_name
    JOIN pg_namespace pn
      ON pn.oid = pc.relnamespace
    WHERE c.table_schema = 'public'
      AND c.column_name = 'env_id'
      AND pn.nspname = 'public'
      AND pc.relkind = 'r'
      AND c.table_name NOT IN (
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
      )
    GROUP BY c.table_name
    ORDER BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);

    SELECT data_type
    INTO _env_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = _tbl
      AND column_name = 'env_id';

    IF _env_id_type IS NULL THEN
      RAISE NOTICE 'Skipping %. env_id column not present.', _tbl;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = _tbl
        AND policyname = 'tenant_isolation'
    ) THEN
      IF _env_id_type = 'uuid' THEN
        EXECUTE format(
          $policy$
          CREATE POLICY tenant_isolation ON %I
            USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
            WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
          $policy$,
          _tbl
        );
      ELSE
        EXECUTE format(
          $policy$
          CREATE POLICY tenant_isolation ON %I
            USING (env_id = current_setting('app.env_id', true))
            WITH CHECK (env_id = current_setting('app.env_id', true))
          $policy$,
          _tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- Coverage verification:
-- SELECT COUNT(*)
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'r'
--   AND c.relrowsecurity = true;
