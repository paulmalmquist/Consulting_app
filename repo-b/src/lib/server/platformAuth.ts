import type { PoolClient } from "pg";

import {
  type EnvironmentMembershipRole,
  type EnvironmentMembershipStatus,
  type EnvironmentSlug,
  environmentHomePath,
  environmentUnauthorizedPath,
  isEnvironmentSlug,
  sanitizeReturnTo,
} from "@/lib/environmentAuth";
import {
  type PlatformMembershipSummary,
  type PlatformSessionClaims,
  buildSessionExpiryTimestampSeconds,
  getSessionTtlSeconds,
  signPlatformSession,
} from "@/lib/server/sessionAuth";
import { withClient, withTransaction } from "@/lib/server/db";

type SupabaseIdentity = {
  userId: string;
  email: string;
  displayName: string | null;
};

type EnvironmentRow = {
  env_id: string;
  slug: EnvironmentSlug;
  client_name: string;
  auth_mode: "private" | "public" | "hybrid";
  business_id: string | null;
  tenant_id: string | null;
  industry: string | null;
  industry_type: string | null;
  workspace_template_key: string | null;
};

type PlatformUserRow = {
  platform_user_id: string;
  supabase_user_id: string | null;
  email: string;
  display_name: string | null;
  status: string;
};

type SessionIssueResult = {
  token: string;
  claims: PlatformSessionClaims;
  redirectTo: string;
  activeMembership: PlatformMembershipSummary;
};

type SessionIssueInput = {
  accessToken: string;
  environmentSlug?: EnvironmentSlug | null;
  returnTo?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

type MembershipUpsertInput = {
  email: string;
  environmentSlug: EnvironmentSlug;
  role: EnvironmentMembershipRole;
  status: EnvironmentMembershipStatus;
  isDefault: boolean;
};

function requireSupabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).trim();
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase auth is not configured for platform sign-in");
  }

  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function splitBootstrapEmails() {
  return new Set(
    (process.env.PLATFORM_BOOTSTRAP_ADMIN_EMAILS || "")
      .split(",")
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean),
  );
}

function splitBootstrapDomains() {
  const configured = (process.env.PLATFORM_BOOTSTRAP_ADMIN_DOMAINS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length === 0) {
    return new Set(["novendor.ai"]);
  }
  return new Set(configured);
}

function splitResumeHiddenDomains() {
  const configured = (process.env.PLATFORM_HIDE_RESUME_DOMAINS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length === 0) return new Set(["novendor.ai"]);
  return new Set(configured);
}

function extractEmailDomain(email: string) {
  const normalized = normalizeEmail(email);
  const [, domain = ""] = normalized.split("@");
  return domain.trim().toLowerCase();
}

function membershipToSummary(row: Record<string, unknown>): PlatformMembershipSummary {
  return {
    env_id: String(row.env_id),
    env_slug: String(row.env_slug) as EnvironmentSlug,
    client_name: String(row.client_name),
    role: String(row.role) as EnvironmentMembershipRole,
    status: String(row.status) as EnvironmentMembershipStatus,
    auth_mode: String(row.auth_mode || "private") as PlatformMembershipSummary["auth_mode"],
    is_default: Boolean(row.is_default),
    business_id: row.business_id ? String(row.business_id) : null,
    tenant_id: row.tenant_id ? String(row.tenant_id) : null,
    industry: row.industry ? String(row.industry) : null,
    industry_type: row.industry_type ? String(row.industry_type) : null,
    workspace_template_key: row.workspace_template_key ? String(row.workspace_template_key) : null,
  };
}

function derivePlatformAdmin(memberships: PlatformMembershipSummary[]) {
  return memberships.some((membership) => membership.status === "active" && (membership.role === "owner" || membership.role === "admin"));
}

function selectActiveMembership(
  memberships: PlatformMembershipSummary[],
  requestedSlug?: EnvironmentSlug | null,
) {
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  if (requestedSlug) {
    const explicit = activeMemberships.find((membership) => membership.env_slug === requestedSlug);
    if (explicit) return explicit;
  }
  return activeMemberships.find((membership) => membership.is_default)
    || activeMemberships[0]
    || null;
}

function returnToIsAuthorized(returnTo: string, memberships: PlatformMembershipSummary[], platformAdmin: boolean) {
  if (returnTo.startsWith("/admin") || returnTo.startsWith("/lab/system")) return platformAdmin;

  const labMatch = returnTo.match(/^\/lab\/env\/([^/]+)(?:\/|$)/);
  if (labMatch) {
    return memberships.some((membership) => membership.status === "active" && membership.env_id === labMatch[1]);
  }

  const envMatch = returnTo.match(/^\/([^/]+)(?:\/|$)/);
  if (envMatch && isEnvironmentSlug(envMatch[1])) {
    return memberships.some((membership) => membership.status === "active" && membership.env_slug === envMatch[1]);
  }

  return true;
}

