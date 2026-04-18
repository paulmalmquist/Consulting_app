import {
  type PlatformMembershipSummary,
  type SessionPayload,
  getActiveMembership,
} from "@/lib/server/sessionAuth";
import { withClient } from "@/lib/server/db";

function rowToSummary(row: Record<string, unknown>): PlatformMembershipSummary {
  return {
    env_id: String(row.env_id),
    env_slug: String(row.env_slug) as PlatformMembershipSummary["env_slug"],
    client_name: String(row.client_name),
    role: String(row.role) as PlatformMembershipSummary["role"],
    status: String(row.status) as PlatformMembershipSummary["status"],
    auth_mode: String(row.auth_mode || "private") as PlatformMembershipSummary["auth_mode"],
    is_default: Boolean(row.is_default),
    business_id: row.business_id ? String(row.business_id) : null,
    tenant_id: row.tenant_id ? String(row.tenant_id) : null,
    industry: row.industry ? String(row.industry) : null,
    industry_type: row.industry_type ? String(row.industry_type) : null,
    workspace_template_key: row.workspace_template_key ? String(row.workspace_template_key) : null,
  };
}

export async function loadRichMembershipByEnvId(
  platformUserId: string,
  envId: string,
): Promise<PlatformMembershipSummary | null> {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          m.role,
          m.status,
          m.is_default,
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
          AND m.env_id = $2::uuid
        LIMIT 1
      `,
      [platformUserId, envId],
    );
    return result.rows[0] ? rowToSummary(result.rows[0]) : null;
  });
}

export async function loadRichMembershipsForUser(
  platformUserId: string,
): Promise<PlatformMembershipSummary[]> {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          m.role,
          m.status,
          m.is_default,
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
    return result.rows.map(rowToSummary);
  });
}

export async function getActiveRichMembership(
  session: SessionPayload | null | undefined,
): Promise<PlatformMembershipSummary | null> {
  if (!session?.platform_user_id) return null;
  const slim = getActiveMembership(session);
  if (!slim) return null;
  return loadRichMembershipByEnvId(session.platform_user_id, slim.env_id);
}
