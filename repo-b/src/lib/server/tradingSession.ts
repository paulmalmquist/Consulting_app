import { NextResponse } from "next/server";

import {
  findMembershipByEnvId,
  getActiveMembership,
  parseSessionFromRequest,
  type PlatformMembershipSummary,
} from "@/lib/server/sessionAuth";
import { loadRichMembershipByEnvId } from "@/lib/server/platformMembershipRehydrate";

export async function requireTradingMembership(
  request: Request,
  requestedEnvId?: string | null,
) {
  const session = await parseSessionFromRequest(request);
  if (!session) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }

  const slim = requestedEnvId
    ? findMembershipByEnvId(session, requestedEnvId)
    : getActiveMembership(session);

  if (!slim || slim.env_slug !== "trading" || slim.status !== "active") {
    return { error: NextResponse.json({ error: "Trading environment access required" }, { status: 403 }) };
  }

  if (!session.platform_user_id) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }

  const membership = await loadRichMembershipByEnvId(session.platform_user_id, slim.env_id);
  if (!membership) {
    return { error: NextResponse.json({ error: "Trading environment access required" }, { status: 403 }) };
  }

  if (!membership.tenant_id) {
    return { error: NextResponse.json({ error: "Trading environment tenant is not configured" }, { status: 400 }) };
  }

  return { membership: membership as PlatformMembershipSummary };
}

export function tradingWriteAllowed(role: string) {
  return role === "owner" || role === "admin" || role === "member";
}
