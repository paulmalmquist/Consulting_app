-- 483_oidc_identity.sql
-- Enterprise OIDC identity (Okta + Microsoft Entra ID) plus app_role on memberships.
-- Identity tables are cross-tenant platform plumbing and live in app.* without env_id,
-- matching the precedent of app.platform_users / app.environments / app.auth_sessions.

CREATE TABLE IF NOT EXISTS app.identity_providers (
  identity_provider_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('okta','azure_ad','generic_oidc')),
  issuer text NOT NULL,
  client_id text NOT NULL,
  audience text,
  discovery_url text,
  jwks_uri text,
  enabled boolean NOT NULL DEFAULT true,
  claim_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  group_role_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_role text CHECK (default_role IS NULL OR default_role IN ('viewer','operator','finance_admin','admin')),
  last_health_check_at timestamptz,
  last_health_status text,
  last_health_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS identity_providers_kind_idx ON app.identity_providers(kind);
CREATE INDEX IF NOT EXISTS identity_providers_enabled_idx ON app.identity_providers(enabled) WHERE enabled;

CREATE TABLE IF NOT EXISTS app.external_identities (
  external_identity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_provider_id uuid NOT NULL REFERENCES app.identity_providers(identity_provider_id) ON DELETE CASCADE,
  external_subject text NOT NULL,
  email text,
  sanitized_claims jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_provider_id, external_subject)
);

CREATE INDEX IF NOT EXISTS external_identities_email_idx ON app.external_identities(lower(email));

CREATE TABLE IF NOT EXISTS app.user_identity_links (
  user_identity_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES app.platform_users(platform_user_id) ON DELETE CASCADE,
  external_identity_id uuid NOT NULL REFERENCES app.external_identities(external_identity_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_user_id, external_identity_id)
);

CREATE INDEX IF NOT EXISTS user_identity_links_user_idx ON app.user_identity_links(platform_user_id);

ALTER TABLE app.environment_memberships
  ADD COLUMN IF NOT EXISTS app_role text
  CHECK (app_role IS NULL OR app_role IN ('viewer','operator','finance_admin','admin'));

UPDATE app.environment_memberships
SET app_role = CASE role
  WHEN 'owner' THEN 'admin'
  WHEN 'admin' THEN 'admin'
  WHEN 'member' THEN 'operator'
  ELSE 'viewer'
END
WHERE app_role IS NULL;

CREATE INDEX IF NOT EXISTS environment_memberships_app_role_idx ON app.environment_memberships(app_role) WHERE app_role IS NOT NULL;

COMMENT ON TABLE app.identity_providers IS 'OIDC provider configurations (Okta, Entra, generic). Cross-tenant platform table. Owning module: backend/app/auth/.';
COMMENT ON TABLE app.external_identities IS 'IdP subjects observed via OIDC, with a sanitized whitelist of last-seen claims. Raw tokens are never persisted.';
COMMENT ON TABLE app.user_identity_links IS 'Joins platform_users to external_identities so one user can hold multiple IdP identities.';
COMMENT ON COLUMN app.environment_memberships.app_role IS 'Internal application role (viewer/operator/finance_admin/admin). Set by OIDC group mapping or admin UI. Independent of legacy role column.';
