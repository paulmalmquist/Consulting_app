-- 001_rls_helpers.sql
-- Defines RLS helper functions early so they are available to all RLS policy
-- files (305, 334, 900, 905, etc.) regardless of their numeric order.
-- The full RLS policies are applied in 900_rls.sql and 905_security_hardening.sql.

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(
      current_setting('request.jwt.claims', true)::json->>'tenant_id',
      ''
    ),
    NULLIF(
      current_setting('app.tenant_id', true),
      ''
    )
  )::uuid
$$;
