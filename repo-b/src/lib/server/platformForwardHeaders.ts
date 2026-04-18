import {
  getSessionActor,
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";
import { getActiveRichMembership } from "@/lib/server/platformMembershipRehydrate";

export async function buildPlatformSessionHeaders(request: Request) {
  const headers: Record<string, string> = {
    "x-bm-actor": await getSessionActor(request),
  };

  const session = await parseSessionFromRequest(request);
  const activeMembership = await getActiveRichMembership(session);
  if (session?.platform_user_id) {
    headers["x-bm-auth-provider"] = "platform-session";
    headers["x-bm-user-id"] = session.platform_user_id;
    headers["x-bm-platform-admin"] = String(isPlatformAdminSession(session));
  }

  if (activeMembership) {
    headers["x-bm-env-id"] = activeMembership.env_id;
    headers["x-bm-env-slug"] = activeMembership.env_slug;
    headers["x-bm-membership-role"] = activeMembership.role;
    if (activeMembership.business_id) headers["x-bm-business-id"] = activeMembership.business_id;
    if (activeMembership.tenant_id) headers["x-tenant-id"] = activeMembership.tenant_id;
  }

  return headers;
}