function resolveSessionRedirect(args: {
  returnTo?: string | null;
  memberships: PlatformMembershipSummary[];
  activeMembership: PlatformMembershipSummary;
  platformAdmin: boolean;
  genericLogin: boolean;
}) {
  const sanitized = sanitizeReturnTo(args.returnTo);
  if (sanitized && returnToIsAuthorized(sanitized, args.memberships, args.platformAdmin)) {
    return sanitized;
  }
  if (args.genericLogin) {
    return "/app";
  }
  return environmentHomePath({
    envId: args.activeMembership.env_id,
    slug: args.activeMembership.env_slug,
    role: args.activeMembership.role,
  });
}

async function fetchSupabaseIdentity(accessToken: string): Promise<SupabaseIdentity> {
  const { url, serviceRoleKey } = requireSupabaseConfig();

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: serviceRoleKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Supabase session is invalid or expired");
  }

  const payload = await response.json() as {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };

  if (!payload.id || !payload.email) {
    throw new Error("Supabase user payload was incomplete");
  }

  const displayName =
    typeof payload.user_metadata?.full_name === "string"
      ? payload.user_metadata.full_name
      : typeof payload.user_metadata?.name === "string"
        ? payload.user_metadata.name
        : null;

  return {
    userId: payload.id,
    email: normalizeEmail(payload.email),
    displayName,
  };
}

async function loadEnvironmentBySlug(client: PoolClient, slug: EnvironmentSlug): Promise<EnvironmentRow | null> {
  const result = await client.query<EnvironmentRow>(
    `
      SELECT
        e.env_id::text,
        e.slug,
        e.client_name,
        e.auth_mode,
        e.business_id::text,
        b.tenant_id::text,
        e.industry,
        e.industry_type,
        e.workspace_template_key
      FROM app.environments e
      LEFT JOIN app.businesses b ON b.business_id = e.business_id
      WHERE e.slug = $1
      LIMIT 1
    `,
    [slug],
  );
  return result.rows[0] || null;
}

async function upsertPlatformUser(
  client: PoolClient,
  identity: SupabaseIdentity,
): Promise<PlatformUserRow> {
  const result = await client.query<PlatformUserRow>(
    `
      INSERT INTO app.platform_users (
        supabase_user_id,
        email,
        display_name,
        status
      )
      VALUES ($1::uuid, $2, $3, 'active')
      ON CONFLICT (email)
      DO UPDATE SET
        supabase_user_id = COALESCE(app.platform_users.supabase_user_id, EXCLUDED.supabase_user_id),
        display_name = COALESCE(EXCLUDED.display_name, app.platform_users.display_name),
        status = CASE
          WHEN app.platform_users.status = 'suspended' THEN app.platform_users.status
          ELSE 'active'
        END,
        updated_at = now()
      RETURNING
        platform_user_id::text,
        supabase_user_id::text,
        email,
        display_name,
        status
    `,
    [identity.userId, identity.email, identity.displayName],
  );
  return result.rows[0];
}

async function upsertPlatformUserByEmail(
  client: PoolClient,
  email: string,
): Promise<PlatformUserRow> {
  const normalizedEmail = normalizeEmail(email);
  const result = await client.query<PlatformUserRow>(
    `
      INSERT INTO app.platform_users (email, status)
      VALUES ($1, 'invited')
      ON CONFLICT (email)
      DO UPDATE SET updated_at = now()
      RETURNING
        platform_user_id::text,
        supabase_user_id::text,
        email,
        display_name,
        status
    `,
    [normalizedEmail],
  );
  return result.rows[0];
}

async function bootstrapOwnerMemberships(
  client: PoolClient,
  platformUserId: string,
  email: string,
) {
  const normalizedEmail = normalizeEmail(email);
  const emailDomain = extractEmailDomain(email);
  const shouldBootstrap =
    splitBootstrapEmails().has(normalizedEmail)
    || splitBootstrapDomains().has(emailDomain);

  if (!shouldBootstrap) return;

  await client.query(
    `
      INSERT INTO app.environment_memberships (
        platform_user_id,
        env_id,
        role,
        status,
        is_default
      )
      SELECT
        $1::uuid,
        e.env_id,
        'owner',
        'active',
        e.slug = 'hall-boys'
      FROM app.environments e
      WHERE e.slug = ANY($2::text[])
      ON CONFLICT (platform_user_id, env_id)
      DO UPDATE SET
        role = 'owner',
        status = 'active',
        updated_at = now()
    `,
    [platformUserId, ["novendor", "floyorker", "stone-pds", "meridian", "trading", "hall-boys"]],
  );

  if (splitResumeHiddenDomains().has(emailDomain)) {
    await client.query(
      `
        DELETE FROM app.environment_memberships m
        USING app.environments e
        WHERE m.env_id = e.env_id
          AND m.platform_user_id = $1::uuid
          AND e.slug = 'resume'
      `,
      [platformUserId],
    );
  }
}

