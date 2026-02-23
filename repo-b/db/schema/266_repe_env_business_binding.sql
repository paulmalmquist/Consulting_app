-- 266_repe_env_business_binding.sql
-- Canonical mapping from Demo Lab environment to Business OS business.

CREATE TABLE IF NOT EXISTS app.env_business_bindings (
  binding_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id       uuid NOT NULL REFERENCES app.environments(env_id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES app.businesses(business_id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (env_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'set_updated_at'
  ) THEN
    -- no-op; function name table check guard isn't reliable, fallback below
    NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'set_updated_at' AND n.nspname = 'app'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'env_business_bindings_set_updated_at'
    ) THEN
      CREATE TRIGGER env_business_bindings_set_updated_at
        BEFORE UPDATE ON app.env_business_bindings
        FOR EACH ROW
        EXECUTE FUNCTION app.set_updated_at();
    END IF;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_env_business_bindings_business_id
  ON app.env_business_bindings (business_id);
