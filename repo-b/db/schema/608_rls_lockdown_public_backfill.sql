-- 608_rls_lockdown_public_backfill.sql
-- Backfills row-level security on every public table that the Supabase
-- security advisor flagged as `rls_disabled_in_public`. Three buckets:
--   1. tables with env_id        -> tenant_isolation on env_id
--   2. tables with business_id   -> business_isolation on business_id
--   3. tables with neither       -> RLS enabled, no policy (service_role only)
--
-- Bucket 3 makes the table inaccessible to authenticated/anon roles unless
-- a future migration adds a policy. That is the correct safe posture for
-- internal/reference tables that the FastAPI backend reads via service_role.
--
-- Idempotent: re-running is a no-op. Builds on the pattern in
-- 501_bulk_rls_rollout.sql and 910_fin_rls.sql.

-- 1. env_id-based tenant isolation
DO $$
DECLARE
  _tbl text;
  _env_id_type text;
BEGIN
  FOR _tbl IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = n.nspname
     AND col.table_name = c.relname
     AND col.column_name = 'env_id'
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
    GROUP BY c.relname
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _tbl);

    SELECT data_type INTO _env_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = _tbl
      AND column_name = 'env_id';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = _tbl AND policyname = 'tenant_isolation'
    ) THEN
      IF _env_id_type = 'uuid' THEN
        EXECUTE format($policy$
          CREATE POLICY tenant_isolation ON public.%I
            USING (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
            WITH CHECK (env_id = NULLIF(current_setting('app.env_id', true), '')::uuid)
        $policy$, _tbl);
      ELSE
        EXECUTE format($policy$
          CREATE POLICY tenant_isolation ON public.%I
            USING (env_id = current_setting('app.env_id', true))
            WITH CHECK (env_id = current_setting('app.env_id', true))
        $policy$, _tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 2. business_id-only isolation (tables without env_id)
DO $$
DECLARE
  _tbl text;
  _bid_type text;
BEGIN
  FOR _tbl IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns bid
      ON bid.table_schema = n.nspname
     AND bid.table_name = c.relname
     AND bid.column_name = 'business_id'
    LEFT JOIN information_schema.columns env
      ON env.table_schema = n.nspname
     AND env.table_name = c.relname
     AND env.column_name = 'env_id'
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND env.column_name IS NULL
    GROUP BY c.relname
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _tbl);

    SELECT data_type INTO _bid_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = _tbl
      AND column_name = 'business_id';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = _tbl AND policyname = 'business_isolation'
    ) THEN
      IF _bid_type = 'uuid' THEN
        EXECUTE format($policy$
          CREATE POLICY business_isolation ON public.%I
            USING (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
            WITH CHECK (business_id = NULLIF(current_setting('app.business_id', true), '')::uuid)
        $policy$, _tbl);
      ELSE
        EXECUTE format($policy$
          CREATE POLICY business_isolation ON public.%I
            USING (business_id = current_setting('app.business_id', true))
            WITH CHECK (business_id = current_setting('app.business_id', true))
        $policy$, _tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 3. Reference / internal tables (no env_id, no business_id):
--    enable RLS without a policy. service_role bypasses RLS; authenticated
--    and anon get no rows by default. If a future feature needs broader
--    access, add a targeted policy in a follow-up migration.
DO $$
DECLARE
  _tbl text;
BEGIN
  FOR _tbl IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN information_schema.columns env
      ON env.table_schema = n.nspname
     AND env.table_name = c.relname
     AND env.column_name = 'env_id'
    LEFT JOIN information_schema.columns bid
      ON bid.table_schema = n.nspname
     AND bid.table_name = c.relname
     AND bid.column_name = 'business_id'
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND env.column_name IS NULL
      AND bid.column_name IS NULL
      -- spatial_ref_sys is owned by PostGIS and rarely benefits from RLS;
      -- skip it to avoid touching extension-managed objects.
      AND c.relname <> 'spatial_ref_sys'
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _tbl);
  END LOOP;
END $$;

-- Verification (run manually):
-- SELECT COUNT(*) FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false;
-- Expected: 1 (spatial_ref_sys, intentionally skipped)