async function loadMemberships(client: PoolClient, platformUserId: string) {
  const result = await client.query(
    `
      SELECT
        m.membership_id::text,
        m.platform_user_id::text,
        m.role,
        m.status,
        m.is_default,
        m.last_used_at,
        e.env_id::text,
        e.slug AS env_slug,
        e.client_name,
        e.auth_mode,
        e.business_id::text,
        b.tenant_id::text,
        e.industry,
        e.industry_type,
        e.workspace_template_key
      FROM app.environment_memberships m
      JOIN app.environments e ON e.env_id = m.env_id
      LEFT JOIN app.businesses b ON b.business_id = e.business_id
      WHERE m.platform_user_id = $1::uuid
      ORDER BY
        CASE WHEN m.is_default THEN 0 ELSE 1 END,
        m.last_used_at DESC NULLS LAST,
        e.client_name ASC
    `,
    [platformUserId],
  );

  return result.rows.map(membershipToSummary);
}

async function createAuthSessionRow(
  client: PoolClient,
  args: {
    platformUserId: string;
    activeMembership: PlatformMembershipSummary;
    userAgent?: string | null;
    ipAddress?: string | null;
  },
) {
  const result = await client.query<{ session_id: string }>(
    `
      INSERT INTO app.auth_sessions (
        platform_user_id,
        active_env_id,
        active_env_slug,
        expires_at,
        last_seen_at,
        user_agent,
        ip_address
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        now() + make_interval(secs => $4::int),
        now(),
        $5,
        $6
      )
      RETURNING session_id::text
    `,
    [
      args.platformUserId,
      args.activeMembership.env_id,
      args.activeMembership.env_slug,
      getSessionTtlSeconds(),
      args.userAgent || null,
      args.ipAddress || null,
    ],
  );
  return result.rows[0]?.session_id;
}

function buildClaims(args: {
  sessionId: string;
  user: PlatformUserRow;
  memberships: PlatformMembershipSummary[];
  activeMembership: PlatformMembershipSummary;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    v: 1,
    session_id: args.sessionId,
    platform_user_id: args.user.platform_user_id,
    supabase_user_id: args.user.supabase_user_id,
    email: args.user.email,
    display_name: args.user.display_name,
    issued_at: issuedAt,
    expires_at: buildSessionExpiryTimestampSeconds(),
    platform_admin: derivePlatformAdmin(args.memberships),
    active_env_id: args.activeMembership.env_id,
    active_env_slug: args.activeMembership.env_slug,
    active_role: args.activeMembership.role,
    memberships: args.memberships,
  } satisfies PlatformSessionClaims;
}

export async function issuePlatformSession(input: SessionIssueInput): Promise<SessionIssueResult> {
  const identity = await fetchSupabaseIdentity(input.accessToken);

  return withTransaction(async (client) => {
    const user = await upsertPlatformUser(client, identity);
    if (user.status === "suspended") {
      throw new Error("This account is suspended");
    }

    await bootstrapOwnerMemberships(client, user.platform_user_id, user.email);

    const memberships = await loadMemberships(client, user.platform_user_id);
    const explicitlyRequestedMembership = input.environmentSlug
      ? memberships.find((membership) => membership.env_slug === input.environmentSlug && membership.status === "active")
      : null;
    const activeMembership = input.environmentSlug
      ? explicitlyRequestedMembership
      : selectActiveMembership(memberships, null);

    if (!activeMembership) {
      const slug = input.environmentSlug || "novendor";
      const unauthorizedError = new Error("You do not have access to this environment");
      (unauthorizedError as Error & { redirectTo?: string }).redirectTo = environmentUnauthorizedPath(slug);
      throw unauthorizedError;
    }

    const sessionId = await createAuthSessionRow(client, {
      platformUserId: user.platform_user_id,
      activeMembership,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
    if (!sessionId) {
      throw new Error("Failed to create auth session");
    }

    await client.query(
      `
        UPDATE app.environment_memberships
        SET
          last_used_at = now(),
          updated_at = now()
        WHERE platform_user_id = $1::uuid
          AND env_id = $2::uuid
      `,
      [user.platform_user_id, activeMembership.env_id],
    );

    const claims = buildClaims({
      sessionId,
      user,
      memberships,
      activeMembership,
    });
    const token = await signPlatformSession(claims);
    const redirectTo = resolveSessionRedirect({
      returnTo: input.returnTo,
      memberships,
      activeMembership,
      platformAdmin: claims.platform_admin,
      genericLogin: !input.environmentSlug,
    });

    return {
      token,
      claims,
      redirectTo,
      activeMembership,
    };
  });
}

export async function rotatePlatformSessionEnvironment(args: {
  session: PlatformSessionClaims;
  target: { envId?: string | null; slug?: EnvironmentSlug | null };
}) {
  const membership = args.target.envId
    ? args.session.memberships.find((item) => item.env_id === args.target.envId && item.status === "active")
    : args.target.slug
      ? args.session.memberships.find((item) => item.env_slug === args.target.slug && item.status === "active")
      : null;

  if (!membership) {
    throw new Error("You do not have access to that environment");
  }

  await withClient(async (client) => {
    await client.query(
      `
        UPDATE app.auth_sessions
        SET
          active_env_id = $2::uuid,
          active_env_slug = $3,
          last_seen_at = now()
        WHERE session_id = $1::uuid
      `,
      [args.session.session_id, membership.env_id, membership.env_slug],
    );

    await client.query(
      `
        UPDATE app.environment_memberships
        SET
          last_used_at = now(),
          updated_at = now()
        WHERE platform_user_id = $1::uuid
          AND env_id = $2::uuid
      `,
      [args.session.platform_user_id, membership.env_id],
    );
  });

  const nextClaims: PlatformSessionClaims = {
    ...args.session,
    active_env_id: membership.env_id,
    active_env_slug: membership.env_slug,
    active_role: membership.role,
    issued_at: Math.floor(Date.now() / 1000),
    expires_at: buildSessionExpiryTimestampSeconds(),
  };
  const token = await signPlatformSession(nextClaims);

  return {
    token,
    claims: nextClaims,
    membership,
    redirectTo: environmentHomePath({
      envId: membership.env_id,
      slug: membership.env_slug,
      role: membership.role,
    }),
  };
}

export async function revokePlatformSession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  await withClient(async (client) => {
    await client.query(
      `
        UPDATE app.auth_sessions
        SET revoked_at = now()
        WHERE session_id = $1::uuid
      `,
      [sessionId],
    );
  });
}

export async function getAccessAdminSnapshot() {
  return withClient(async (client) => {
    const [environmentResult, membershipResult] = await Promise.all([
      client.query(
        `
          SELECT
            e.env_id::text,
            e.slug,
            e.client_name,
            e.auth_mode
          FROM app.environments e
          WHERE e.slug = ANY($1::text[])
          ORDER BY e.client_name ASC
        `,
        [["novendor", "floyorker", "trading"]],
      ),
      client.query(
        `
          SELECT
            m.membership_id::text,
            u.email,
            u.display_name,
            u.status AS user_status,
            e.env_id::text,
            e.slug AS env_slug,
            e.client_name,
            m.role,
            m.status,
            m.is_default,
            m.last_used_at,
            m.created_at,
            m.updated_at
          FROM app.environment_memberships m
          JOIN app.platform_users u ON u.platform_user_id = m.platform_user_id
          JOIN app.environments e ON e.env_id = m.env_id
          WHERE e.slug = ANY($1::text[])
          ORDER BY e.client_name ASC, u.email ASC
        `,
        [["novendor", "floyorker", "trading"]],
      ),
    ]);

    return {
      environments: environmentResult.rows,
      memberships: membershipResult.rows,
    };
  });
}

export async function upsertEnvironmentMembership(input: MembershipUpsertInput) {
  return withTransaction(async (client) => {
    const environment = await loadEnvironmentBySlug(client, input.environmentSlug);
    if (!environment) {
      throw new Error("Environment not found");
    }

    const user = await upsertPlatformUserByEmail(client, input.email);

    if (input.isDefault) {
      await client.query(
        `
          UPDATE app.environment_memberships
          SET is_default = false, updated_at = now()
          WHERE platform_user_id = $1::uuid
        `,
        [user.platform_user_id],
      );
    }

    const result = await client.query(
      `
        INSERT INTO app.environment_memberships (
          platform_user_id,
          env_id,
          role,
          status,
          is_default
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5)
        ON CONFLICT (platform_user_id, env_id)
        DO UPDATE SET
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          is_default = EXCLUDED.is_default,
          updated_at = now()
        RETURNING membership_id::text
      `,
      [user.platform_user_id, environment.env_id, input.role, input.status, input.isDefault],
    );

    return {
      membership_id: result.rows[0]?.membership_id || null,
      email: user.email,
      environment_slug: environment.slug,
      role: input.role,
      status: input.status,
      is_default: input.isDefault,
    };
  });
}
